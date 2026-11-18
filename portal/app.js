// DocGov Executive Platform - Client Engine
let currentMode = 'home';
let targetFormat = 'docx';
let selectedFile = null;
let lastExtractedText = '';
let currentBlobUrl = null;

// 1. НАВИГАЦИЯ И ПЕРЕКЛЮЧЕНИЕ ЭКРАНОВ
function goHome() {
    currentMode = 'home';
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('nav-btn-active'));
    const homeBtn = document.getElementById('nav-home');
    if (homeBtn) homeBtn.classList.add('nav-btn-active');

    const homeView = document.getElementById('homeView');
    const workspaceView = document.getElementById('workspaceView');
    if (homeView && workspaceView) {
        homeView.classList.remove('hidden');
        workspaceView.classList.add('hidden');
    }

    // Изоляция: очищаем старые остаточные результаты
    resetFile();
    clearResults();
}

function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('nav-btn-active'));
    const activeNav = document.getElementById('nav-' + mode);
    if (activeNav) activeNav.classList.add('nav-btn-active');

    const homeView = document.getElementById('homeView');
    const workspaceView = document.getElementById('workspaceView');
    if (homeView && workspaceView) {
        homeView.classList.add('hidden');
        workspaceView.classList.remove('hidden');
    }

    // ИЗОЛЯЦИЯ: стираем результаты предыдущей задачи при переходе!
    resetFile();
    clearResults();

    const title = document.getElementById('modeTitle');
    const desc = document.getElementById('modeDesc');
    const icon = document.getElementById('modeIcon');
    const iconBg = document.getElementById('moduleIconBg');
    const badge = document.getElementById('moduleBadge');
    const targetContainer = document.getElementById('targetFormatContainer');
    const formatOptions = document.getElementById('formatOptions');
    const dropzoneHint = document.getElementById('dropzoneHint');

    if (mode === 'verify') {
        targetContainer.classList.add('hidden');
        title.innerText = 'Верификация & Аудит ЭЦП';
        desc.innerText = 'Проверка подлинности подписи, выявление изменений в документе и аудит сертификатов';
        icon.className = 'fa-solid fa-stamp text-sky-400';
        iconBg.className = 'w-12 h-12 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center text-xl border border-sky-500/30';
        badge.className = 'text-[11px] font-bold px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/20';
        badge.innerText = 'Проверка ЭЦП';
        dropzoneHint.innerText = 'Загрузите подписанный PDF-документ для проверки подписи';
    } else if (mode === 'repair') {
        targetContainer.classList.add('hidden');
        title.innerText = 'Реанимация Поврежденных PDF';
        desc.innerText = 'Исправление битых заголовков, восстановление структуры и поврежденных данных файла';
        icon.className = 'fa-solid fa-wrench text-amber-400';
        iconBg.className = 'w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl border border-amber-500/30';
        badge.className = 'text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20';
        badge.innerText = 'Восстановление PDF';
        dropzoneHint.innerText = 'Загрузите поврежденный или не открывающийся PDF-файл';
    } else if (mode === 'ocr') {
        targetContainer.classList.remove('hidden');
        title.innerText = 'Распознавание Сканов в Word';
        desc.innerText = 'Автоматическое извлечение текста с фотографий и сканов в редактируемый документ Word';
        icon.className = 'fa-solid fa-file-word text-emerald-400';
        iconBg.className = 'w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl border border-emerald-500/30';
        badge.className = 'text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20';
        badge.innerText = 'Скан ➔ Word (.docx)';
        dropzoneHint.innerText = 'Загрузите скан, фотографию или скриншот (PNG, JPG, PDF)';
        formatOptions.innerHTML = `
            <button type="button" onclick="setTargetFormat('docx', this)" class="opt-btn opt-active px-3 py-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/20 text-emerald-300 text-xs font-semibold cursor-pointer">Документ Word (.docx)</button>
            <button type="button" onclick="setTargetFormat('txt', this)" class="opt-btn px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer">Обычный Текст (.txt)</button>
            <button type="button" onclick="setTargetFormat('pdf', this)" class="opt-btn px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer">PDF с поиском</button>
        `;
        targetFormat = 'docx';
    } else if (mode === 'convert') {
        targetContainer.classList.remove('hidden');
        title.innerText = 'Конвертер Форматов';
        desc.innerText = 'Преобразование документов между форматами PDF, Word и PowerPoint без потери разметки';
        icon.className = 'fa-solid fa-arrows-rotate text-indigo-400';
        iconBg.className = 'w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xl border border-indigo-500/30';
        badge.className = 'text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20';
        badge.innerText = 'PDF ⇄ Word / PPTX';
        dropzoneHint.innerText = 'Загрузите документ для взаимной конвертации (PDF, DOCX, PPTX)';
        formatOptions.innerHTML = `
            <button type="button" onclick="setTargetFormat('docx', this)" class="opt-btn opt-active px-3 py-1.5 rounded-lg border border-indigo-500/50 bg-indigo-500/20 text-indigo-300 text-xs font-semibold cursor-pointer">Из PDF в Word (.docx)</button>
            <button type="button" onclick="setTargetFormat('pptx', this)" class="opt-btn px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer">Из PDF в PowerPoint (.pptx)</button>
            <button type="button" onclick="setTargetFormat('pdf', this)" class="opt-btn px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer">В формат PDF</button>
        `;
        targetFormat = 'docx';
    }
    updateBtnText();
}

function setTargetFormat(fmt, el) {
    targetFormat = fmt;
    document.querySelectorAll('.opt-btn').forEach(btn => {
        btn.classList.remove('opt-active');
        btn.className = 'opt-btn px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer';
    });
    el.classList.add('opt-active');
    const color = currentMode === 'ocr' ? 'emerald' : 'indigo';
    el.className = `opt-btn opt-active px-3 py-1.5 rounded-lg border border-${color}-500/50 bg-${color}-500/20 text-${color}-300 text-xs font-semibold cursor-pointer`;
    updateBtnText();
}

// 2. ОБРАБОТКА ВЫБОРА ФАЙЛОВ И DRAG & DROP
function handleFileSelect(e) {
    if (e.target.files && e.target.files[0]) {
        setFile(e.target.files[0]);
    }
}

function setFile(file) {
    selectedFile = file;
    document.getElementById('fileNameDisplay').innerText = file.name;
    document.getElementById('fileSizeDisplay').innerText = `(${(file.size / 1024).toFixed(1)} KB)`;
    document.getElementById('fileInfoChip').classList.remove('hidden');

    const btn = document.getElementById('actionBtn');
    btn.disabled = false;
    btn.className = 'w-full py-4 rounded-xl font-bold text-sm tracking-wide text-white transition-all bg-gradient-to-r from-sky-500 via-indigo-600 to-purple-600 hover:from-sky-400 hover:to-purple-500 shadow-lg shadow-sky-500/30 btn-glow cursor-pointer';
    updateBtnText();
}

function resetFile(e) {
    if (e) e.stopPropagation();
    selectedFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('fileInfoChip').classList.add('hidden');
    const btn = document.getElementById('actionBtn');
    btn.disabled = true;
    btn.className = 'w-full py-4 rounded-xl font-bold text-sm tracking-wide text-white transition-all bg-slate-800 border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed';
    btn.innerHTML = '<i class="fa-solid fa-arrow-up-from-bracket mr-2"></i> Выберите файл для начала работы';
}

function clearResults() {
    const resultPanel = document.getElementById('resultPanel');
    if (resultPanel) resultPanel.classList.add('hidden');
    const resultBody = document.getElementById('resultBody');
    if (resultBody) resultBody.innerHTML = '';
    const downloadContainer = document.getElementById('downloadContainer');
    if (downloadContainer) downloadContainer.classList.add('hidden');
    const ocrPreview = document.getElementById('ocrPreviewContainer');
    if (ocrPreview) ocrPreview.classList.add('hidden');
    if (currentBlobUrl) {
        window.URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }
    lastExtractedText = '';
}

function updateBtnText() {
    const btn = document.getElementById('actionBtn');
    if (!selectedFile) {
        btn.innerHTML = '<i class="fa-solid fa-arrow-up-from-bracket mr-2"></i> Выберите файл для начала работы';
        return;
    }
    if (currentMode === 'verify') {
        btn.innerHTML = '<i class="fa-solid fa-stamp mr-2"></i> Проверить подлинность ЭЦП';
    } else if (currentMode === 'repair') {
        btn.innerHTML = '<i class="fa-solid fa-wrench mr-2"></i> Запустить восстановление PDF';
    } else if (currentMode === 'ocr') {
        btn.innerHTML = `<i class="fa-solid fa-file-word mr-2"></i> Распознать текст и создать .${targetFormat.toUpperCase()}`;
    } else if (currentMode === 'convert') {
        btn.innerHTML = `<i class="fa-solid fa-arrows-rotate mr-2"></i> Сконвертировать файл в .${targetFormat.toUpperCase()}`;
    }
}

// Drag & drop
window.addEventListener('load', () => {
    const dropzone = document.getElementById('dropzone');
    if (dropzone) {
        ['dragenter', 'dragover'].forEach(name => {
            dropzone.addEventListener(name, (e) => {
                e.preventDefault();
                dropzone.classList.add('drop-active');
            }, false);
        });
        ['dragleave', 'drop'].forEach(name => {
            dropzone.addEventListener(name, (e) => {
                e.preventDefault();
                dropzone.classList.remove('drop-active');
            }, false);
        });
        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files[0]) setFile(dt.files[0]);
        }, false);
    }
});

// 3. НАДЕЖНЫЙ ГЕНЕРАТОР MICROSOFT WORD (.DOCX)
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

        localHeaders.push(localHeader, dataBytes);

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        const cView = new DataView(centralHeader.buffer);
        cView.setUint32(0, 0x02014b50, true);
        cView.setUint16(4, 20, true);
        cView.setUint16(6, 20, true);
        cView.setUint16(8, 0x0800, true);
        cView.setUint16(10, 0, true);
        cView.setUint16(12, 0, true);
        cView.setUint16(14, 0, true);
        cView.setUint32(16, crc, true);
        cView.setUint32(20, size, true);
        cView.setUint32(24, size, true);
        cView.setUint16(28, nameBytes.length, true);
        cView.setUint16(30, 0, true);
        cView.setUint16(32, 0, true);
        cView.setUint16(34, 0, true);
        cView.setUint16(36, 0, true);
        cView.setUint32(38, 0, true);
        cView.setUint32(42, offset, true);
        centralHeader.set(nameBytes, 46);

        centralHeaders.push(centralHeader);
        offset += localHeader.length + dataBytes.length;
    }

    const centralDirOffset = offset;
    let centralDirSize = 0;
    for (const ch of centralHeaders) centralDirSize += ch.length;

    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(4, 0, true);
    eocdView.setUint16(6, 0, true);
    eocdView.setUint16(8, files.length, true);
    eocdView.setUint16(10, files.length, true);
    eocdView.setUint32(12, centralDirSize, true);
    eocdView.setUint32(16, centralDirOffset, true);
    eocdView.setUint16(20, 0, true);

    const allParts = [...localHeaders, ...centralHeaders, eocd];
    let totalLen = 0;
    for (const p of allParts) totalLen += p.length;

    const result = new Uint8Array(totalLen);
    let cur = 0;
    for (const p of allParts) {
        result.set(p, cur);
        cur += p.length;
    }
    return result;
}

function crc32(r) {
    let c = -1;
    for (let i = 0; i < r.length; i++) {
        c = (c >>> 8) ^ crcTable[(c ^ r[i]) & 0xFF];
    }
    return (c ^ -1) >>> 0;
}
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    crcTable[n] = c;
}

function textToDocxBlob(rawText) {
    const lines = rawText.split('\n');
    let xmlParagraphs = '';
    for (const line of lines) {
        const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        xmlParagraphs += `<w:p><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
    }

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>${xmlParagraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body>
</w:document>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

    const zipData = createPureZip([
        { name: '[Content_Types].xml', data: contentTypesXml },
        { name: '_rels/.rels', data: relsXml },
        { name: 'word/document.xml', data: documentXml },
        { name: 'word/_rels/document.xml.rels', data: wordRelsXml }
    ]);

    return new Blob([zipData], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function copyExtractedText() {
    if (!lastExtractedText) return;
    navigator.clipboard.writeText(lastExtractedText).then(() => {
        const btnText = document.getElementById('copyBtnText');
        const old = btnText.innerText;
        btnText.innerText = 'Скопировано в буфер!';
        setTimeout(() => { btnText.innerText = old; }, 2000);
    });
}

// 4. ГЛАВНЫЙ ПРОЦЕССОР ОБРАБОТКИ
async function processAction() {
    if (!selectedFile) return;
    const btn = document.getElementById('actionBtn');
    btn.disabled = true;
    btn.className = 'w-full py-4 rounded-xl font-bold text-sm tracking-wide text-white transition-all bg-slate-800 border border-slate-700 opacity-90 cursor-wait';
    btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i> Выполнение операции...';

    clearResults();

    const resultPanel = document.getElementById('resultPanel');
    const resultBody = document.getElementById('resultBody');
    const downloadContainer = document.getElementById('downloadContainer');
    const downloadBtn = document.getElementById('downloadBtn');
    const ocrPreview = document.getElementById('ocrPreviewContainer');
    const ocrText = document.getElementById('ocrTextPreview');

    resultPanel.classList.remove('hidden');

    try {
        // 1. ВЕРИФИКАЦИЯ ЭЦП
        if (currentMode === 'verify') {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const res = await fetch('/api/verify', { method: 'POST', body: formData });
            const data = await res.json();

            const isValid = data.has_signatures && data.all_signatures_valid;
            document.getElementById('resultTitle').innerText = data.has_signatures 
                ? (isValid ? 'ЭЦП подлинна — Документ легитимен' : 'Внимание: Подпись недействительна!')
                : 'В документе нет цифровых подписей';

            resultPanel.className = `hub-card p-6 border-l-4 ${isValid ? 'border-emerald-500' : (data.has_signatures ? 'border-rose-500' : 'border-amber-500')}`;
            document.getElementById('statusIconBg').className = `w-10 h-10 rounded-xl ${isValid ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'} flex items-center justify-center text-lg`;
            document.getElementById('statusIcon').className = isValid ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation';

            let sigHtml = '';
            if (data.signatures && data.signatures.length > 0) {
                sigHtml = data.signatures.map((sig, i) => `
                    <div class="bg-slate-900/80 p-3 rounded-lg border border-slate-800 mt-2 space-y-1">
                        <div class="text-sky-300 font-bold flex items-center justify-between">
                            <span>Подпись #${i+1} (${sig.field_name})</span>
                            <span class="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300">Проверено</span>
                        </div>
                        <div><strong class="text-slate-400">Подписант:</strong> <span class="text-white font-medium">${sig.signer || sig.signer_subject || 'Не указан'}</span></div>
                        <div><strong class="text-slate-400">Издатель:</strong> <span class="text-slate-300">${sig.issuer || 'Не указан'}</span></div>
                        <div><strong class="text-slate-400">Целостность:</strong> <span class="${sig.intact ? 'text-emerald-400' : 'text-rose-400'} font-semibold">${sig.intact ? 'Документ не изменялся (целостность подтверждена)' : 'Файл был модифицирован!'}</span></div>
                        <div><strong class="text-slate-400">Криптография:</strong> <span class="${sig.cryptographically_valid ? 'text-emerald-400' : 'text-rose-400'} font-semibold">${sig.cryptographically_valid ? 'Математически корректна' : 'Сбой проверки подписи'}</span></div>
                        <div><strong class="text-slate-400">Штамп времени:</strong> <span class="text-slate-300">${sig.signing_time || 'Отсутствует'}</span></div>
                    </div>
                `).join('');
            }

            resultBody.innerHTML = `
                <div><strong class="text-slate-400">Проверяемый файл:</strong> <span class="text-white">${selectedFile.name}</span></div>
                <div><strong class="text-slate-400">Обнаружено подписей:</strong> <span class="text-sky-400 font-bold">${data.signatures ? data.signatures.length : 0}</span></div>
                ${sigHtml}
            `;

        // 2. РЕАНИМАЦИЯ PDF
        } else if (currentMode === 'repair') {
            const formData = new FormData();
            formData.append('fileInput', selectedFile);

            const res = await fetch('/api/stirling/misc/repair', { method: 'POST', body: formData });
            if (!res.ok) throw new Error(`Сбой восстановления файла (${res.status})`);

            const blob = await res.blob();
            currentBlobUrl = window.URL.createObjectURL(blob);

            const repairedName = `repaired_${selectedFile.name}`;
            downloadBtn.href = currentBlobUrl;
            downloadBtn.download = repairedName;
            document.getElementById('downloadBtnText').innerText = `Скачать восстановленный файл (${repairedName})`;
            downloadContainer.classList.remove('hidden');

            document.getElementById('resultTitle').innerText = 'Файл успешно восстановлен!';
            resultPanel.className = 'hub-card p-6 border-l-4 border-amber-500';
            document.getElementById('statusIconBg').className = 'w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-lg';
            document.getElementById('statusIcon').className = 'fa-solid fa-wrench';

            resultBody.innerHTML = `
                <div><strong class="text-slate-400">Исходный файл:</strong> <span class="text-white">${selectedFile.name}</span></div>
                <div><strong class="text-slate-400">Статус:</strong> <span class="text-emerald-400 font-semibold">Структура PDF полностью перестроена и исправлена</span></div>
                <div><strong class="text-slate-400">Размер:</strong> ${(blob.size / 1024).toFixed(1)} KB</div>
            `;

        // 3. СКАН В WORD
        } else if (currentMode === 'ocr') {
            let fileForOcr = selectedFile;

            if (selectedFile.type.startsWith('image/')) {
                btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i> 1/3 Подготовка изображения...';
                const imgFormData = new FormData();
                imgFormData.append('fileInput', selectedFile);
                imgFormData.append('fitOption', 'fillPage');
                imgFormData.append('colorType', 'color');

                const imgRes = await fetch('/api/stirling/convert/img/pdf', { method: 'POST', body: imgFormData });
                if (!imgRes.ok) throw new Error('Не удалось подготовить изображение');
                const imgPdfBlob = await imgRes.blob();
                fileForOcr = new File([imgPdfBlob], 'image_converted.pdf', { type: 'application/pdf' });
            }

            btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i> 2/3 Распознавание текста (Русский + Английский)...';
            const ocrFormData = new FormData();
            ocrFormData.append('fileInput', fileForOcr);
            ocrFormData.append('languages', 'rus');
            ocrFormData.append('languages', 'eng');
            ocrFormData.append('sidecar', 'false');
            ocrFormData.append('ocrType', 'Normal');
            ocrFormData.append('ocrRenderType', 'sandwich');

            const ocrRes = await fetch('/api/stirling/misc/ocr-pdf', { method: 'POST', body: ocrFormData });
            if (!ocrRes.ok) throw new Error(`Ошибка распознавания (${ocrRes.status})`);
            const ocrPdfBlob = await ocrRes.blob();

            btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i> 3/3 Извлечение текста в документ...';
            const txtFormData = new FormData();
            const ocrFile = new File([ocrPdfBlob], 'ocr_doc.pdf', { type: 'application/pdf' });
            txtFormData.append('fileInput', ocrFile);
            txtFormData.append('inputFile', ocrFile);
            txtFormData.append('outputFormat', 'txt');
            const txtRes = await fetch('/api/stirling/convert/pdf/text', { method: 'POST', body: txtFormData });
            if (!txtRes.ok) throw new Error(`Ошибка извлечения текста (${txtRes.status})`);

            const extractedText = await txtRes.text();
            lastExtractedText = extractedText || '';

            let finalBlob = ocrPdfBlob;
            let ext = 'docx';

            if (targetFormat === 'docx') {
                btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i> Создание документа Word (.docx)...';
                finalBlob = textToDocxBlob(extractedText);
                ext = 'docx';
            } else if (targetFormat === 'txt') {
                finalBlob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
                ext = 'txt';
            } else {
                finalBlob = ocrPdfBlob;
                ext = 'pdf';
            }

            currentBlobUrl = window.URL.createObjectURL(finalBlob);
            const baseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || selectedFile.name;
            const newName = `${baseName}_word.${ext}`;

            downloadBtn.href = currentBlobUrl;
            downloadBtn.download = newName;
            document.getElementById('downloadBtnText').innerText = `Скачать готовый ${ext.toUpperCase()}-документ (${newName})`;
            downloadContainer.classList.remove('hidden');

            const charCount = extractedText.length;
            const wordCount = extractedText.trim() ? extractedText.trim().split(/\s+/).length : 0;

            ocrText.innerText = extractedText;
            ocrPreview.classList.remove('hidden');

            document.getElementById('resultTitle').innerText = 'Текст успешно распознан!';
            resultPanel.className = 'hub-card p-6 border-l-4 border-emerald-500';
            document.getElementById('statusIconBg').className = 'w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-lg';
            document.getElementById('statusIcon').className = 'fa-solid fa-file-word';

            resultBody.innerHTML = `
                <div><strong class="text-slate-400">Исходный файл:</strong> <span class="text-white">${selectedFile.name}</span></div>
                <div><strong class="text-slate-400">Распознано текста:</strong> <span class="text-emerald-400 font-semibold">${charCount} символов (${wordCount} слов)</span></div>
                <div><strong class="text-slate-400">Формат результата:</strong> <span class="text-emerald-400 font-semibold">Редактируемый файл .${ext.toUpperCase()}</span></div>
                <div><strong class="text-slate-400">Размер файла:</strong> ${(finalBlob.size / 1024).toFixed(1)} KB</div>
            `;

        // 4. КОНВЕРТЕР
        } else if (currentMode === 'convert') {
            const formData = new FormData();
            formData.append('fileInput', selectedFile);
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
            if (!res.ok) throw new Error(`Ошибка конвертации (${res.status})`);
            const blob = await res.blob();
            currentBlobUrl = window.URL.createObjectURL(blob);
            const baseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || selectedFile.name;
            const newName = `${baseName}_converted.${ext}`;
            downloadBtn.href = currentBlobUrl;
            downloadBtn.download = newName;
            document.getElementById('downloadBtnText').innerText = `Скачать сконвертированный файл (${newName})`;
            downloadContainer.classList.remove('hidden');
            document.getElementById('resultTitle').innerText = 'Конвертация успешно завершена!';
            resultPanel.className = 'hub-card p-6 border-l-4 border-indigo-500';
            document.getElementById('statusIconBg').className = 'w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center text-lg';
            document.getElementById('statusIcon').className = 'fa-solid fa-arrows-rotate';
            resultBody.innerHTML = `
                <div><strong class="text-slate-400">Исходный документ:</strong> <span class="text-white">${selectedFile.name}</span></div>
                <div><strong class="text-slate-400">Новый формат:</strong> <span class="text-emerald-400 font-semibold">.${ext.toUpperCase()}</span></div>
                <div><strong class="text-slate-400">Размер:</strong> ${(blob.size / 1024).toFixed(1)} KB</div>
            `;
        }
    } catch(e) {
        document.getElementById('resultTitle').innerText = 'Ошибка выполнения операции';
        resultPanel.className = 'hub-card p-6 border-l-4 border-rose-500';
        document.getElementById('statusIconBg').className = 'w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center text-lg';
        document.getElementById('statusIcon').className = 'fa-solid fa-triangle-exclamation';
        resultBody.innerHTML = `<span class="text-rose-400 font-bold">Сбой: ${e.message}</span>`;
    }

    btn.disabled = false;
    btn.className = 'w-full py-4 rounded-xl font-bold text-sm tracking-wide text-white transition-all bg-gradient-to-r from-sky-500 via-indigo-600 to-purple-600 hover:from-sky-400 hover:to-purple-500 shadow-lg shadow-sky-500/30 btn-glow cursor-pointer';
    updateBtnText();
}
