import io
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko_certvalidator import ValidationContext

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
            "error": f"Не удалось прочитать PDF структуру (возможно файл поврежден): {str(e)}"
        }

    if not embedded_sigs:
        return {
            "filename": file.filename,
            "has_signatures": False,
            "message": "В документе не обнаружено электронных цифровых подписей (документ не подписан)",
            "signatures_count": 0,
            "signatures": []
        }

    validation_context = ValidationContext(allow_fetching=False)
    results = []
    all_valid = True

    for sig in embedded_sigs:
        try:
            status = validate_pdf_signature(sig, validation_context)
            is_intact = status.intact
            has_valid_crypto = status.valid

            cert = sig.signer_cert
            subject_str = cert.subject.human_friendly if cert else "Неизвестный сертификат"
            issuer_str = cert.issuer.human_friendly if cert else "Неизвестный издатель"

            sig_info = {
                "field_name": sig.field_name,
                "intact": is_intact,
                "cryptographically_valid": has_valid_crypto,
                "signer_subject": subject_str,
                "issuer": issuer_str,
                "summary": "Документ подлинный, изменений после подписания не вносилось" if is_intact else "ВНИМАНИЕ! Документ был изменен после подписания!"
            }

            if not is_intact or not has_valid_crypto:
                all_valid = False

            results.append(sig_info)

        except Exception as e:
            all_valid = False
            results.append({
                "field_name": sig.field_name,
                "error": f"Ошибка верификации подписи: {str(e)}"
            })

    return {
        "filename": file.filename,
        "has_signatures": True,
        "all_signatures_valid": all_valid,
        "signatures_count": len(embedded_sigs),
        "signatures": results
    }