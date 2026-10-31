#!/usr/bin/env python3
"""Resolve one recent event's organizer and optionally warn them once.

No account identifiers, profile records, secrets or Telegram responses in CI
logs. Delivery receipts stay on the server. This never changes event status.
"""
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request


def query(sql):
    result = subprocess.run(
        ["sudo", "docker", "exec", "-i", "supabase-db", "psql", "-U", "postgres", "-d", "postgres", "-tA", "-v", "ON_ERROR_STOP=1"],
        input=sql, text=True, capture_output=True, check=False,
    )
    if result.returncode:
        raise RuntimeError("Database read failed; no notification sent")
    return json.loads(result.stdout.strip())


def notice_text(title):
    return (
        f"Привет! Это МЕСТО 💜\n\nВ твоём профиле нет фотографии, а встреча «{title}» опубликована открыто. "
        "Пожалуйста, добавь своё фото в профиле: другим людям важно видеть, кто приглашает их на встречу. "
        "Без фотографии меньше шансов получить отклики.\n\n"
        "Если фото не появится, мы удалим это событие. Добавить фото можно по кнопке ниже."
    )


def main():
    title = base64.b64decode(sys.argv[1], validate=True).decode("utf-8").strip()
    mode = sys.argv[2]
    if mode not in {"preview", "send"} or not 2 <= len(title) <= 100:
        raise RuntimeError("Invalid notice request")
    # Encode the SQL literal; never interpolate caller-provided SQL or shell.
    title_hex = title.encode("utf-8").hex()
    rows = query(f"""
      select coalesce(json_agg(row_to_json(candidate)), '[]'::json) from (
        select e.id, e.title, e.is_anonymous, e.status, e.created_at,
               u.id as user_id, u.telegram_id, u.avatar_url
        from events e join users u on u.id=e.organizer_id
        where lower(btrim(e.title))=lower(convert_from(decode('{title_hex}','hex'),'UTF8'))
          and e.created_at > now()-interval '7 days'
        order by e.created_at desc limit 10
      ) candidate;
    """)
    print(json.dumps({"matching_recent_events": len(rows)}, ensure_ascii=False), flush=True)
    if len(rows) != 1:
        raise RuntimeError("Recipient not uniquely resolved; no notification sent")
    row = rows[0]
    has_photo = bool((row.get("avatar_url") or "").strip())
    eligible = not row.get("is_anonymous") and row["status"] in {"published", "closed"} and not has_photo and bool(row.get("telegram_id"))
    print(json.dumps({"unique_organizer_resolved": True, "has_profile_photo": has_photo, "anonymous": bool(row.get("is_anonymous")), "event_status": row["status"], "eligible_for_notice": eligible}, ensure_ascii=False), flush=True)
    if mode == "preview" or not eligible:
        print("Preview only; no notification sent" if mode == "preview" else "Event is not eligible; no notification sent")
        return

    env = {}
    for line in Path("/opt/mesto/.env").read_text().splitlines():
        key, sep, value = line.partition("=")
        if sep:
            env[key] = value.strip().strip('"').strip("'")
    token = env.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("Bot is not configured; no notification sent")
    root = (env.get("TELEGRAM_API_ROOT") or "https://api.telegram.org").rstrip("/")
    app_url = env.get("APP_URL", "https://mesto-go.ru").rstrip("/")
    receipt_dir = Path("/opt/mesto/notice-receipts")
    receipt_dir.mkdir(mode=0o700, exist_ok=True)
    receipt = receipt_dir / f"profile-photo-{row['id']}.json"
    try:
        fd = os.open(receipt, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        previous = json.loads(receipt.read_text())
        print("Already sent; no duplicate notification" if previous.get("status") == "sent" else "Earlier delivery outcome is uncertain; no automatic resend")
        return
    with os.fdopen(fd, "w") as out:
        json.dump({"status": "pending", "event_id": row["id"], "user_id": row["user_id"]}, out)
    body = {
        "chat_id": int(row["telegram_id"]), "text": notice_text(row["title"]),
        "reply_markup": {"inline_keyboard": [[{"text": "Добавить фото профиля", "web_app": {"url": app_url + "/profile/edit"}}]]},
    }
    request = urllib.request.Request(root + "/bot" + token + "/sendMessage", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            result = json.load(response)
        if not result.get("ok"):
            raise RuntimeError("Telegram did not confirm delivery")
    except Exception:
        # A timeout may occur after Telegram accepted the message. Never retry
        # blindly or print an exception containing the token-bearing URL.
        raise RuntimeError("Delivery not confirmed; receipt retained to prevent duplicates") from None
    receipt.write_text(json.dumps({"status": "sent", "event_id": row["id"], "user_id": row["user_id"], "message_id": result["result"]["message_id"]}))
    print("Notification sent: Telegram confirmed delivery. Event was not deleted.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else "Notice task failed; no automatic retry", file=sys.stderr)
        sys.exit(1)
