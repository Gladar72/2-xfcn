"""Check a synthetic agent ticket sale and refund on ATOL's public FFD 1.05 sandbox.

Use the v4 demo password from https://atol.online/files/ffd/test_sreda.txt in
ATOL_DEMO_PASSWORD. Run with --order <UUID> to resume an interrupted check.
"""

import argparse
from datetime import datetime
import json
import os
import sys
from time import monotonic, sleep
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo


API = "https://testonline.atol.ru/possystem/v4"
GROUP = "v4-online-atol-ru_4179"
PRICE = 1500


def request(path, data=None, token=None, allow_duplicate=False):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Token"] = token
    body = json.dumps(data).encode() if data is not None else None
    try:
        with urlopen(Request(f"{API}/{path}", body, headers), timeout=20) as response:
            result = json.load(response)
    except HTTPError as exc:
        result = json.load(exc)
        error = result.get("error") or {}
        # ATOL returns the UUID of the original document on replay.
        if allow_duplicate and exc.code == 400 and error.get("code") == 33 and result.get("uuid"):
            return result
        raise RuntimeError(f"ATOL HTTP {exc.code}: {error.get('text')}") from exc
    if result.get("error"):
        raise RuntimeError(result["error"].get("text") or "ATOL rejected the document")
    return result


def document(order, operation):
    item = {
        "name": "Тестовый билет на вечеринку МЕСТО",
        "price": PRICE, "quantity": 1, "sum": PRICE,
        "payment_method": "full_prepayment", "payment_object": "service",
        "vat": {"type": "none"},
        "agent_info": {"type": "another"},
        "supplier_info": {
            "name": "Демонстрационный организатор", "inn": "7700000009",
            "phones": ["+70000000000"],
        },
    }
    return {
        "external_id": f"mesto-{order}-{operation}",
        "timestamp": datetime.now(ZoneInfo("Europe/Moscow")).strftime("%d.%m.%Y %H:%M:%S"),
        "receipt": {
            "internet": True,
            "client": {"email": "buyer@example.invalid"},
            "company": {
                "inn": "5544332219", "email": "agent@example.invalid",
                "sno": "usn_income_outcome", "payment_address": "https://v4.online.atol.ru",
            },
            "items": [item], "payments": [{"type": 1, "sum": PRICE}], "total": PRICE,
        },
    }


def register_and_verify(order, operation, token):
    submitted = request(f"{GROUP}/{operation}", document(order, operation), token, allow_duplicate=True)
    report_path = f"{GROUP}/report/{UUID(submitted['uuid'])}"
    deadline = monotonic() + 120
    while monotonic() < deadline:
        report = request(report_path, token=token)
        if report.get("status") == "wait":
            sleep(3)
            continue
        payload = report.get("payload") or {}
        if (report.get("status") != "done" or payload.get("total") != PRICE
                or not payload.get("fiscal_document_number") or not payload.get("fiscal_document_attribute")):
            raise RuntimeError(f"{operation}: missing or unexpected fiscal result")
        print(f"{operation}: ФД {payload['fiscal_document_number']}, {PRICE} ₽, {payload.get('ofd_receipt_url', '')}")
        return
    raise RuntimeError(f"{operation}: still pending; repeat with --order {order}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--order", type=UUID, help="Use the same order UUID on retries")
    args = parser.parse_args()
    password = os.environ.get("ATOL_DEMO_PASSWORD")
    if not password:
        parser.error("Set ATOL_DEMO_PASSWORD to the published v4 sandbox password")
    order = args.order or uuid4()
    print(f"Demo order: {order}", flush=True)
    token = request("getToken", {"login": "v4-online-atol-ru", "pass": password})["token"]
    for operation in ("sell", "sell_refund"):
        register_and_verify(order, operation, token)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, URLError, TimeoutError, ValueError, KeyError) as exc:
        sys.exit(str(exc))
