"""Read the latest available daily first-time downloads for МЕСТО."""
import csv
import gzip
import io
import json
import os
import sys
import time
from collections import defaultdict
from datetime import date
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import jwt

APP = "6833348222"
BASE = "https://api.appstoreconnect.apple.com"


def api(url, body=None):
    if url.startswith("/"):
        url = BASE + url
    if not url.startswith(BASE + "/v1/"):
        raise ValueError("Unexpected App Store Connect API URL")
    now = int(time.time())
    token = jwt.encode({"iss": os.environ["ISS"], "iat": now, "exp": now + 900,
                        "aud": "appstoreconnect-v1"}, os.environ["P8"],
                       algorithm="ES256", headers={"kid": os.environ["KID"]})
    request = Request(url, data=json.dumps(body).encode() if body else None,
                      headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def pages(url):
    while url:
        page = api(url)
        yield from page["data"]
        url = page.get("links", {}).get("next")


def daily_counts(content):
    reader = csv.DictReader(io.StringIO(content), delimiter="\t")
    required = {"Date", "App Apple Identifier", "Download Type", "Counts"}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError("Unexpected downloads report columns")
    counts = defaultdict(int)
    for row in reader:
        if row["App Apple Identifier"] == APP:
            day = date.fromisoformat(row["Date"])
            counts[day] += int(row["Counts"]) if row["Download Type"].strip().casefold() == "first-time download" else 0
    return counts


def latest_downloads():
    requests = list(pages(f"/v1/apps/{APP}/analyticsReportRequests"))
    ongoing = next((r for r in requests if r["attributes"]["accessType"] == "ONGOING"), None)
    if ongoing is None:
        api("/v1/analyticsReportRequests", {"data": {"type": "analyticsReportRequests",
            "attributes": {"accessType": "ONGOING"},
            "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})
        return {"status": "pending"}
    if ongoing["attributes"].get("stoppedDueToInactivity"):
        return {"status": "inactive"}
    reports = pages(f"/v1/analyticsReportRequests/{ongoing['id']}/reports")
    report = next((r for r in reports if r["attributes"]["name"].casefold() == "app store downloads standard"), None)
    if not report:
        return {"status": "pending"}
    instances = pages(f"/v1/analyticsReports/{report['id']}/instances?filter%5Bgranularity%5D=DAILY")
    newest = None
    for instance in sorted(instances, key=lambda i: i["attributes"]["processingDate"], reverse=True):
        if newest and instance["attributes"]["processingDate"] < newest["date"]:
            break
        totals = defaultdict(int)
        for segment in pages(f"/v1/analyticsReportInstances/{instance['id']}/segments"):
            attrs = segment["attributes"]
            if urlparse(attrs["url"]).scheme != "https":
                raise ValueError("Invalid download URL")
            # Signed download URL: never forward the ASC Authorization header.
            with urlopen(attrs["url"], timeout=45) as response:
                blob = response.read()
            if attrs.get("sizeInBytes") is not None and len(blob) != int(attrs["sizeInBytes"]):
                raise ValueError("Incomplete analytics segment")
            content = gzip.decompress(blob) if blob.startswith(b"\x1f\x8b") else blob
            for day, count in daily_counts(content.decode("utf-8-sig")).items():
                totals[day] += count
        if totals:
            day = max(totals)
            # A newer processing instance already includes corrections for a repeated date.
            if newest is None or day.isoformat() > newest["date"]:
                newest = {"status": "ok", "date": day.isoformat(), "first": totals[day]}
    return newest or {"status": "pending"}


def summary_line(data):
    if data["status"] == "ok":
        day = date.fromisoformat(data["date"]).strftime("%d.%m.%Y")
        assert type(data["first"]) is int and data["first"] >= 0
        return ("📲 App Store · первые скачивания за %s — %d (все источники)" % (day, data["first"]))
    else:
        labels = {"pending": "Apple ещё готовит отчёт", "forbidden": "нет доступа к аналитике Apple", "inactive": "Apple приостановила отчёты"}
        return ("📲 App Store · первые скачивания — " + labels.get(data["status"], "данные Apple временно недоступны"))


if __name__ == "__main__":
    try:
        result = latest_downloads()
    except HTTPError as exc:
        print(f"Apple analytics HTTP {exc.code}", file=sys.stderr)
        result = {"status": "forbidden" if exc.code in (401, 403) else "unavailable"}
    except Exception as exc:
        print("Could not read Apple analytics:", type(exc).__name__, file=sys.stderr)
        result = {"status": "unavailable"}
    print(summary_line(result))
    if os.getenv("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            print("availability=" + result["status"], file=output)
