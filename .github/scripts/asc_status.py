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

# Скриншоты, превью и тексты у каждой версии.
for v in vs["data"]:
    locs = api(f"/v1/appStoreVersions/{v['id']}/appStoreVersionLocalizations")
    for l in locs["data"]:
        la = l["attributes"]
        print("LOC", v["attributes"]["versionString"], la.get("locale"), "desc", len(la.get("description") or ""), "kw", la.get("keywords"), "whatsNew", len(la.get("whatsNew") or ""))
        sets = api(f"/v1/appStoreVersionLocalizations/{l['id']}/appScreenshotSets?include=appScreenshots")
        shots = {s["id"]: s["attributes"] for s in sets.get("included", []) if s["type"] == "appScreenshots"}
        for s in sets["data"]:
            ids = [x["id"] for x in (s["relationships"]["appScreenshots"].get("data") or [])]
            states = [((shots.get(i) or {}).get("assetDeliveryState") or {}).get("state") for i in ids]
            print("  SHOTS", s["attributes"]["screenshotDisplayType"], len(ids), states)
        try:
            ps = api(f"/v1/appStoreVersionLocalizations/{l['id']}/appPreviewSets")
            for p in ps["data"]:
                print("  PREVIEW", p["attributes"])
        except Exception as e:
            print("  preview err", e)

# Подписки (IAP): группы, продукты, статусы, пробный период.
try:
    gs = api(f"/v1/apps/{APP}/subscriptionGroups?include=subscriptions&limit=10")
    for g in gs["data"]:
        print("SUBGROUP", g["attributes"].get("referenceName"))
    for s in gs.get("included", []):
        if s["type"] != "subscriptions": continue
        a = s["attributes"]
        print("SUB", a.get("productId"), a.get("name"), a.get("state"), a.get("subscriptionPeriod"))
        try:
            io = api(f"/v1/subscriptions/{s['id']}/introductoryOffers?limit=5")
            for o in io["data"]:
                print("  INTRO", o["attributes"])
        except Exception as e:
            print("  intro err", e)
except Exception as e:
    print("subs err", e)

# Возможности bundle id (Sign in with Apple и т. п.).
try:
    b = api("/v1/bundleIds?filter[identifier]=ru.mesto.app&include=bundleIdCapabilities")
    for c in b.get("included", []):
        print("CAP", c["attributes"].get("capabilityType"))
except Exception as e:
    print("cap err", e)
