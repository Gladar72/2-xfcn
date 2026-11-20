#!/usr/bin/env python3
"""Submit the reviewed iOS binary with release held for the developer."""
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
        errors = json.loads(e.read() or b"{}").get("errors", [])
        print("App Store Connect", method, path, e.code, [(x.get("code"), x.get("detail")) for x in errors])
        raise SystemExit("App Store Connect request failed")



VERSION = "0.5.1"
BUILD = "59"
if os.environ.get("BUILD") != BUILD or os.environ.get("NEW_VERSION") != VERSION or os.environ.get("SUBMIT") != "true":
    sys.exit("Expected release 0.5.1 (59), with explicit review submission")

def rel(kind, ident):
    return {"data": {"type": kind, "id": ident}}

def attrs(kind, values, links=None, ident=None):
    d = {"type": kind, "attributes": values}
    if ident:
        d["id"] = ident
    if links:
        d["relationships"] = links
    return {"data": d}

matches = api("GET", f"/v1/builds?filter[app]={APP}&filter[version]={BUILD}&filter[preReleaseVersion.version]={VERSION}&include=preReleaseVersion&limit=5")["data"]
if len(matches) != 1 or matches[0]["attributes"]["processingState"] != "VALID" or matches[0]["attributes"]["version"] != BUILD:
    sys.exit("Expected one validated build")
bid = matches[0]["id"]
versions = api("GET", f"/v1/apps/{APP}/appStoreVersions?filter[platform]=IOS&filter[versionString]={VERSION}&limit=2")["data"]
if len(versions) > 1:
    sys.exit("Ambiguous store version")
if not versions:
    version = api("POST", "/v1/appStoreVersions", attrs("appStoreVersions", {"platform":"IOS","versionString":VERSION,"releaseType":"MANUAL"},{"app": rel("apps",APP)}))["data"]
else:
    version = versions[0]
vid = version["id"]
vp = f"/v1/appStoreVersions/{vid}"
def check_binding():
    record = api("GET", vp + "?include=build")["data"]
    attached = (record["relationships"]["build"]["data"] or {}).get("id")
    a = record["attributes"]
    if a["versionString"] != VERSION or a["releaseType"] != "MANUAL" or attached != bid:
        sys.exit("Version, build or manual release setting differs")
    return a.get("appVersionState") or a.get("appStoreState")
editable = ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "METADATA_REJECTED", "REJECTED", "READY_FOR_REVIEW")
state = version["attributes"].get("appVersionState") or version["attributes"].get("appStoreState")
if state not in editable:
    state = check_binding()
    print("VERSION", VERSION, "BUILD", BUILD, "RELEASE MANUAL STATE", state, flush=True)
    if state not in ("WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_DEVELOPER_RELEASE"):
        sys.exit("Unexpected existing state")
    sys.exit(0)
if version["attributes"]["releaseType"] != "MANUAL":
    api("PATCH", vp, attrs("appStoreVersions", {"releaseType":"MANUAL"}, ident=vid))
api("PATCH", vp + "/relationships/build", rel("builds",bid))
check_binding()
for loc in api("GET", vp + "/appStoreVersionLocalizations")["data"]:
    if loc["attributes"]["locale"] != "ru":
        continue
    lid = loc["id"]
    api("PATCH", f"/v1/appStoreVersionLocalizations/{lid}", attrs("appStoreVersionLocalizations", {"whatsNew":"Исправили вход через Telegram после возвращения в приложение. Улучшили вход по коду из письма и через Apple."}, ident=lid))
# Apple carries forward the previous review contact and demo details. Keep those existing fields.
if NOTES and os.path.isfile(NOTES):
    details = api("GET", vp + "/appStoreReviewDetail").get("data")
    if details:
        rid = details["id"]
        with open(NOTES) as f:
            notes = f.read().strip()
        if notes:
            api("PATCH", f"/v1/appStoreReviewDetails/{rid}", attrs("appStoreReviewDetails", {"notes":notes},ident=rid))
submissions = api("GET", f"/v1/reviewSubmissions?filter[app]={APP}&filter[state]=READY_FOR_REVIEW&limit=50")["data"]
draft = None
item_found = False
for sub in submissions:
    if sub["attributes"]["platform"] != "IOS":
        continue
    items = api("GET", f"/v1/reviewSubmissions/{sub['id']}/items?include=appStoreVersion&limit=200")["data"]
    if not items:
        if draft is None:
            draft = sub
        continue
    own = all(((it.get("relationships",{}).get("appStoreVersion",{}).get("data") or {}).get("id") == vid) for it in items)
    if own:
        draft = sub
        item_found = True
        break
if not draft:
    draft = api("POST", "/v1/reviewSubmissions", attrs("reviewSubmissions",{"platform":"IOS"},{"app":rel("apps",APP)}))["data"]
sid = draft["id"]
if not item_found:
    api("POST", "/v1/reviewSubmissionItems", {"data":{"type":"reviewSubmissionItems","relationships":{"reviewSubmission":rel("reviewSubmissions",sid),"appStoreVersion":rel("appStoreVersions",vid)}}})
check_binding()
api("PATCH", f"/v1/reviewSubmissions/{sid}", attrs("reviewSubmissions",{"submitted":True},ident=sid))
for i in range(8):
    state = check_binding()
    submission = api("GET", f"/v1/reviewSubmissions/{sid}")["data"]["attributes"]["state"]
    print("VERSION", VERSION, "BUILD", BUILD, "RELEASE MANUAL STATE", state, "SUBMISSION", submission, flush=True)
    if state in ("WAITING_FOR_REVIEW","IN_REVIEW","PENDING_DEVELOPER_RELEASE") or submission in ("WAITING_FOR_REVIEW","IN_REVIEW"):
        break
    time.sleep(5)
else:
    sys.exit("Apple has not yet confirmed placement in review")
