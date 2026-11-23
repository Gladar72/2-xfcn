"""Wait for this exact iOS version and grant access to the existing internal group."""
import os
import time
from urllib.parse import urlencode
from asc_tf import api, APP

number = os.environ["BUILD"]
version = os.environ["MARKETING_VERSION"]
query = urlencode({"filter[app]": APP, "filter[version]": number,
                   "include": "preReleaseVersion", "limit": "10"})
for _ in range(80):
    result = api("/v1/builds?" + query)
    versions = {x["id"]: x["attributes"]["version"] for x in result.get("included", [])}
    build = next((b for b in result["data"] if versions.get(
        b["relationships"]["preReleaseVersion"]["data"]["id"]) == version), None)
    status = build["attributes"]["processingState"] if build else "awaiting upload"
    print("Apple:", version, number, status, flush=True)
    if status == "VALID":
        break
    if status in {"FAILED", "INVALID"}:
        raise SystemExit("Apple rejected the binary")
    time.sleep(30)
else:
    raise SystemExit("Apple has not finished processing this build")
bid = build["id"]
if build["attributes"].get("usesNonExemptEncryption") is None:
    api("/v1/builds/" + bid, "PATCH", {"data":{"type":"builds","id":bid,
        "attributes":{"usesNonExemptEncryption":False}}})
def groups(path):
    return [g for g in api(path)["data"] if g["attributes"].get("isInternalGroup")]
attached = groups(f"/v1/builds/{bid}/betaGroups")
if not attached:
    candidates = groups(f"/v1/apps/{APP}/betaGroups?limit=100")
    group = next((g for g in candidates if g["attributes"]["name"] == "Команда"), None)
    if group is None and len(candidates) == 1:
        group = candidates[0]
    if not group:
        raise SystemExit("No unambiguous existing internal testing group")
    api("/v1/betaGroups/" + group["id"] + "/relationships/builds", "POST",
        {"data":[{"type":"builds","id":bid}]})
for _ in range(20):
    attached = groups(f"/v1/builds/{bid}/betaGroups")
    state = api(f"/v1/builds/{bid}/buildBetaDetail")["data"]["attributes"]["internalBuildState"]
    print("TestFlight:", state, [g["attributes"]["name"] for g in attached], flush=True)
    if attached and state == "IN_BETA_TESTING":
        break
    time.sleep(15)
else:
    raise SystemExit("Internal testing is not active yet")
