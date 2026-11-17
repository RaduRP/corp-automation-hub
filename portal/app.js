let currentMode = 'verify';
let targetFormat = 'docx';
let selectedFile = null;
let lastExtractedText = '';

// Чистый нативный генератор Word (.docx) из распознанного текста
function createPureZip(files) {
    const textEncoder = new TextEncoder();
    const localHeaders = [];
    const centralHeaders = [];
    let offset = 0;

    for (const file of files) {
        const nameBytes = textEncoder.encode(file.name);
        const dataBytes = typeof file.data === 'string' ? textEncoder.encode(file.data) : file.data;
        const crc = crc32(dataBytes);
        const size = dataBytes.length;

        const localHeader = new Uint8Array(30 + nameBytes.length);
        const view = new DataView(localHeader.buffer);
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 0x0800, true);
        view.setUint16(8, 0, true);
        view.setUint16(10, 0, true);
        view.setUint16(12, 0, true);
        view.setUint32(14, crc, true);
        view.setUint32(18, size, true);
        view.setUint32(22, size, true);
        view.setUint16(26, nameBytes.length, true);
        view.setUint16(28, 0, true);
        localHeader.set(nameBytes, 30);

        localHeaders.push({ header: localHeader, data: dataBytes, offset });

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        const cview = new DataView(centralHeader.buffer);
        cview.setUint32(0, 0x02014b50, true);
        cview.setUint16(4, 20, true);
        cview.setUint16(6, 20, true);
        cview.setUint16(8, 0x0800, true);
        cview.setUint16(10, 0, true);
        cview.setUint16(12, 0, true);
        cview.setUint16(14, 0, true);
        cview.setUint32(16, crc, true);
        cview.setUint32(20, size, true);
        cview.setUint32(24, size, true);
        cview.setUint16(28, nameBytes.length, true);
        cview.setUint16(30, 0, true);
        cview.setUint16(32, 0, true);
        cview.setUint16(34, 0, true);
        cview.setUint16(36, 0, true);
        cview.setUint32(38, 0, true);
        cview.setUint32(42, offset, true);
        centralHeader.set(nameBytes, 46);

        centralHeaders.push(centralHeader);
        offset += localHeader.length + dataBytes.length;
    }

    const centralDirOffset = offset;
    let centralDirSize = 0;
    for (const ch of centralHeaders) centralDirSize += ch.length;

    const eocd = new Uint8Array(22);
    const eview = new DataView(eocd.buffer);
    eview.setUint32(0, 0x06054b50, true);
    eview.setUint16(4, 0, true);
    eview.setUint16(6, 0, true);
    eview.setUint16(8, files.length, true);
    eview.setUint16(10, files.length, true);
    eview.setUint32(12, centralDirSize, true);
    eview.setUint32(16, centralDirOffset, true);
    eview.setUint16(20, 0, true);

    const totalSize = offset + centralDirSize + eocd.length;
    const result = new Uint8Array(totalSize);
    let pos = 0;
    for (const lh of localHeaders) {
        result.set(lh.header, pos);
        pos += lh.header.length;
        result.set(lh.data, pos);
        pos += lh.data.length;
    }
    for (const ch of centralHeaders) {
        result.set(ch, pos);
        pos += ch.length;
    }
    result.set(eocd, pos);
    return result;
}

function crc32(bytes) {
    let crc = -1;
    for (let i = 0; i < bytes.length; i++) {
        crc ^= bytes[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (-(crc & 1) & 0xEDB88320);
        }
    }
    return (crc ^ -1) >>> 0;
}

function textToDocxBlob(text) {
    const lines = text.split('\n');
    let paragraphs = '';
    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        const clean = line
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        paragraphs += '<w:p><w:pPr><w:spacing w:after="140" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">' + clean + '</w:t></w:r></w:p>';
    }

    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>';

    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>';

    const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:body>' + paragraphs + '<w:sectPr/></w:body></w:document>';

    const files = [
        { name: '[Content_Types].xml', data: contentTypes },
        { name: '_rels/.rels', data: rels },
        { name: 'word/document.xml', data: documentXml }
    ];

    const zipBytes = createPureZip(files);
    return new Blob([zipBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function copyExtractedText() {
    if (!lastExtractedText) return;
    navigator.clipboard.writeText(lastExtractedText).then(() => {
        const btn = document.getElementById('copyBtnText');
        if (btn) {
            btn.innerText = 'Скопировано в буфер!';
            setTimeout(() => { btn.innerText = 'Скопировать текст'; }, 2000);
        }
    }).catch(() => {
        const el = document.getElementById('ocrTextPreview');
        if (el) {
            window.getSelection().selectAllChildren(el);
            document.execCommand('copy');
        }
    });
}

function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('tab-active');
    });
    const activeTab = document.getElementById('tab-' + mode);
    if (activeTab) activeTab.classList.add('tab-active');

    const title = document.getElementById('modeTitle');
    const desc = document.getElementById('modeDesc');
    const icon = document.getElementById('modeIcon');
    const targetContainer = document.getElementById('targetFormatContainer');
    const formatOptions = document.getElementById('formatOptions');

    document.getElementById('resultPanel').classList.add('hidden');
    document.getElementById('downloadContainer').classList.add('hidden');
    document.getElementById('ocrPreviewContainer').classList.add('hidden');

    if (mode === 'verify') {
        targetContainer.classList.add('hidden');
        title.innerText = 'Перетащите документ для проверки ЭЦП';
        desc.innerText = 'Криптографический аудит, выявление фальсификаций, проверка сертификатов';
        icon.className = 'fa-solid fa-stamp';
    } else if (mode === 'repair') {
        targetContainer.classList.add('hidden');
        title.innerText = 'Перетащите поврежденный PDF для реанимации';
        desc.innerText = 'Движок QPDF восстановит таблицы xref, битые заголовки и поврежденные потоки';
        icon.className = 'fa-solid fa-wrench';
    } else if (mode === 'ocr') {
        targetContainer.classList.remove('hidden');
        title.innerText = 'Перетащите скриншот или скан для OCR';
        desc.innerText = 'Движок Tesseract распознает русский и английский текст и запишет буквами в Word или Текст';
        icon.className = 'fa-solid fa-eye';
        formatOptions.innerHTML = `
            <button type="button" onclick="setTargetFormat('docx', this)" class="opt-btn opt-active px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold">Документ Word (.docx)</button>
            <button type="button" onclick="setTargetFormat('txt', this)" class="opt-btn px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold">Чистый Текст (.txt)</button>
            <button type="button" onclick="setTargetFormat('pdf', this)" class="opt-btn px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold">Поисковый PDF</button>
        `;
        targetFormat = 'docx';
    } else if (mode === 'convert') {
        targetContainer.classList.remove('hidden');
        title.innerText = 'Универсальный конвертер форматов';
        desc.innerText = 'LibreOffice сконвертирует документ в нужный вам формат';
        icon.className = 'fa-solid fa-arrows-rotate';
        formatOptions.innerHTML = `
            <button type="button" onclick="setTargetFormat('docx', this)" class="opt-btn opt-active px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold">Из PDF в Word (.docx)</button>
            <button type="button" onclick="setTargetFormat('pptx', this)" class="opt-btn px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold">Из PDF в PowerPoint (.pptx)</button>
            <button type="button" onclick="setTargetFormat('pdf', this)" class="opt-btn px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold">В формат PDF</button>
        `;
        targetFormat = 'docx';
    }
    updateBtnText();
}

function setTargetFormat(fmt, elem) {
    targetFormat = fmt;
    document.querySelectorAll('.opt-btn').forEach(btn => btn.classList.remove('opt-active'));
    elem.classList.add('opt-active');
    updateBtnText();
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    selectedFile = file;
    document.getElementById('fileInfo').classList.remove('hidden');
    document.getElementById('fileInfo').classList.add('flex');
    document.getElementById('fileName').innerText = file.name;
    document.getElementById('fileSize').innerText = (file.size / 1024).toFixed(1) + ' KB';

    const btn = document.getElementById('actionBtn');
    btn.disabled = false;
    btn.classList.remove('bg-slate-800', 'text-slate-500', 'cursor-not-allowed');
    btn.classList.add('bg-gradient-to-r', 'from-sky-500', 'to-blue-600', 'hover:from-sky-400', 'hover:to-blue-500', 'text-white', 'cursor-pointer');
    updateBtnText();
}

function updateBtnText() {
    const btn = document.getElementById('actionBtn');
    if (!selectedFile) return;
    if (currentMode === 'verify') btn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Запустить криптографическую проверку ЭЦП';
    if (currentMode === 'repair') btn.innerHTML = '<i class="fa-solid fa-wrench"></i> Восстановить поврежденный файл (QPDF)';
    if (currentMode === 'ocr') btn.innerHTML = `<i class="fa-solid fa-eye"></i> Распознать текст и скачать как .${targetFormat.toUpperCase()}`;
    if (currentMode === 'convert') btn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Конвертировать в .${targetFormat.toUpperCase()}`;
}

async function processAction() {
    if (!selectedFile) return;
    const btn = document.getElementById('actionBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Обработка на движках платформы...';

    const resultPanel = document.getElementById('resultPanel');
    const resultBody = document.getElementById('resultBody');
    const downloadContainer = document.getElementById('downloadContainer');
    const downloadBtn = document.getElementById('downloadBtn');
    const ocrPreviewContainer = document.getElementById('ocrPreviewContainer');
    const ocrTextPreview = document.getElementById('ocrTextPreview');

    resultPanel.classList.remove('hidden');
    downloadContainer.classList.add('hidden');
    ocrPreviewContainer.classList.add('hidden');

    try {
        // 1. РЕЖИМ: ПРОВЕРКА ЭЦП
        if (currentMode === 'verify') {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const res = await fetch('/api/verify', { method: 'POST', body: formData });
            const data = await res.json();

            const isValid = data.has_signatures && data.all_signatures_valid;
            document.getElementById('resultTitle').innerText = data.has_signatures 
                ? (isValid ? 'ЭЦП ПОДЛИННАЯ. ДОКУМЕНТ ВЕРИФИЦИРОВАН' : 'ВНИМАНИЕ! ПОДПИСЬ НЕДЕЙСТВИТЕЛЬНА')
                : 'Документ проверен: ЭЦП отсутствует';
            
            resultPanel.className = 'glass-panel rounded-2xl p-6 border-l-4 ' + (isValid ? 'border-emerald-500' : (data.has_signatures ? 'border-rose-500' : 'border-sky-500'));
            document.getElementById('statusIconBg').className = 'w-12 h-12 rounded-xl flex items-center justify-center text-xl ' + (isValid ? 'bg-emerald-500/20 text-emerald-400' : (data.has_signatures ? 'bg-rose-500/20 text-rose-400' : 'bg-sky-500/20 text-sky-400'));
            document.getElementById('statusIcon').className = 'fa-solid ' + (isValid ? 'fa-check' : (data.has_signatures ? 'fa-triangle-exclamation' : 'fa-file-lines'));

            let html = `<div><strong class="text-slate-400">Файл:</strong> ${data.filename}</div>`;
            html += `<div><strong class="text-slate-400">Наличие цифровой подписи:</strong> ${data.has_signatures ? '<span class="text-emerald-400">ОБНАРУЖЕНА</span>' : '<span class="text-amber-400">НЕ НАЙДЕНА</span>'}</div>`;
            
            if (data.signatures && data.signatures.length > 0) {
                html += '<div class="mt-3 border-t border-slate-800 pt-3"><strong class="text-slate-400">Сертификаты и подписанты:</strong></div>';
                data.signatures.forEach((sig, i) => {
                    html += `
                        <div class="bg-slate-950/40 p-3 rounded-lg border border-slate-800/80 mt-2 space-y-1">
                            <div class="text-sky-300 font-bold">Подпись #${i+1} (${sig.field_name})</div>
                            <div>Статус: ${sig.intact && !sig.modification_detected ? '<span class="text-emerald-400">Целостность подтверждена</span>' : '<span class="text-rose-400">Документ изменен после подписания!</span>'}</div>
                            <div>Подписант: <span class="text-slate-200">${sig.signing_certificate ? sig.signing_certificate.subject : 'Не указан'}</span></div>
                            <div>Дата: <span class="text-slate-400">${sig.signing_time || 'Нет штампа времени'}</span></div>
                        </div>
                    `;
                });
            }
            resultBody.innerHTML = html;
        }

        // 2. РЕЖИМ: РЕМОНТ ФАЙЛОВ (QPDF)
        else if (currentMode === 'repair') {
            const formData = new FormData();
            formData.append('fileInput', selectedFile);
            formData.append('inputFile', selectedFile);

            const res = await fetch('/api/repair', { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Ошибка при выполнении операции восстановления');

            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const newName = `repaired_${selectedFile.name}`;

            downloadBtn.href = blobUrl;
            downloadBtn.download = newName;
            document.getElementById('downloadBtnText').innerText = `Скачать восстановленный файл (${newName})`;
            downloadContainer.classList.remove('hidden');

            document.getElementById('resultTitle').innerText = 'Файл успешно реанимирован!';
            resultPanel.className = 'glass-panel rounded-2xl p-6 border-l-4 border-amber-500';
            document.getElementById('statusIconBg').className = 'w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl';
            document.getElementById('statusIcon').className = 'fa-solid fa-wrench';

            resultBody.innerHTML = `
                <div><strong class="text-slate-400">Исходный файл:</strong> ${selectedFile.name}</div>
                <div><strong class="text-slate-400">Движок:</strong> QPDF Reconstruction Engine</div>
                <div><strong class="text-slate-400">Статус:</strong> <span class="text-emerald-400">Структура PDF восстановлена. Готов к скачиванию!</span></div>
                <div><strong class="text-slate-400">Размер:</strong> ${(blob.size / 1024).toFixed(1)} KB</div>
            `;
        }

        // 3. РЕЖИМ: СКРИНШОТ / OCR
        else if (currentMode === 'ocr') {
            let fileToProcess = selectedFile;
            const isImg = selectedFile.type.startsWith('image/') || /\.(png|jpe?g|bmp|webp)$/i.test(selectedFile.name);

            // Шаг 1: если загружена картинка/скриншот — упаковываем в PDF
            if (isImg) {
                btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> 1/3 Подготовка скриншота к распознаванию...';
                const imgFormData = new FormData();
                imgFormData.append('fileInput', selectedFile);
                imgFormData.append('inputFile', selectedFile);
                imgFormData.append('fitOption', 'maintainAspectRatio');
                const imgRes = await fetch('/api/stirling/convert/img/pdf', { method: 'POST', body: imgFormData });
                if (!imgRes.ok) throw new Error('Не удалось подготовить изображение к распознаванию');
                fileToProcess = await imgRes.blob();
            }

            // Шаг 2: оптическое распознавание Tesseract (RUS + ENG)
            btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> 2/3 Оптическое распознавание (OCR RUS + ENG)...';
            const ocrFormData = new FormData();
            ocrFormData.append('fileInput', fileToProcess, 'document.pdf');
            ocrFormData.append('inputFile', fileToProcess, 'document.pdf');
            ocrFormData.append('languages', 'rus');
            ocrFormData.append('languages', 'eng');
            ocrFormData.append('ocrType', 'force-ocr');
            ocrFormData.append('ocrRenderType', 'sandwich');

            const ocrRes = await fetch('/api/stirling/misc/ocr-pdf', { method: 'POST', body: ocrFormData });
            if (!ocrRes.ok) {
                const err = await ocrRes.text();
                throw new Error(`Ошибка OCR (${ocrRes.status}): ${err || ocrRes.statusText}`);
            }
            const ocrPdfBlob = await ocrRes.blob();

            // Шаг 3: извлечение чистого распознанного текста (передаем inputFile и outputFormat=txt)
            btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> 3/3 Извлечение распознанного текста...';
            const textFormData = new FormData();
            textFormData.append('inputFile', ocrPdfBlob, 'document.pdf');
            textFormData.append('fileInput', ocrPdfBlob, 'document.pdf');
            textFormData.append('outputFormat', 'txt');

            const textRes = await fetch('/api/stirling/convert/pdf/text', { method: 'POST', body: textFormData });
            if (!textRes.ok) {
                const err = await textRes.text();
                throw new Error(`Ошибка извлечения текста (${textRes.status}): ${err || textRes.statusText}`);
            }
            const extractedText = await textRes.text();
            lastExtractedText = extractedText || '';

            let finalBlob = ocrPdfBlob;
            let ext = 'pdf';

            // Формирование файла в зависимости от выбора
            if (targetFormat === 'docx') {
                btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Генерация чистого документа Word с текстом...';
                finalBlob = textToDocxBlob(extractedText);
                ext = 'docx';
            } else if (targetFormat === 'txt') {
                finalBlob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
                ext = 'txt';
            } else if (targetFormat === 'pdf') {
                finalBlob = ocrPdfBlob;
                ext = 'pdf';
            }

            const blobUrl = window.URL.createObjectURL(finalBlob);
            const baseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || selectedFile.name;
            const newName = `${baseName}_ocr.${ext}`;

            downloadBtn.href = blobUrl;
            downloadBtn.download = newName;
            document.getElementById('downloadBtnText').innerText = `Скачать готовый ${ext.toUpperCase()} (${newName})`;
            downloadContainer.classList.remove('hidden');

            // Показываем блок предпросмотра текста
            ocrTextPreview.innerText = extractedText;
            ocrPreviewContainer.classList.remove('hidden');

            document.getElementById('resultTitle').innerText = 'Распознавание OCR успешно завершено!';
            resultPanel.className = 'glass-panel rounded-2xl p-6 border-l-4 border-emerald-500';
            document.getElementById('statusIconBg').className = 'w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl';
            document.getElementById('statusIcon').className = 'fa-solid fa-eye';

            const charCount = extractedText ? extractedText.length : 0;
            const wordCount = extractedText ? extractedText.trim().split(/\s+/).filter(Boolean).length : 0;

            resultBody.innerHTML = `
                <div><strong class="text-slate-400">Файл:</strong> ${selectedFile.name}</div>
                <div><strong class="text-slate-400">Движок OCR:</strong> Tesseract Engine (RUS + ENG)</div>
                <div><strong class="text-slate-400">Распознано:</strong> <span class="text-emerald-400">${charCount} символов, ${wordCount} слов</span></div>
                <div><strong class="text-slate-400">Результат:</strong> <span class="text-emerald-400">Экспортирован реальный редактируемый текст в .${ext.toUpperCase()}</span></div>
                <div><strong class="text-slate-400">Размер:</strong> ${(finalBlob.size / 1024).toFixed(1)} KB</div>
            `;
        }

        // 4. РЕЖИМ: КОНВЕРТЕР ФОРМАТОВ
        else if (currentMode === 'convert') {
            const formData = new FormData();
            formData.append('fileInput', selectedFile);
            formData.append('inputFile', selectedFile);

            let endpoint = '/api/stirling/convert/file/pdf';
            let ext = 'pdf';

            if (targetFormat === 'docx') {
                endpoint = '/api/stirling/convert/pdf/word';
                formData.append('outputFormat', 'docx');
                ext = 'docx';
            } else if (targetFormat === 'pptx') {
                endpoint = '/api/stirling/convert/pdf/presentation';
                formData.append('outputFormat', 'pptx');
                ext = 'pptx';
            }

            const res = await fetch(endpoint, { method: 'POST', body: formData });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Ошибка конвертации (${res.status}): ${err || res.statusText}`);
            }
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const baseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || selectedFile.name;
            const newName = `${baseName}_converted.${ext}`;

            downloadBtn.href = blobUrl;
            downloadBtn.download = newName;
            document.getElementById('downloadBtnText').innerText = `Скачать сконвертированный файл (${newName})`;
            downloadContainer.classList.remove('hidden');

            document.getElementById('resultTitle').innerText = 'Конвертация успешно завершена!';
            resultPanel.className = 'glass-panel rounded-2xl p-6 border-l-4 border-indigo-500';
            document.getElementById('statusIconBg').className = 'w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xl';
            document.getElementById('statusIcon').className = 'fa-solid fa-arrows-rotate';

            resultBody.innerHTML = `
                <div><strong class="text-slate-400">Исходный документ:</strong> ${selectedFile.name}</div>
                <div><strong class="text-slate-400">Движок:</strong> LibreOffice Enterprise Converter</div>
                <div><strong class="text-slate-400">Новый формат:</strong> <span class="text-emerald-400">.${ext.toUpperCase()}</span></div>
                <div><strong class="text-slate-400">Размер:</strong> ${(blob.size / 1024).toFixed(1)} KB</div>
            `;
        }
    } catch(e) {
        document.getElementById('resultTitle').innerText = 'Ошибка выполнения операции';
        resultPanel.className = 'glass-panel rounded-2xl p-6 border-l-4 border-rose-500';
        document.getElementById('statusIconBg').className = 'w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-xl';
        document.getElementById('statusIcon').className = 'fa-solid fa-triangle-exclamation';
        resultBody.innerHTML = `<span class="text-rose-400 font-bold">Сбой: ${e.message}</span>`;
    }

    btn.disabled = false;
    updateBtnText();
}
EOF