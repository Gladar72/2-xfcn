"""Create credentials locally on the staging host. Never import production settings."""
import base64
import hashlib
import hmac
import json
import os
import secrets
from pathlib import Path

os.umask(0o077)
path = Path("database.env")
if not path.exists():
    values = {name: secrets.token_hex(32) for name in
              ("PG_PASSWORD", "REST_PASSWORD", "SUPABASE_JWT_SECRET", "CRON_SECRET")}
    temp = path.with_suffix(".new")
    temp.write_text("".join(f"{k}={v}\n" for k, v in values.items()))
    temp.replace(path)
values = dict(line.split("=", 1) for line in path.read_text().splitlines())
def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=")
def jwt(role):
    head = b64(b'{"alg":"HS256","typ":"JWT"}')
    body = b64(json.dumps({"role": role}).encode())
    payload = head + b"." + body
    return (payload + b"." + b64(hmac.digest(values["SUPABASE_JWT_SECRET"].encode(),payload,hashlib.sha256))).decode()
raw = Path("payment.env").read_text().splitlines()
payment = dict(line.split("=",1) for line in raw)
if set(payment) - {"TICKET_TEST_SECRET_KEY", "ATOL_DEMO_PASSWORD"} or not payment.get("TICKET_TEST_SECRET_KEY","").startswith("test_"):
    raise SystemExit("Expected only sandbox provider credentials")
app = {**payment, "TICKET_TEST_SHOP_ID":"1466532", "TICKET_SANDBOX":"1",
       "APP_URL":"https://mesto-go.ru/ticket-test","NEXT_PUBLIC_SUPABASE_URL":"http://gateway:8000",
       "SUPABASE_JWT_SECRET":values["SUPABASE_JWT_SECRET"],"CRON_SECRET":values["CRON_SECRET"],
       "SUPABASE_SERVICE_ROLE_KEY":jwt("service_role"),"NEXT_PUBLIC_SUPABASE_ANON_KEY":jwt("anon")}
temp = Path("app.env.new")
temp.write_text("".join(f"{k}={v}\n" for k,v in app.items()))
temp.replace("app.env")
