#!/bin/bash
set -e
echo "=========================================================="
echo "🏛️ РАЗВЕРТЫВАНИЕ DOCGOV AUTOMATION HUB & TELEGRAM BOT"
echo "=========================================================="
if [ ! -f .env ]; then
    echo "⚙️ Создаем файл .env из .env.example..."
    cp .env.example .env
fi
echo "📦 Сборка и запуск микросервисов..."
docker compose up -d --build
echo ""
echo "=========================================================="
echo "✅ ВСЕ СЕРВИСЫ УСПЕШНО РАЗВЕРНУТЫ И ЗАПУЩЕНЫ!"
echo "=========================================================="
echo "🌐 Веб-портал:               http://localhost/"
echo "📊 Мониторинг Grafana:       http://localhost:3000/ (admin / 055541)"
echo "🛠️ Stirling-PDF Studio:     http://localhost:8080/ (admin / 055541)"
echo "🪣 MinIO S3 Консоль:         http://localhost:9001/ (admin / r055541u)"
echo "🔐 Панель NOC / Аудит:       Ключ: 055541"
echo "👤 Личный кабинет:           admin / 055541"
echo "🤖 Telegram-бот:             Активен в фоне (OCR + ЭЦП + Конвертер)"
echo "=========================================================="
