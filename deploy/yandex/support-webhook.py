#!/usr/bin/env python3
"""Repair Telegram ingress through the existing MESTO relay host. Never drop updates.

Only public status metadata is logged. Tokens and user messages stay on the server.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def read_env(path):
    values = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.strip().split("=", 1)
            values[key] = value.strip('"').strip("'")
    return values


def main():
    env = read_env(sys.argv[1])
    root = env.get("TELEGRAM_API_ROOT", "").rstrip("/")
    # This is an existing MESTO deployment, not an arbitrary forwarding destination.
    if root != "https://tg.mesto-go.ru/api/telegram/relay":
        raise RuntimeError("Unexpected Telegram relay; no routing changes made")
    token = env.get("TELEGRAM_BOT_TOKEN", "")
    secret = env.get("TELEGRAM_WEBHOOK_SECRET", "")
    if not token or not secret:
        raise RuntimeError("Telegram configuration is incomplete")

    def api(method, fields=None):
        data = urllib.parse.urlencode(fields).encode() if fields is not None else None
        # Only idempotent configuration/read calls are retried, never sendMessage.
        for attempt in range(3):
            try:
                with urllib.request.urlopen(f"{root}/bot{token}/{method}", data=data, timeout=25) as res:
                    result = json.load(res)
                if not result.get("ok"):
                    raise RuntimeError("Telegram rejected configuration/read request")
                return result["result"]
            except (urllib.error.URLError, TimeoutError):
                if attempt == 2:
                    raise RuntimeError("Telegram relay unavailable") from None

    info = api("getWebhookInfo")
    pending = info.get("pending_update_count", 0)
    print(f"Before repair: pending={pending}; recent_connection_error={bool(info.get('last_error_message'))}", flush=True)
    target = "https://tg.mesto-go.ru/api/telegram/webhook"
    if info.get("url") != target:
        if not pending or "timed out" not in info.get("last_error_message", "").lower():
            print("No queued connection timeout; current webhook preserved", flush=True)
            return
        # Ensure the proxy still forwards to the protected application route.
        probe = urllib.request.Request(target, data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(probe, timeout=25) as response:
                status = response.status
        except urllib.error.HTTPError as error:
            status = error.code
        if status != 401:
            raise RuntimeError("Protected proxy route not verified; webhook unchanged")
        api("setWebhook", {"url": target, "secret_token": secret, "drop_pending_updates": "false"})
        path = Path(sys.argv[1])
        lines = [line for line in path.read_text().splitlines() if not line.startswith("TELEGRAM_WEBHOOK_URL=")]
        lines.append(f"TELEGRAM_WEBHOOK_URL={target}")
        temporary = path.with_name(path.name + ".webhook.tmp")
        with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as file:
            file.write("\n".join(lines) + "\n")
        os.replace(temporary, path)
        print("Webhook uses the existing MESTO proxy; authentication retained; queue retained", flush=True)
    for _ in range(6):
        info = api("getWebhookInfo")
        pending = info.get("pending_update_count", 0)
        print(f"Webhook queue: {pending}", flush=True)
        if pending == 0:
            result = subprocess.run([
                "sudo", "docker", "exec", "supabase-db", "psql", "-U", "postgres", "-d", "postgres", "-tAc",
                "select coalesce((select admin_telegram_message_id is not null from support_tickets "
                "where admin_replied_at > now() - interval '2 hours' order by admin_replied_at desc limit 1), false)",
            ], check=True, capture_output=True, text=True)
            print("Latest recent support reply confirmed by Telegram: " + ("yes" if result.stdout.strip() == "t" else "no"), flush=True)
            return
        time.sleep(5)
    raise RuntimeError("Webhook queue still pending; delivery not confirmed")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # URLError text can contain a token-bearing URL: print only our safe messages.
        print(str(error) if type(error) is RuntimeError else "Support webhook diagnostic failed", flush=True)
        sys.exit(1)
