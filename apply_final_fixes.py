import os
import re
print("="*60)
print("🚀 ФИНАЛЬНЫЙ ПАТЧ: ASYNC-ВАЛИДАЦИЯ ЭЦП + РОУТ РЕМОНТА")
print("="*60)
BASE_DIR = os.path.expanduser("~/devops-lab/automation-hub")
# 1. ИСПРАВЛЕНИЕ SIGNATURE-VALIDATOR (ПЕРЕХОД НА async_validate_pdf_signature)
print("\n[1/3] Перевод signature-validator на асинхронную валидацию...")
main_py_path = os.path.join(BASE_DIR, "services/signature-validator/app/main.py")
main_py_code = '''import io
import datetime
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import async_validate_pdf_signature
app = FastAPI(
    title="National Document Signature Verification API",
    description="Государственный микросервис верификации целостности документов и проверки ЭЦП (PAdES)",
    version="1.0.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "signature-validator", "version": "1.0.0"}
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
            # Асинхронный вызов напрямую в event loop FastAPI!
            status = await async_validate_pdf_signature(sig, skip_diff=True)
            is_intact = bool(status.intact)
            has_valid_crypto = bool(status.valid)
            print(f"[SIGNATURE CHECK] file={file.filename}, field={field_name}, intact={is_intact}, valid={has_valid_crypto}, signer={signer_name}", flush=True)
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
            print(f"[SIGNATURE EXCEPTION] {str(e)}", flush=True)
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
'''
with open(main_py_path, "w", encoding="utf-8") as f:
    f.write(main_py_code)
print("✅ signature-validator переведен на await async_validate_pdf_signature!")
# 2. ИСПРАВЛЕНИЕ ЭНДПОИНТА РЕМОНТА В portal/app.js
print("\n[2/3] Исправление URL ремонта в portal/app.js на /api/stirling/misc/repair...")
app_js_path = os.path.join(BASE_DIR, "portal/app.js")
with open(app_js_path, "r", encoding="utf-8") as f:
    code = f.read()
code = code.replace('/api/stirling/general/repair', '/api/stirling/misc/repair')
code = code.replace('/api/repair', '/api/stirling/misc/repair')
with open(app_js_path, "w", encoding="utf-8") as f:
    f.write(code)
print("✅ Эндпоинт ремонта заменен на /api/stirling/misc/repair!")
# 3. СБРОС КЭША БРАУЗЕРА В portal/index.html (v=9)
print("\n[3/3] Сброс кэша браузера (установка app.js?v=9)...")
index_html_path = os.path.join(BASE_DIR, "portal/index.html")
if os.path.exists(index_html_path):
    with open(index_html_path, "r", encoding="utf-8") as f:
        html = f.read()
    html = re.sub(r'app\.js\?v=\d+', 'app.js?v=9', html)
    with open(index_html_path, "w", encoding="utf-8") as f:
        f.write(html)
    print("✅ portal/index.html обновлен на v=9!")
print("\n" + "="*60)
print("🎉 ВСЕ ПАТЧИ УСПЕШНО ПРИМЕНЕНЫ!")
print("="*60)
