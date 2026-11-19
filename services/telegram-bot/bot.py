import os
import logging
import telebot
from telebot import types
import requests
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
bot = telebot.TeleBot(TOKEN)
from telebot import apihelper
apihelper.READ_TIMEOUT = 180
apihelper.CONNECT_TIMEOUT = 60
apihelper.CUSTOM_REQUEST_TIMEOUT = 180

SIGNATURE_URL = os.getenv("SIGNATURE_URL", "http://signature-validator:8000/api/v1/verify")
STIRLING_URL = os.getenv("STIRLING_URL", "http://nginx/api/stirling")
STIRLING_KEY = os.getenv("STIRLING_API_KEY", "")
N8N_WEBHOOK = os.getenv("N8N_WEBHOOK", "http://n8n:5678/webhook/telegram-event")
user_pending_files = {}
def get_stirling_headers():
    headers = {}
    if STIRLING_KEY:
        headers["X-API-KEY"] = STIRLING_KEY
    return headers
def notify_n8n(event_type, chat_id, file_name, status_info):
    try:
        requests.post(
            N8N_WEBHOOK,
            json={
                "event": event_type,
                "chat_id": chat_id,
                "file_name": file_name,
                "status": status_info
            },
            timeout=2
        )
    except Exception:
        pass
@bot.message_handler(commands=['start', 'help'])
def send_welcome(message):
    welcome_text = (
        "🏛️ *Корпоративный Центр Документооборота (DocGov)*\n\n"
        "Приветствую, коллега! Я автоматизированный ассистент документооборота.\n\n"
        "⚡ *Доступные сервисы платформы:*\n"
        "• ✍️ *Аудит ЭЦП* — проверка валидности подписей (PAdES / APB / ГОСТ / RSA)\n"
        "• 📸 *Скан в Word (OCR)* — распознавание текста со сканов/фото в документ .docx\n"
        "• 🔄 *Конвертер* — быстрое преобразование PDF в Word (.docx) через LibreOffice\n"
        "• 🩹 *Реанимация PDF* — исправление повреждённой структуры файлов\n\n"
        "📎 *Отправьте любой документ (PDF, скан или фото), чтобы начать!*"
    )
    bot.reply_to(message, welcome_text, parse_mode='Markdown')
@bot.message_handler(content_types=['document'])
def handle_document(message):
    doc = message.document
    file_id = doc.file_id
    file_name = doc.file_name or "document.pdf"
    file_size_kb = (doc.file_size or 0) / 1024
    user_pending_files[message.chat.id] = {
        "file_id": file_id,
        "file_name": file_name,
        "is_photo": False
    }
    markup = types.InlineKeyboardMarkup(row_width=2)
    btn_verify = types.InlineKeyboardButton("✍️ Проверить ЭЦП", callback_data=f"verify_{message.chat.id}")
    btn_ocr = types.InlineKeyboardButton("📸 Скан в Word (OCR)", callback_data=f"ocr_{message.chat.id}")
    btn_convert = types.InlineKeyboardButton("🔄 В Word (.docx)", callback_data=f"convert_{message.chat.id}")
    btn_repair = types.InlineKeyboardButton("🩹 Восстановить PDF", callback_data=f"repair_{message.chat.id}")
    
    markup.add(btn_verify, btn_ocr)
    markup.add(btn_convert, btn_repair)
    bot.reply_to(
        message,
        f"📄 Получен документ: *{file_name}* ({file_size_kb:.1f} KB)\n\nВыберите операцию платформы:",
        reply_markup=markup,
        parse_mode='Markdown'
    )
@bot.message_handler(content_types=['photo'])
def handle_photo(message):
    photo = message.photo[-1]
    file_id = photo.file_id
    file_name = f"photo_{message.message_id}.jpg"
    user_pending_files[message.chat.id] = {
        "file_id": file_id,
        "file_name": file_name,
        "is_photo": True
    }
    markup = types.InlineKeyboardMarkup(row_width=2)
    btn_ocr = types.InlineKeyboardButton("📸 Распознать в Word (OCR)", callback_data=f"ocr_{message.chat.id}")
    btn_pdf = types.InlineKeyboardButton("📄 Конвертировать в PDF", callback_data=f"convert_{message.chat.id}")
    markup.add(btn_ocr, btn_pdf)
    bot.reply_to(
        message,
        "🖼 *Получено изображение/скан.*\n\nВыберите операцию платформы:",
        reply_markup=markup,
        parse_mode='Markdown'
    )
@bot.callback_query_handler(func=lambda call: True)
def callback_handler(call):
    chat_id = call.message.chat.id
    data = call.data
    if chat_id not in user_pending_files:
        bot.answer_callback_query(call.id, "Файл устарел. Отправьте документ заново.")
        return
    file_meta = user_pending_files[chat_id]
    file_id = file_meta["file_id"]
    file_name = file_meta["file_name"]
    is_photo = file_meta.get("is_photo", False)
    headers = get_stirling_headers()
    # 1. АУДИТ ЭЦП
    if data.startswith("verify_"):
        bot.answer_callback_query(call.id, "Выполняю аудит ЭЦП...")
        msg = bot.send_message(chat_id, "🔍 *Проверка криптографических атрибутов и сертификатов...*", parse_mode='Markdown')
        try:
            file_info = bot.get_file(file_id)
            file_bytes = bot.download_file(file_info.file_path)
            res = requests.post(
                SIGNATURE_URL,
                files={"file": (file_name, file_bytes, "application/pdf")},
                timeout=30
            )
            val_data = res.json()
            if not val_data.get("has_signatures"):
                bot.edit_message_text(
                    f"ℹ️ В документе *{file_name}* цифровых подписей не обнаружено.",
                    chat_id, msg.message_id, parse_mode='Markdown'
                )
                notify_n8n("verify", chat_id, file_name, "no_signatures")
                return
            all_valid = val_data.get("all_signatures_valid")
            header = "✅ *ЭЦП ПОДЛИННА — ДОКУМЕНТ ВЕРИФИЦИРОВАН*" if all_valid else "⚠️ *ВНИМАНИЕ: ПОДПИСЬ НЕДЕЙСТВИТЕЛЬНА*"
            report_lines = [header, f"📄 Документ: `{file_name}`", f"🔢 Обнаружено подписей: {val_data.get('signatures_count', 1)}\n"]
            for i, sig in enumerate(val_data.get("signatures", [])):
                status_icon = "🟢" if sig.get("intact") and sig.get("cryptographically_valid") else "🔴"
                report_lines.append(f"*{status_icon} Подпись #{i+1} ({sig.get('field_name', 'Signature')})*")
                report_lines.append(f"• Подписант: *{sig.get('signer', 'Не указан')}*")
                report_lines.append(f"• Издатель: `{sig.get('issuer', 'Не указан')}`")
                report_lines.append(f"• Целостность: {'✅ Документ не изменялся' if sig.get('intact') else '❌ Модифицирован'}")
                report_lines.append(f"• Криптография: {'✅ Математически корректна' if sig.get('cryptographically_valid') else '❌ Ошибка подписи'}")
                report_lines.append(f"• Штамп времени: `{sig.get('signing_time', 'Отсутствует')}`")
            full_report = "\n".join(report_lines)
            bot.edit_message_text(full_report, chat_id, msg.message_id, parse_mode='Markdown')
            notify_n8n("verify", chat_id, file_name, "valid" if all_valid else "invalid")
        except Exception as e:
            bot.edit_message_text(f"❌ Ошибка верификации: {str(e)}", chat_id, msg.message_id)
    # 2. СКАН В WORD (OCR)
    elif data.startswith("ocr_"):
        bot.answer_callback_query(call.id, "Запуск OCR-распознавания...")
        msg = bot.send_message(chat_id, "⏳ *Распознаю текст через Tesseract OCR и формирую Word (.docx)...*", parse_mode='Markdown')
        try:
            file_info = bot.get_file(file_id)
            file_bytes = bot.download_file(file_info.file_path)
            ext = os.path.splitext(file_name)[1].lower()
            base_name = os.path.splitext(file_name)[0]
            working_bytes = file_bytes
            working_filename = file_name
            if is_photo or ext in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp']:
                img_res = requests.post(
                    f"{STIRLING_URL}/convert/img/pdf",
                    files={"fileInput": (file_name, file_bytes, "image/jpeg" if ext in ['.jpg', '.jpeg'] else "image/png")},
                    headers=headers,
                    timeout=60
                )
                if not img_res.ok:
                    bot.edit_message_text(f"❌ Ошибка подготовки изображения: HTTP {img_res.status_code}", chat_id, msg.message_id)
                    return
                working_bytes = img_res.content
                working_filename = f"{base_name}.pdf"
            ocr_res = requests.post(
                f"{STIRLING_URL}/misc/ocr-pdf",
                files={"fileInput": (working_filename, working_bytes, "application/pdf")},
                data={"languages": "rus", "ocrType": "digitize-only"},
                headers=headers,
                timeout=180
            )
            if not ocr_res.ok:
                bot.edit_message_text(f"❌ Ошибка OCR: HTTP {ocr_res.status_code}", chat_id, msg.message_id)
                return
            ocr_pdf_bytes = ocr_res.content
            conv_res = requests.post(
                f"{STIRLING_URL}/convert/pdf/word",
                files={"fileInput": (working_filename, ocr_pdf_bytes, "application/pdf")},
                data={"outputFormat": "docx"},
                headers=headers,
                timeout=120
            )
            text_preview = ""
            try:
                txt_res = requests.post(
                    f"{STIRLING_URL}/convert/pdf/text",
                    files={"fileInput": (working_filename, ocr_pdf_bytes, "application/pdf")},
                    headers=headers,
                    timeout=30
                )
                if txt_res.ok and txt_res.text.strip():
                    raw_text = txt_res.text.strip()
                    text_preview = raw_text[:800] + ("..." if len(raw_text) > 800 else "")
            except Exception:
                pass
            out_docx_name = f"{base_name}_OCR.docx"
            if conv_res.ok:
                bot.delete_message(chat_id, msg.message_id)
                caption = "✅ *Скан успешно распознан и оформлен в документ Word!*"
                if text_preview:
                    caption += f"\n\n📝 *Фрагмент текста:*\n_{text_preview}_"
                
                if len(caption) > 1000:
                    caption = caption[:997] + "..."
                bot.send_document(
                    chat_id,
                    (out_docx_name, conv_res.content),
                    caption=caption,
                    parse_mode='Markdown'
                )
                notify_n8n("ocr", chat_id, file_name, "success")
            else:
                bot.delete_message(chat_id, msg.message_id)
                bot.send_document(
                    chat_id,
                    (f"{base_name}_searchable.pdf", ocr_pdf_bytes),
                    caption="✅ *Текст распознан!* (Сохранён как PDF с текстовым слоем)",
                    parse_mode='Markdown'
                )
                notify_n8n("ocr", chat_id, file_name, "fallback_pdf")
        except Exception as e:
            bot.edit_message_text(f"❌ Ошибка при OCR-обработке: {str(e)}", chat_id, msg.message_id)
    # 3. КОНВЕРТАЦИЯ В WORD / PDF
    elif data.startswith("convert_"):
        bot.answer_callback_query(call.id, "Запуск конвертера...")
        ext = os.path.splitext(file_name)[1].lower()
        base_name = os.path.splitext(file_name)[0]
        if is_photo or ext in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp']:
            msg = bot.send_message(chat_id, "⏳ *Конвертирую изображение в формат PDF...*", parse_mode='Markdown')
            try:
                file_info = bot.get_file(file_id)
                file_bytes = bot.download_file(file_info.file_path)
                res = requests.post(
                    f"{STIRLING_URL}/convert/img/pdf",
                    files={"fileInput": (file_name, file_bytes, "image/jpeg" if ext in ['.jpg', '.jpeg'] else "image/png")},
                    headers=headers,
                    timeout=60
                )
                if not res.ok:
                    bot.edit_message_text(f"❌ Ошибка конвертации в PDF: HTTP {res.status_code}", chat_id, msg.message_id)
                    return
                out_name = f"{base_name}.pdf"
                bot.delete_message(chat_id, msg.message_id)
                bot.send_document(
                    chat_id,
                    (out_name, res.content),
                    caption="✅ *Изображение успешно сконвертировано в PDF!*",
                    parse_mode='Markdown'
                )
                notify_n8n("convert", chat_id, file_name, "success")
            except Exception as e:
                bot.edit_message_text(f"❌ Ошибка конвертации: {str(e)}", chat_id, msg.message_id)
        else:
            msg = bot.send_message(chat_id, "⏳ *Конвертирую PDF в Word (.docx) через LibreOffice...*", parse_mode='Markdown')
            try:
                file_info = bot.get_file(file_id)
                file_bytes = bot.download_file(file_info.file_path)
                res = requests.post(
                    f"{STIRLING_URL}/convert/pdf/word",
                    files={"fileInput": (file_name, file_bytes, "application/pdf")},
                    data={"outputFormat": "docx"},
                    headers=headers,
                    timeout=120
                )
                if not res.ok:
                    bot.edit_message_text(f"❌ Ошибка конвертации: HTTP {res.status_code}", chat_id, msg.message_id)
                    return
                out_name = f"{base_name}.docx"
                bot.delete_message(chat_id, msg.message_id)
                bot.send_document(
                    chat_id,
                    (out_name, res.content),
                    caption="✅ *Файл успешно сконвертирован в формат Word (.docx)!*",
                    parse_mode='Markdown'
                )
                notify_n8n("convert", chat_id, file_name, "success")
            except Exception as e:
                bot.edit_message_text(f"❌ Ошибка конвертации: {str(e)}", chat_id, msg.message_id)
    # 4. РЕАНИМАЦИЯ / РЕМОНТ PDF
    elif data.startswith("repair_"):
        bot.answer_callback_query(call.id, "Восстанавливаю структуру PDF...")
        msg = bot.send_message(chat_id, "🩹 *Восстановление структуры PDF через QPDF/Ghostscript...*", parse_mode='Markdown')
        try:
            file_info = bot.get_file(file_id)
            file_bytes = bot.download_file(file_info.file_path)
            res = requests.post(
                f"{STIRLING_URL}/misc/repair",
                files={"fileInput": (file_name, file_bytes, "application/pdf")},
                headers=headers,
                timeout=60
            )
            if res.status_code == 422:
                bot.edit_message_text(
                    "⚠️ *Документ имеет критические структурные повреждения (E076)*\n\n"
                    "Файл повреждён настолько, что таблицы xref и объекты не подлежат автоматической починке инструментами QPDF/Ghostscript.",
                    chat_id, msg.message_id, parse_mode='Markdown'
                )
                notify_n8n("repair", chat_id, file_name, "unrepairable")
                return
            if not res.ok:
                bot.edit_message_text(f"❌ Ошибка восстановления: HTTP {res.status_code}", chat_id, msg.message_id)
                return
            out_name = f"repaired_{file_name}"
            bot.delete_message(chat_id, msg.message_id)
            bot.send_document(
                chat_id,
                (out_name, res.content),
                caption="✅ *Структура PDF успешно восстановлена и нормализована!*",
                parse_mode='Markdown'
            )
            notify_n8n("repair", chat_id, file_name, "success")
        except Exception as e:
            bot.edit_message_text(f"❌ Ошибка восстановления: {str(e)}", chat_id, msg.message_id)
if __name__ == "__main__":
    logging.info("DocGov Telegram Bot успешно запущен и слушает Telegram...")
    bot.infinity_polling(timeout=20, long_polling_timeout=20)
