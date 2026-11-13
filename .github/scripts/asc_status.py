#!/usr/bin/env python3
"""Только чтение: статусы версий приложения в App Store Connect."""
import json, os, time, urllib.request
import jwt

KID, ISS, KEY = os.environ["KID"], os.environ["ISS"], os.environ["KEY"]
APP = os.environ.get("APP_ID", "6833348222")


def api(path):
    now = int(time.time())
    t = jwt.encode({"iss": ISS, "iat": now, "exp": now + 1000, "aud": "appstoreconnect-v1"},
                   open(KEY).read(), algorithm="ES256", headers={"kid": KID, "typ": "JWT"})
    req = urllib.request.Request("https://api.appstoreconnect.apple.com" + path, headers={"Authorization": "Bearer " + t})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


vs = api(f"/v1/apps/{APP}/appStoreVersions?filter[platform]=IOS&limit=5&include=build")
builds = {b["id"]: b["attributes"]["version"] for b in vs.get("included", []) if b["type"] == "builds"}
for v in vs["data"]:
    a = v["attributes"]
    bid = ((v.get("relationships", {}).get("build") or {}).get("data") or {}).get("id")
    print("VERSION", a["versionString"], "build", builds.get(bid), "state", a.get("appStoreState"), a.get("appVersionState"), "release", a.get("releaseType"), "created", a.get("createdDate"))
    try:
        subs = api(f"/v1/appStoreVersions/{v['id']}/appStoreVersionSubmission")
        print("  submission", json.dumps(subs.get("data", {}).get("attributes", {})))
    except Exception as e:
        pass
try:
    rs = api(f"/v1/reviewSubmissions?filter[app]={APP}&limit=5")
    for r in rs["data"]:
        print("REVIEW", r["attributes"])
except Exception as e:
    print("reviewSubmissions error", e)
