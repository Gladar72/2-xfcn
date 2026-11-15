#!/usr/bin/env python3
"""TestFlight: дождаться обработки сборки, снять вопрос про шифрование и выдать её
внутренним тестировщикам (группа «Команда»: все пользователи аккаунта App Store Connect).
На проверку в App Store ничего не отправляет."""
import json, os, time, urllib.request, urllib.error
import jwt

KID, ISS, KEY = os.environ["KID"], os.environ["ISS"], os.environ["KEY"]
APP = os.environ.get("APP_ID", "6833348222")
WANT = (os.environ.get("BUILD") or "").strip()


def api(path, method="GET", body=None):
    now = int(time.time())
    t = jwt.encode({"iss": ISS, "iat": now, "exp": now + 1000, "aud": "appstoreconnect-v1"},
                   open(KEY).read(), algorithm="ES256", headers={"kid": KID, "typ": "JWT"})
    req = urllib.request.Request("https://api.appstoreconnect.apple.com" + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + t, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, method, path, e.read().decode()[:600])
        raise


def find_build():
    q = f"/v1/builds?filter[app]={APP}&sort=-uploadedDate&limit=5&include=preReleaseVersion"
    if WANT:
        q += f"&filter[version]={WANT}"
    r = api(q)
    pre = {p["id"]: p["attributes"]["version"] for p in r.get("included", []) if p["type"] == "preReleaseVersions"}
    for b in r["data"]:
        pid = b["relationships"]["preReleaseVersion"]["data"]["id"]
        print("BUILD", b["attributes"]["version"], "app", pre.get(pid), b["attributes"]["processingState"], b["attributes"].get("usesNonExemptEncryption"))
    return r["data"][0] if r["data"] else None


b = None
for i in range(60):
    b = find_build()
    if b and b["attributes"]["processingState"] == "VALID":
        break
    print("ждём обработку…"); time.sleep(30)
if not b or b["attributes"]["processingState"] != "VALID":
    raise SystemExit("сборка не обработана")
bid = b["id"]
print("СБОРКА", b["attributes"]["version"], "готова")

if b["attributes"].get("usesNonExemptEncryption") is None:
    api(f"/v1/builds/{bid}", "PATCH", {"data": {"type": "builds", "id": bid, "attributes": {"usesNonExemptEncryption": False}}})
    print("шифрование: только стандартное (HTTPS) — отмечено")

groups = api(f"/v1/apps/{APP}/betaGroups?limit=50")["data"]
for g in groups:
    print("GROUP", g["id"][:6], g["attributes"]["name"], "internal", g["attributes"].get("isInternalGroup"), "all", g["attributes"].get("hasAccessToAllBuilds"))
internal = [g for g in groups if g["attributes"].get("isInternalGroup")]
if not internal:
    g = api("/v1/betaGroups", "POST", {"data": {"type": "betaGroups", "attributes": {"name": "Команда", "isInternalGroup": True, "hasAccessToAllBuilds": True},
                                                 "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})["data"]
    internal = [g]
    print("создана внутренняя группа «Команда»")
g = internal[0]
# Все пользователи аккаунта — во внутренние тестировщики.
users = api("/v1/users?limit=50")["data"]
testers = api(f"/v1/betaGroups/{g['id']}/betaTesters?limit=200")["data"]
have = {(t["attributes"].get("email") or "").lower() for t in testers}
for u in users:
    em = (u["attributes"].get("username") or "").lower()
    if em and em not in have:
        try:
            api("/v1/betaTesters", "POST", {"data": {"type": "betaTesters", "attributes": {"email": em, "firstName": u["attributes"].get("firstName") or "", "lastName": u["attributes"].get("lastName") or ""},
                                                       "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": g["id"]}]}}}})
            print("тестировщик добавлен")
        except Exception:
            print("тестировщика добавить не удалось")
ts = api(f"/v1/betaGroups/{g['id']}/betaTesters?limit=200")["data"]
print("тестировщиков в группе:", len(ts))
for t in ts:
    a = t["attributes"]
    print("TESTER", a.get("inviteType"), a.get("state"), "почта на", (a.get("email") or "")[:3] + "…")
    # Повторно отправить приглашение в TestFlight — только если ещё не принято.
    if os.environ.get("RESEND") != "1":
        continue
    try:
        api("/v1/betaTesterInvitations", "POST", {"data": {"type": "betaTesterInvitations", "relationships": {
            "app": {"data": {"type": "apps", "id": APP}}, "betaTester": {"data": {"type": "betaTesters", "id": t["id"]}}}}})
        print("приглашение отправлено повторно")
    except Exception:
        print("повторное приглашение не ушло")
if not g["attributes"].get("hasAccessToAllBuilds"):
    try:
        api(f"/v1/betaGroups/{g['id']}/relationships/builds", "POST", {"data": [{"type": "builds", "id": bid}]})
        print("сборка выдана группе")
    except Exception:
        pass
try:
    bg = api(f"/v1/builds/{bid}/betaGroups")["data"]
    print("сборка в группах:", [x["attributes"]["name"] for x in bg])
except Exception:
    pass
st = api(f"/v1/builds/{bid}/buildBetaDetail")["data"]["attributes"]
print("TESTFLIGHT", json.dumps(st))
