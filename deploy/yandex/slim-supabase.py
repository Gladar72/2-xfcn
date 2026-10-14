#!/usr/bin/env python3
"""
Облегчает официальный docker-compose Supabase (github.com/supabase/supabase/docker)
под «Место»: нам нужны только база, REST (PostgREST), хранилище фото, Realtime (чат)
и шлюз Kong. Остальное (Studio, логи, функции, пулер, Auth и т.д.) не используется
и съедает память. Скрипт убирает лишние сервисы и ссылки на них в depends_on.

Запуск: python3 slim-supabase.py /opt/supabase/docker/docker-compose.yml
"""
import sys
import yaml

DROP = {"studio", "analytics", "vector", "functions", "supavisor", "imgproxy", "meta", "auth"}

path = sys.argv[1]
with open(path) as f:
    doc = yaml.safe_load(f)

services = doc.get("services", {})
for name in list(services):
    if name in DROP:
        del services[name]

for name, svc in services.items():
    dep = svc.get("depends_on")
    if isinstance(dep, list):
        svc["depends_on"] = [d for d in dep if d not in DROP]
        if not svc["depends_on"]:
            del svc["depends_on"]
    elif isinstance(dep, dict):
        for d in list(dep):
            if d in DROP:
                del dep[d]
        if not dep:
            del svc["depends_on"]
    env = svc.get("environment")
    # Хранилище без imgproxy: преобразования картинок не используем.
    if name == "storage" and isinstance(env, dict):
        env["ENABLE_IMAGE_TRANSFORMATION"] = "false"
        env.pop("IMGPROXY_URL", None)
    # Kong слушает только локально — наружу его отдаёт Caddy по HTTPS.
    # Все порты — только на 127.0.0.1 (в новых версиях шлюз называется api-gw, а не kong).
    ports = svc.get("ports")
    if isinstance(ports, list):
        fixed = []
        for p in ports:
            if isinstance(p, str):
                parts = p.split(":")
                fixed.append("127.0.0.1:" + ":".join(parts[-2:]) if len(parts) >= 2 else "127.0.0.1:" + p + ":" + p.split("/")[0])
            elif isinstance(p, dict):
                p["host_ip"] = "127.0.0.1"
                fixed.append(p)
        svc["ports"] = fixed

with open(path, "w") as f:
    yaml.safe_dump(doc, f, sort_keys=False, allow_unicode=True)
print("slimmed:", ", ".join(sorted(services)))
