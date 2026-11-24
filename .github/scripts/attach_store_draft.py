"""Attach an explicitly selected production build to its existing App Store draft."""
import os
import time
from urllib.parse import urlencode

from asc_tf import APP, api


def exact_build(version, number):
    query = urlencode({"filter[app]": APP, "filter[version]": number, "include": "preReleaseVersion"})
    result = api("/v1/builds?" + query)
    ios_versions = {p["id"] for p in result.get("included", [])
                    if p["type"] == "preReleaseVersions" and p["attributes"]["version"] == version
                    and p["attributes"]["platform"] == "IOS"}
    matches = [b for b in result["data"] if b["attributes"]["version"] == number
               and b["relationships"]["preReleaseVersion"]["data"]["id"] in ios_versions]
    if len(matches) > 1:
        raise SystemExit("Ambiguous iOS build")
    return matches[0] if matches else None


def main():
    version, number = os.environ["MARKETING_VERSION"], os.environ["BUILD"]
    for _ in range(40):
        build = exact_build(version, number)
        state = build["attributes"]["processingState"] if build else "awaiting processing"
        print(f"iOS {version} ({number}) {state}", flush=True)
        if state == "VALID":
            break
        if state in {"FAILED", "INVALID"}:
            raise SystemExit("Apple rejected this build")
        time.sleep(30)
    else:
        raise SystemExit("Timed out waiting for Apple to process this build")

    if build["attributes"].get("expired") or build["attributes"].get("buildAudienceType") == "INTERNAL_ONLY":
        raise SystemExit("Build is ineligible for the store")
    query = urlencode({"filter[platform]": "IOS", "filter[versionString]": version,
                       "include": "build", "limit": "2"})
    versions = api(f"/v1/apps/{APP}/appStoreVersions?" + query)["data"]
    if len(versions) != 1:
        raise SystemExit("No unique release draft")
    draft = versions[0]
    if draft["attributes"]["appStoreState"] != "PREPARE_FOR_SUBMISSION":
        raise SystemExit("Version is no longer an editable draft")
    attached = draft["relationships"]["build"]["data"]
    target = {"type": "builds", "id": build["id"]}
    if attached and attached["id"] != build["id"]:
        raise SystemExit("The draft already has another build")
    path = f"/v1/appStoreVersions/{draft['id']}/relationships/build"
    if not attached:
        api(path, "PATCH", {"data": target})
    saved = api(f"/v1/appStoreVersions/{draft['id']}?include=build")["data"]
    if (saved["relationships"]["build"]["data"] or {}).get("id") != build["id"]:
        raise SystemExit("Failed to confirm draft build")
    print(f"Confirmed iOS {version} ({number}) in PREPARE_FOR_SUBMISSION", flush=True)


if __name__ == "__main__":
    main()
