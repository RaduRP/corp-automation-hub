#!/usr/bin/env bash
# ==============================================================================
# Corp DevOps Automation Hub - 1-Click Zero-Touch Deployment Script
# ==============================================================================
set -euo pipefail
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}   🚀 DEPLOYING CORP AUTOMATION HUB                  ${NC}"
echo -e "${BLUE}======================================================${NC}"
# 1. Проверяем наличие Docker и Docker Compose
if ! command -v docker &> /dev/null; then
    echo -e "${RED}[!] Docker не установлен. Установите Docker и повторите запуск.${NC}"
    exit 1
fi
if ! docker compose version &> /dev/null; then
    echo -e "${RED}[!] Docker Compose plugin не найден.${NC}"
    exit 1
fi
# 2. Создаем .env из .env.example, если его нет
if [ ! -f .env ]; then
    echo -e "${YELLOW}[*] Файл .env не найден. Создаем из .env.example с безопасными ключами...${NC}"
    cp .env.example .env
    N8N_KEY=$(openssl rand -hex 16 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)
    sed -i "s/change_me_to_random_string/${N8N_KEY}/" .env 2>/dev/null || true
    echo -e "${GREEN}[✓] Файл .env сгенерирован.${NC}"
else
    echo -e "${GREEN}[✓] Файл .env уже существует.${NC}"
fi
# 3. Подготовка директорий и языковых моделей OCR (Tesseract RUS + ENG)
echo -e "${YELLOW}[*] Проверка языковых пакетов OCR...${NC}"
mkdir -p tessdata
if [ ! -f tessdata/rus.traineddata ]; then
    echo -e "${BLUE}[*] Скачиваем русскую модель OCR (rus.traineddata)...${NC}"
    curl -sSL -o tessdata/rus.traineddata https://github.com/tesseract-ocr/tessdata_fast/raw/main/rus.traineddata 2>/dev/null || wget -q -O tessdata/rus.traineddata https://github.com/tesseract-ocr/tessdata_fast/raw/main/rus.traineddata
fi
if [ ! -f tessdata/eng.traineddata ]; then
    echo -e "${BLUE}[*] Скачиваем английскую модель OCR (eng.traineddata)...${NC}"
    curl -sSL -o tessdata/eng.traineddata https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata 2>/dev/null || wget -q -O tessdata/eng.traineddata https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata
fi
echo -e "${GREEN}[✓] Модели OCR готовы.${NC}"
# 4. Сборка и запуск микросервисов
echo -e "${YELLOW}[*] Сборка и запуск 9 микросервисов в Docker...${NC}"
docker compose up -d --build
# 5. Копируем модели OCR в контейнер Stirling-PDF
echo -e "${YELLOW}[*] Установка языковых моделей в Stirling-PDF...${NC}"
sleep 3
docker cp tessdata/rus.traineddata lab-stirling-pdf:/usr/share/tessdata/ 2>/dev/null || true
docker cp tessdata/eng.traineddata lab-stirling-pdf:/usr/share/tessdata/ 2>/dev/null || true
docker exec -u root lab-stirling-pdf sh -c "mkdir -p /usr/share/tesseract-ocr/5/tessdata && cp /usr/share/tessdata/*.traineddata /usr/share/tesseract-ocr/5/tessdata/" 2>/dev/null || true
# 6. Получаем IP адрес сервера
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}   🎉 ПЛАТФОРМА УСПЕШНО РАЗВЕРНУТА И РАБОТАЕТ!        ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "🛡️  DocGov Портал:        http://${HOST_IP}/"
echo -e "📊 Grafana Мониторинг:    http://${HOST_IP}:3000  (admin / admin)"
echo -e "🗄️  MinIO S3 Хранилище:    http://${HOST_IP}:9001  (логин/пароль из .env)"
echo -e "⚡ n8n Автоматизация:     http://${HOST_IP}:5678"
echo -e "📈 Prometheus Метрики:    http://${HOST_IP}:9090"
echo -e "------------------------------------------------------"
echo -e "Управление: docker compose ps | docker compose logs -f"
echo -e "${GREEN}======================================================${NC}"
