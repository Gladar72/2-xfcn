#!/usr/bin/env python3
"""App Store Connect через API (ключ из секретов): подставить свежую сборку в готовящуюся
версию, отметить «без нестандартного шифрования», обновить заметки для проверяющих.
Ничего не отправляет на проверку."""
import json, os, sys, time, urllib.request, urllib.error
import jwt

KID, ISS, KEY = os.environ["KID"], os.environ["ISS"], os.environ["KEY"]
APP = os.environ.get("APP_ID", "6833348222")
NOTES = os.environ.get("NOTES_FILE")


def tok():
    now = int(time.time())
    return jwt.encode({"iss": ISS, "iat": now, "exp": now + 1000, "aud": "appstoreconnect-v1"},
                      open(KEY).read(), algorithm="ES256", headers={"kid": KID, "typ": "JWT"})


def api(method, path, body=None):
    req = urllib.request.Request("https://api.appstoreconnect.apple.com" + path, method=method,
                                 data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + tok(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read()
            return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        print(f"::warning::{method} {path}: {e.code} {e.read().decode()[:600]}")
        return None


ver = api("GET", f"/v1/apps/{APP}/appStoreVersions?filter[platform]=IOS&filter[appStoreState]=PREPARE_FOR_SUBMISSION,DEVELOPER_REJECTED,REJECTED,METADATA_REJECTED&limit=5")
ver = (ver or {}).get("data") or []
NEW_VERSION = os.environ.get("NEW_VERSION", "").strip()
if not ver and NEW_VERSION:
    # Новой версии ещё нет — создаём (номер из mobile/app.json).
    c = api("POST", "/v1/appStoreVersions", {"data": {"type": "appStoreVersions",
        "attributes": {"platform": "IOS", "versionString": NEW_VERSION, "releaseType": "AFTER_APPROVAL"},
        "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})
    if not c:
        sys.exit("Не удалось создать версию " + NEW_VERSION)
    ver = [c["data"]]
    print("Создана версия", NEW_VERSION)
if not ver:
    sys.exit("Нет версии в подготовке")
v = ver[0]
print("Версия:", v["attributes"]["versionString"], v["id"])

# Свежая обработанная сборка этой версии.
want = os.environ.get("BUILD")
for attempt in range(40):
    b = api("GET", f"/v1/builds?filter[app]={APP}&filter[preReleaseVersion.version]={v['attributes']['versionString']}&sort=-uploadedDate&limit=5")
    builds = (b or {}).get("data") or []
    builds = [x for x in builds if not want or x["attributes"]["version"] == want]
    if builds and builds[0]["attributes"]["processingState"] == "VALID":
        break
    print("ждём обработку сборки…", [(x["attributes"]["version"], x["attributes"]["processingState"]) for x in builds])
    time.sleep(60)
else:
    sys.exit("Сборка не обработалась")
build = builds[0]
print("Сборка:", build["attributes"]["version"], build["id"])
if build["attributes"].get("usesNonExemptEncryption") is None:
    api("PATCH", f"/v1/builds/{build['id']}", {"data": {"type": "builds", "id": build["id"], "attributes": {"usesNonExemptEncryption": False}}})
api("PATCH", f"/v1/appStoreVersions/{v['id']}/relationships/build", {"data": {"type": "builds", "id": build["id"]}})
print("Сборка подставлена в версию")

if NOTES and os.path.exists(NOTES):
    notes = open(NOTES).read().strip()
    d = api("GET", f"/v1/appStoreVersions/{v['id']}/appStoreReviewDetail")
    rid = ((d or {}).get("data") or {}).get("id")
    print("Детали проверки:", rid, str(d)[:200])
    if not rid:
        c = api("POST", "/v1/appStoreReviewDetails", {"data": {"type": "appStoreReviewDetails", "attributes": {"notes": notes},
                 "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": v["id"]}}}}})
        print("Детали созданы:", bool(c))
    if rid:
        api("PATCH", f"/v1/appStoreReviewDetails/{rid}", {"data": {"type": "appStoreReviewDetails", "id": rid, "attributes": {"notes": notes}}})
        print("Заметки обновлены")


# «Что нового» (ru) из .github/whats-new.txt.
WN = os.environ.get("WHATS_NEW_FILE")
if WN and os.path.exists(WN):
    text = open(WN).read().strip()
    locs = api("GET", f"/v1/appStoreVersions/{v['id']}/appStoreVersionLocalizations") or {}
    for l in locs.get("data", []):
        api("PATCH", f"/v1/appStoreVersionLocalizations/{l['id']}", {"data": {"type": "appStoreVersionLocalizations", "id": l["id"], "attributes": {"whatsNew": text}}})
        print("Что нового:", l["attributes"].get("locale"))

# Отправить на проверку (только если SUBMIT=true).
if os.environ.get("SUBMIT") == "true":
    rs = api("POST", "/v1/reviewSubmissions", {"data": {"type": "reviewSubmissions", "attributes": {"platform": "IOS"},
        "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})
    if not rs:
        # Возможно, черновик отправки уже есть — берём его.
        ex = api("GET", f"/v1/reviewSubmissions?filter[app]={APP}&filter[state]=READY_FOR_REVIEW&limit=1") or {}
        rs = {"data": (ex.get("data") or [None])[0]}
    rid = (rs.get("data") or {}).get("id")
    if not rid:
        sys.exit("Не удалось создать отправку на проверку")
    api("POST", "/v1/reviewSubmissionItems", {"data": {"type": "reviewSubmissionItems",
        "relationships": {"reviewSubmission": {"data": {"type": "reviewSubmissions", "id": rid}},
                          "appStoreVersion": {"data": {"type": "appStoreVersions", "id": v["id"]}}}}})
    r = api("PATCH", f"/v1/reviewSubmissions/{rid}", {"data": {"type": "reviewSubmissions", "id": rid, "attributes": {"submitted": True}}})
    print("Отправлено на проверку:", bool(r))
