"""Read ATOL's published v4 sandbox example, leaving configured credentials untouched."""
import hashlib
import os
import re
import sys
import urllib.request

# Pinned to the published v4 demo value documented by the provider and acquiring bank.
expected = "d8febb5ee8a487e690719369244b1e9b8fad9d86951ddeec0f75067018423dcd"
if os.environ.get("DEMO_RECEIPT_PASSWORD"):
    sys.exit(0)
for url in (
    "https://atol.online/files/ffd/test_sreda.txt",
    "https://alfabank.ru/sme/payservice/internet-acquiring/docs/fiscalization-i/",
    "https://docs.shelter.ru/books/podklyucenie-kkt-k-abonement/page/atolcloud-podklyucenie-oblacnoi-fiskalizacii/revisions/1270",
):
    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            content = response.read(4_000_000)
        for token in set(re.findall(rb"[A-Za-z0-9_-]{5,120}", content)):
            if hashlib.sha256(token).hexdigest() == expected:
                # Output is redirected into a 0600 deployment file by the caller.
                sys.stdout.buffer.write(token)
                sys.exit(0)
    except OSError:
        continue
