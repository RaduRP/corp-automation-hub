#!/usr/bin/env bash
set -euo pipefail

# 1. Настройки путей
BACKUP_DIR="/home/administrator/backups/postgres"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="${BACKUP_DIR}/n8n_db_${TIMESTAMP}.sql.gz"

# 2. Создаем папку под бэкапы, если её нет
mkdir -p "${BACKUP_DIR}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === НАЧАЛО РЕЗЕРВНОГО КОПИРОВАНИЯ ==="

# 3. Делаем дамп базы прямо из работающего контейнера и сжимаем gzip на лету
docker exec -t lab-postgres pg_dump -U n8n_admin -d n8n_database | gzip > "${BACKUP_FILE}"

# 4. Проверяем размер получившегося файла
BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Бэкап успешно создан: ${BACKUP_FILE} (Размер: ${BACKUP_SIZE})"

# 5. Ротация: удаляем архивы старше 7 дней
find "${BACKUP_DIR}" -type f -name "n8n_db_*.sql.gz" -mtime +7 -delete
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Старые бэкапы старше 7 дней очищены."
echo "[$(date '+%Y-%m-%d %H:%M:%S')] === БЭКАП ЗАВЕРШЕН УСПЕШНО ==="