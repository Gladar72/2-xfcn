#!/usr/bin/env bash
# Ночная копия базы: /opt/backups/mesto-YYYY-MM-DD.sql.gz, храним 14 дней.
set -euo pipefail
mkdir -p /opt/backups
sudo docker exec supabase-db pg_dump -U postgres -d postgres --no-owner | gzip >"/opt/backups/mesto-$(date -u +%F).sql.gz"
find /opt/backups -name 'mesto-*.sql.gz' -mtime +14 -delete
