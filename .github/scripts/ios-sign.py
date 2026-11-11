#!/usr/bin/env python3
"""Подпись iOS-сборки без Mac и без устройств: через App Store Connect API
создаёт временный сертификат Apple Distribution и профиль App Store для ru.mesto.app,
кладёт их в связку ключей раннера и переводит таргет Mesto на ручную подпись.
Если сборка упала, временный сертификат отзывается (ios-sign.py revoke).
"""
import base64, json, os, re, subprocess, sys, time, urllib.request, urllib.error, glob
import jwt  # pyjwt

KID, ISS, KEY = os.environ["KID"], os.environ["ISS"], os.environ["KEY"]
BUNDLE, TEAM, TMP = os.environ.get("BUNDLE", "ru.mesto.app"), os.environ["TEAM"], os.environ["RUNNER_TEMP"]
STATE = os.path.join(TMP, "sign-state.json")


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
        print(f"::error::{method} {path}: {e.code} {e.read().decode()[:800]}")
        raise


def sh(*a):
    subprocess.run(a, check=True)


def setup():
    key, csr = os.path.join(TMP, "dist.key"), os.path.join(TMP, "dist.csr")
    sh("openssl", "genrsa", "-out", key, "2048")
    sh("openssl", "req", "-new", "-key", key, "-out", csr, "-subj", "/CN=Mesto CI/O=Mesto/C=RU")
    csr_txt = open(csr).read()
    # Лимит Apple — несколько сертификатов распространения; старые сборочные убираем,
    # последний оставляем: им подписана сборка, которая уже в TestFlight.
    old = api("GET", "/v1/certificates?filter[certificateType]=DISTRIBUTION&limit=50")["data"]
    old.sort(key=lambda c: c["attributes"].get("expirationDate", ""))
    for c in old[:-1] if len(old) >= 2 else []:
        try:
            api("DELETE", "/v1/certificates/" + c["id"]); print("убран старый сертификат", c["id"])
        except Exception:
            pass
    cert = api("POST", "/v1/certificates", {"data": {"type": "certificates", "attributes": {
        "certificateType": "DISTRIBUTION", "csrContent": csr_txt}}})["data"]
    cert_id = cert["id"]
    json.dump({"cert": cert_id}, open(STATE, "w"))
    der = os.path.join(TMP, "dist.cer")
    open(der, "wb").write(base64.b64decode(cert["attributes"]["certificateContent"]))
    pem = os.path.join(TMP, "dist.pem")
    sh("openssl", "x509", "-inform", "DER", "-in", der, "-out", pem)
    p12 = os.path.join(TMP, "dist.p12")
    sh("openssl", "pkcs12", "-export", "-legacy", "-inkey", key, "-in", pem, "-out", p12, "-passout", "pass:ci")

    kc = os.path.join(TMP, "ci.keychain-db")
    sh("security", "create-keychain", "-p", "ci", kc)
    sh("security", "set-keychain-settings", "-lut", "21600", kc)
    sh("security", "unlock-keychain", "-p", "ci", kc)
    sh("security", "import", p12, "-k", kc, "-P", "ci", "-T", "/usr/bin/codesign", "-T", "/usr/bin/security")
    sh("security", "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", "ci", kc)
    cur = subprocess.run(["security", "list-keychains", "-d", "user"], capture_output=True, text=True).stdout
    sh("security", "list-keychains", "-d", "user", "-s", kc, *[c.strip().strip('"') for c in cur.split()])

    bid = api("GET", f"/v1/bundleIds?filter[identifier]={BUNDLE}&limit=20")["data"]
    bid = [b for b in bid if b["attributes"]["identifier"] == BUNDLE][0]["id"]
    name = f"Mesto AppStore CI {int(time.time())}"
    prof = api("POST", "/v1/profiles", {"data": {"type": "profiles",
        "attributes": {"name": name, "profileType": "IOS_APP_STORE"},
        "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bid}},
                          "certificates": {"data": [{"type": "certificates", "id": cert_id}]}}}})["data"]
    st = json.load(open(STATE)); st["profile"] = prof["id"]; json.dump(st, open(STATE, "w"))
    uuid = prof["attributes"]["uuid"]
    d = os.path.expanduser("~/Library/MobileDevice/Provisioning Profiles")
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, uuid + ".mobileprovision"), "wb").write(base64.b64decode(prof["attributes"]["profileContent"]))

    # Ручная подпись только у таргета приложения (поды подписывать не нужно).
    pbx = glob.glob("ios/*.xcodeproj/project.pbxproj")[0]
    s = open(pbx).read()
    add = (f'CODE_SIGN_STYLE = Manual;\n\t\t\t\tDEVELOPMENT_TEAM = {TEAM};\n\t\t\t\t'
           f'"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";\n\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";\n\t\t\t\t'
           f'PROVISIONING_PROFILE_SPECIFIER = "{name}";\n\t\t\t\t')
    s = re.sub(r'(\n\t+)(PRODUCT_BUNDLE_IDENTIFIER = "?' + re.escape(BUNDLE) + r'"?;)', lambda m: m.group(1) + add + m.group(2), s)
    s = re.sub(r'\n\t+CODE_SIGN_STYLE = Automatic;', '', s)
    open(pbx, "w").write(s)
    for ent in glob.glob("ios/*/*.entitlements"):
        subprocess.run(["/usr/libexec/PlistBuddy", "-c", "Set :aps-environment production", ent])
    with open(os.environ["GITHUB_OUTPUT"], "a") as o:
        o.write(f"profile={name}\nuuid={uuid}\n")
    print("Подпись готова:", name)


def revoke():
    if not os.path.exists(STATE):
        return
    st = json.load(open(STATE))
    for kind, path in (("profile", "/v1/profiles/"), ("cert", "/v1/certificates/")):
        if st.get(kind):
            try:
                api("DELETE", path + st[kind]); print("удалено:", kind)
            except Exception:
                pass


if __name__ == "__main__":
    revoke() if sys.argv[1:] == ["revoke"] else setup()
