import { createPrivateKey } from "node:crypto";

const value = (process.env.APNS_KEY ?? "").trim();
const pem = value.replaceAll("\\n", "\n").replaceAll("\\r", "").replace(/\r/g, "");
const filename = /^(?:.*[/\\])?AuthKey_[A-Za-z0-9]+\.p8$/i.test(value);
function fail(reason) {
  console.error("APNS_INPUT_" + reason);
  process.exit(1);
}
if (!value) fail("EMPTY");
if (filename) fail("FILENAME_ONLY");
if (value === "APNS_PRIVATE_KEY" || value === "8XG5C5XVXD") fail("IDENTIFIER_ONLY");
const match = /^-----BEGIN PRIVATE KEY-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END PRIVATE KEY-----$/.exec(pem);
let data = match?.[1] ?? pem;
if (!/^[A-Za-z0-9+/=\s]+$/.test(data)) fail("NOT_PEM");
try {
  const decoded = Buffer.from(data.replace(/\s+/g, ""), "base64");
  const key = decoded.toString("utf8").startsWith("-----BEGIN PRIVATE KEY-----")
    ? createPrivateKey(decoded) : createPrivateKey({key: decoded, format: "der", type: "pkcs8"});
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") fail("WRONG_KEY_TYPE");
  if (process.argv.includes("--check")) console.log("APNS_INPUT_VALID");
  else process.stdout.write(key.export({format:"pem", type:"pkcs8"}));
} catch {
  fail("UNREADABLE");
}
