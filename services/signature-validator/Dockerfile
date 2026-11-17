# 1. Легковесный базовый образ Python
FROM python:3.11-slim

# 2. Переменные окружения: не писать .pyc файлы и не буферизировать вывод логов
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 3. Устанавливаем системные зависимости для криптографии
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# 4. Копируем и ставим зависимости (кэшируем слой pip!)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. Копируем код приложения
COPY app/ ./app

# 6. Запускаем от непривилегированного пользователя (Security Best Practice)
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# 7. Запуск через Uvicorn (FastAPI)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]