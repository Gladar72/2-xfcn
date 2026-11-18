import { connect, type ClientHttp2Session } from "node:http2";
import { sign } from "node:crypto";
import type { PushMessage } from "./expo";

let cached: { jwt: string; issued: number; kid: string; team: string } | undefined;

function providerToken() {
  const kid = process.env.APNS_KEY_ID;
  const team = process.env.APPLE_TEAM_ID;
  const key = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!kid || !team || !key) throw new Error("APNs provider credentials unavailable");
  const issued = Math.floor(Date.now() / 1000);
  if (cached && cached.kid === kid && cached.team === team && issued - cached.issued < 2700) return cached.jwt;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const content = encode({ alg: "ES256", kid }) + "." + encode({ iss: team, iat: issued });
  const signature = sign("sha256", Buffer.from(content), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  const jwt = content + "." + signature;
  cached = { jwt, issued, kid, team };
  return jwt;
}

type Delivery = { token: string; message: PushMessage };

function deliver(session: ClientHttp2Session, jwt: string, item: Delivery): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const req = session.request({
      ":method": "POST", ":path": "/3/device/" + item.token,
      authorization: "bearer " + jwt, "apns-topic": "ru.mesto.app",
      "apns-push-type": "alert", "apns-priority": "10",
    });
    let status = 0;
    let response = "";
    req.setEncoding("utf8");
    req.setTimeout(7000, () => req.destroy(new Error("APNs request timed out")));
    req.on("response", headers => { status = Number(headers[":status"]); });
    req.on("data", part => { response += part; });
    req.on("error", reject);
    req.on("end", () => {
      if (status !== 200 && status !== 410) console.error("APNs delivery", status, response.slice(0, 150));
      resolve(status === 410 || (status === 400 && /"BadDeviceToken"/.test(response)));
    });
    req.end(JSON.stringify({
      body: item.message.data ?? {},
      aps: { alert: { title: item.message.title.slice(0, 100), body: item.message.body.slice(0, 500) }, sound: "default" },
    }));
  });
}

/** Production APNs serves both TestFlight and App Store installations. */
export async function sendApns(items: Delivery[]): Promise<string[]> {
  if (!items.length) return [];
  const dead: string[] = [];
  const jwt = providerToken();
  const session = connect("https://api.push.apple.com");
  session.on("error", err => console.error("APNs connection", err.message));
  const deadline = setTimeout(() => session.destroy(new Error("APNs connection timeout")), 8000);
  session.once("connect", () => clearTimeout(deadline));
  try {
    for (let i = 0; i < items.length; i += 16) {
      const batch = items.slice(i, i + 16);
      const results = await Promise.allSettled(batch.map(item => deliver(session, jwt, item)));
      results.forEach((result, n) => {
        if (result.status === "rejected") console.error("APNs request failed", result.reason?.code ?? "transport");
        else if (result.value) dead.push(batch[n]!.token);
      });
    }
  } finally {
    clearTimeout(deadline);
    session.close();
  }
  return dead;
}
