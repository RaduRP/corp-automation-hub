import io
import os
import json
import time
import base64
import hmac
import hashlib
import binascii
from typing import Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Header, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncpg
from minio import Minio
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import async_validate_pdf_signature
PG_HOST = os.getenv("POSTGRES_HOST", "postgres-db")
PG_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
PG_USER = os.getenv("POSTGRES_USER", "n8n_admin")
PG_PASS = os.getenv("POSTGRES_PASSWORD", "SuperSecretPass2026!")
PG_DB = os.getenv("POSTGRES_DB", "n8n_database")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minio_admin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "SuperMinioSecret2026!")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "docgov-vault")
JWT_SECRET = os.getenv("JWT_SECRET", "docgov-corporate-vault-jwt-key-2026!")
db_pool: Optional[asyncpg.Pool] = None
minio_client: Optional[Minio] = None
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return binascii.hexlify(salt).decode("ascii") + ":" + binascii.hexlify(dk).decode("ascii")
def verify_password(stored_hash: str, password: str) -> bool:
    try:
        salt_hex, dk_hex = stored_hash.split(":")
        salt = binascii.unhexlify(salt_hex.encode("ascii"))
        expected_dk = binascii.unhexlify(dk_hex.encode("ascii"))
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
        return hashlib.sha256(dk).digest() == hashlib.sha256(expected_dk).digest()
    except Exception:
        return False
def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")
def b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)
def create_jwt(payload: dict, expires_in: int = 86400 * 7) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = payload.copy()
    payload["exp"] = int(time.time()) + expires_in
    hdr_b64 = b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{hdr_b64}.{payload_b64}".encode()
    signature = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256).digest()
    sig_b64 = b64url_encode(signature)
    return f"{hdr_b64}.{payload_b64}.{sig_b64}"
def verify_jwt(token: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        hdr_b64, payload_b64, sig_b64 = parts
        signing_input = f"{hdr_b64}.{payload_b64}".encode()
        expected_sig = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(b64url_encode(expected_sig), sig_b64):
            return None
        payload = json.loads(b64url_decode(payload_b64).decode())
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None
@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool, minio_client
    try:
        db_pool = await asyncpg.create_pool(
            host=PG_HOST, port=PG_PORT, user=PG_USER, password=PG_PASS, database=PG_DB,
            min_size=2, max_size=10
        )
        print("✅ Успешное подключение к PostgreSQL")
    except Exception as e:
        print("⚠️ Ошибка подключения к PostgreSQL:", e)
    try:
        minio_client = Minio(
            MINIO_ENDPOINT, access_key=MINIO_ACCESS_KEY, secret_key=MINIO_SECRET_KEY, secure=False
        )
        if not minio_client.bucket_exists(MINIO_BUCKET):
            minio_client.make_bucket(MINIO_BUCKET)
            print(f"✅ Создан S3 бакет '{MINIO_BUCKET}'")
    except Exception as e:
        print("⚠️ Ошибка подключения к MinIO:", e)
    yield
    if db_pool:
        await db_pool.close()
app = FastAPI(
    title="DocGov National Enterprise API",
    description="Единая государственная платформа документооборота",
    version="2.5.0",
    lifespan=lifespan
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    token = authorization.split(" ")[1]
    payload = verify_jwt(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Недействительный токен")
    return payload
@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "docgov-core-api"}
@app.post("/api/v1/verify")
async def verify_signature(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Поддерживаются только файлы формата PDF")
    contents = await file.read()
    pdf_stream = io.BytesIO(contents)
    try:
        reader = PdfFileReader(pdf_stream)
        embedded_sigs = reader.embedded_signatures
    except Exception as e:
        return {
            "is_valid": False,
            "has_signatures": False,
            "error": f"Не удалось прочитать PDF структуру: {str(e)}"
        }
    if not embedded_sigs:
        return {
            "filename": file.filename,
            "has_signatures": False,
            "message": "В документе не обнаружено электронных цифровых подписей (документ не подписан)",
            "signatures_count": 0,
            "signatures": []
        }
    results = []
    all_valid = True
    for sig in embedded_sigs:
        field_name = getattr(sig, 'field_name', 'Signature')
        signer_name = "Не указан"
        issuer_name = "Неизвестный издатель"
        signing_time_str = "Отсутствует"
        cert = getattr(sig, 'signer_cert', None)
        if cert:
            try:
                native_subj = cert.subject.native
                if isinstance(native_subj, dict):
                    common_name = native_subj.get('common_name')
                    surname = native_subj.get('surname')
                    given_name = native_subj.get('given_name')
                    if common_name:
                        signer_name = str(common_name)
                    elif surname or given_name:
                        signer_name = f"{surname or ''} {given_name or ''}".strip()
                    else:
                        signer_name = cert.subject.human_friendly
                else:
                    signer_name = cert.subject.human_friendly
            except Exception:
                try:
                    signer_name = cert.subject.human_friendly
                except Exception:
                    signer_name = "Не указан"
            try:
                native_issuer = cert.issuer.native
                if isinstance(native_issuer, dict):
                    issuer_name = native_issuer.get('common_name') or cert.issuer.human_friendly
                else:
                    issuer_name = cert.issuer.human_friendly
            except Exception:
                try:
                    issuer_name = cert.issuer.human_friendly
                except Exception:
                    issuer_name = "Неизвестный издатель"
        try:
            raw_time = getattr(sig, 'self_reported_timestamp', None)
            if raw_time:
                signing_time_str = raw_time.strftime("%d.%m.%Y %H:%M:%S")
        except Exception:
            pass
        try:
            # АСИНХРОННЫЙ ВЫЗОВ (исправление RuntimeWarning!)
            status = await async_validate_pdf_signature(sig, skip_diff=True)
            is_intact = bool(status.intact)
            has_valid_crypto = bool(status.valid)
            sig_valid = is_intact and has_valid_crypto
            if not sig_valid:
                all_valid = False
            results.append({
                "field_name": field_name,
                "signer": signer_name,
                "signer_subject": signer_name,
                "issuer": issuer_name,
                "signing_time": signing_time_str,
                "intact": is_intact,
                "cryptographically_valid": has_valid_crypto,
                "summary": "Документ подлинный, изменений после подписания не вносилось" if is_intact else "ВНИМАНИЕ! Документ был изменен после подписания!"
            })
        except Exception as e:
            all_valid = False
            results.append({
                "field_name": field_name,
                "signer": signer_name,
                "signer_subject": signer_name,
                "issuer": issuer_name,
                "signing_time": signing_time_str,
                "intact": False,
                "cryptographically_valid": False,
                "error": f"Ошибка проверки подписи: {str(e)}"
            })
    return {
        "filename": file.filename,
        "has_signatures": True,
        "all_signatures_valid": all_valid,
        "signatures_count": len(embedded_sigs),
        "signatures": results
    }
class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    email: Optional[str] = None
class LoginRequest(BaseModel):
    username: str
    password: str
@app.post("/api/auth/register")
async def register(req: RegisterRequest):
    if not db_pool:
        raise HTTPException(status_code=503, detail="База данных временно недоступна")
    username = req.username.strip().lower()
    pwd_hash = hash_password(req.password)
    full_name = req.full_name or username.capitalize()
    async with db_pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE username = $1", username)
        if existing:
            raise HTTPException(status_code=400, detail="Пользователь уже существует")
        user_id = await conn.fetchval(
            """INSERT INTO users (username, email, password_hash, full_name) 
               VALUES ($1, $2, $3, $4) RETURNING id""",
            username, req.email, pwd_hash, full_name
        )
    token = create_jwt({"sub": user_id, "username": username, "full_name": full_name})
    return {"success": True, "token": token, "user": {"id": user_id, "username": username, "full_name": full_name}}
@app.post("/api/auth/login")
async def login(req: LoginRequest):
    if not db_pool:
        raise HTTPException(status_code=503, detail="База данных временно недоступна")
    username = req.username.strip().lower()
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT id, username, password_hash, full_name, email FROM users WHERE username = $1", username)
    if not row or not verify_password(row["password_hash"], req.password):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    token = create_jwt({"sub": row["id"], "username": row["username"], "full_name": row["full_name"]})
    return {"success": True, "token": token, "user": {"id": row["id"], "username": row["username"], "full_name": row["full_name"]}}
@app.get("/api/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {"user": user}
@app.get("/api/user/documents")
async def list_user_documents(user: dict = Depends(get_current_user)):
    if not db_pool:
        raise HTTPException(status_code=503, detail="База данных недоступна")
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, filename, operation_type, status_verdict, file_size_bytes, s3_key, meta_info, created_at FROM user_documents WHERE user_id = $1 ORDER BY created_at DESC",
            user["sub"]
        )
    docs = []
    total_bytes = 0
    for r in rows:
        d = dict(r)
        d["created_at"] = r["created_at"].strftime("%d.%m.%Y %H:%M")
        docs.append(d)
        total_bytes += (r["file_size_bytes"] or 0)
    return {"documents": docs, "total_count": len(docs), "total_size_mb": round(total_bytes / (1024 * 1024), 2)}
@app.post("/api/user/documents/save")
async def save_user_document(
    file: UploadFile = File(...),
    operation_type: str = Form(...),
    status_verdict: Optional[str] = Form("COMPLETED"),
    meta_info: Optional[str] = Form("{}"),
    user: dict = Depends(get_current_user)
):
    if not minio_client or not db_pool:
        raise HTTPException(status_code=503, detail="Хранилище недоступно")
    contents = await file.read()
    file_size = len(contents)
    user_id = user["sub"]
    timestamp = int(time.time())
    safe_filename = "".join(c for c in file.filename if c.isalnum() or c in "._- ")
    s3_key = f"users/{user_id}/{timestamp}_{safe_filename}"
    try:
        minio_client.put_object(
            bucket_name=MINIO_BUCKET, object_name=s3_key, data=io.BytesIO(contents),
            length=file_size, content_type=file.content_type or "application/octet-stream"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка S3: {str(e)}")
    async with db_pool.acquire() as conn:
        doc_id = await conn.fetchval(
            """INSERT INTO user_documents (user_id, filename, operation_type, status_verdict, file_size_bytes, s3_key, meta_info)
               VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id""",
            user_id, file.filename, operation_type, status_verdict, file_size, s3_key, meta_info
        )
    return {"success": True, "doc_id": doc_id, "s3_key": s3_key, "filename": file.filename}
@app.get("/api/user/documents/{doc_id}/download")
async def download_user_document(doc_id: int, token: Optional[str] = None, authorization: Optional[str] = Header(None)):
    eff_token = authorization.split(" ")[1] if (authorization and authorization.startswith("Bearer ")) else token
    if not eff_token:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    user = verify_jwt(eff_token)
    if not user:
        raise HTTPException(status_code=401, detail="Недействительный токен")
    async with db_pool.acquire() as conn:
        doc = await conn.fetchrow("SELECT filename, s3_key, file_size_bytes FROM user_documents WHERE id = $1 AND user_id = $2", doc_id, user["sub"])
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    s3_obj = minio_client.get_object(MINIO_BUCKET, doc["s3_key"])
    encoded_filename = doc['filename'].encode('utf-8').decode('latin-1', 'ignore')
    return StreamingResponse(s3_obj, media_type="application/octet-stream", headers={
        "Content-Disposition": f'attachment; filename="{encoded_filename}"',
        "Content-Length": str(doc["file_size_bytes"])
    })
@app.delete("/api/user/documents/{doc_id}")
async def delete_user_document(doc_id: int, user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        doc = await conn.fetchrow("SELECT s3_key FROM user_documents WHERE id = $1 AND user_id = $2", doc_id, user["sub"])
        if not doc:
            raise HTTPException(status_code=404, detail="Документ не найден")
        await conn.execute("DELETE FROM user_documents WHERE id = $1", doc_id)
    try:
        minio_client.remove_object(MINIO_BUCKET, doc["s3_key"])
    except Exception:
        pass
    return {"success": True, "deleted_id": doc_id}

# =================================================================
# NOC TELEMETRY & USER MANAGEMENT API
# =================================================================
@app.get("/api/admin/users")
@app.get("/api/user/admin/users")
async def get_all_users_admin():
    if not db_pool:
        raise HTTPException(status_code=503, detail="БД недоступна")
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT u.id, u.username, COALESCE(u.email, '—') as email, 
                   COALESCE(u.full_name, u.username) as full_name,
                   COUNT(d.id) as docs_count
            FROM users u
            LEFT JOIN documents d ON d.user_id = u.id
            GROUP BY u.id, u.username, u.email, u.full_name
            ORDER BY u.id ASC
        """)
        users = [dict(r) for r in rows]
        return {"success": True, "users": users, "total": len(users)}

@app.post("/api/admin/users/{user_id}/reset-password")
@app.post("/api/user/admin/users/{user_id}/reset-password")
async def admin_reset_user_password(user_id: int, req: dict):
    new_password = req.get("new_password")
    if not new_password or len(new_password) < 4:
        raise HTTPException(status_code=400, detail="Пароль должен быть от 4 символов")
    pwd_hash = hash_password(new_password)
    async with db_pool.acquire() as conn:
        res = await conn.execute("UPDATE users SET password_hash = $1 WHERE id = $2", pwd_hash, user_id)
        if "UPDATE 0" in res:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        return {"success": True, "message": f"Пароль пользователя ID {user_id} обновлен"}

@app.delete("/api/admin/users/{user_id}")
@app.delete("/api/user/admin/users/{user_id}")
async def admin_delete_user(user_id: int):
    async with db_pool.acquire() as conn:
        res = await conn.execute("DELETE FROM users WHERE id = $1", user_id)
        if "DELETE 0" in res:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        return {"success": True, "message": f"Пользователь ID {user_id} удален"}
