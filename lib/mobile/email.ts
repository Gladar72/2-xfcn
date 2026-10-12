import { createHash, createHmac } from "crypto";

/**
 * Отправка кода входа на почту.
 * Основной способ — Yandex Cloud Postbox (российский сервис, оплата в рублях).
 * Env: POSTBOX_ACCESS_KEY_ID, POSTBOX_SECRET_KEY (статический ключ сервисного
 * аккаунта с ролью postbox.sender), MAIL_FROM (например noreply@mesto-go.ru),
 * MAIL_FROM_NAME (по умолчанию «Место»).
 * Запасной способ — Brevo (BREVO_API_KEY). Без ключей в разработке код пишется в лог.
 */
export async function sendEmailCode(email: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const from = process.env.MAIL_FROM;
  const fromName = process.env.MAIL_FROM_NAME || "Место";
  const subject = `${code} — код для входа в «Место»`;
  const text = `Твой код для входа в «Место»: ${code}. Код действует 10 минут.`;
  const html = `<!doctype html><html><body style="margin:0;background:#F7F3FF;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:420px;margin:0 auto;padding:32px 20px;text-align:center">
    <div style="font-size:26px;font-weight:900;letter-spacing:2px;color:#6C3BFF">МЕСТО</div>
    <div style="background:#fff;border-radius:24px;padding:28px 20px;margin-top:20px">
      <div style="font-size:16px;color:#111">Твой код для входа</div>
      <div style="font-size:40px;font-weight:800;letter-spacing:10px;color:#6C3BFF;margin:16px 0">${code}</div>
      <div style="font-size:13px;color:#686868">Код действует 10 минут. Если ты не входил в «Место» — просто удали это письмо.</div>
    </div>
  </div></body></html>`;

  const keyId = process.env.POSTBOX_ACCESS_KEY_ID?.trim();
  const secret = process.env.POSTBOX_SECRET_KEY?.trim();
  if (keyId && secret && from) {
    return sendViaPostbox({ keyId, secret, from, fromName, to: email, subject, text, html });
  }

  const brevoKey = process.env.BREVO_API_KEY;
  if (brevoKey && from) {
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevoKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender: { email: from, name: fromName }, to: [{ email }], subject, htmlContent: html, textContent: text }),
      });
      if (!res.ok) {
        console.error("sendEmailCode brevo:", res.status, await res.text().catch(() => ""));
        return { ok: false, error: "email_failed" };
      }
      return { ok: true };
    } catch (err) {
      console.error("sendEmailCode brevo:", err);
      return { ok: false, error: "email_failed" };
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[email:dev] ${email}: код ${code}`);
    return { ok: true };
  }
  return { ok: false, error: "email_not_configured" };
}

const POSTBOX_HOST = "postbox.cloud.yandex.net";
const POSTBOX_REGION = "ru-central1";
const POSTBOX_SERVICE = "ses";

const sha256hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const hmac = (key: Buffer | string, s: string) => createHmac("sha256", key).update(s, "utf8").digest();

/** Имя отправителя кириллицей кодируем по RFC 2047, иначе почтовики его ломают. */
function encodeFrom(name: string, address: string): string {
  return `=?UTF-8?B?${Buffer.from(name, "utf8").toString("base64")}?= <${address}>`;
}

/**
 * Postbox совместим с Amazon SES v2 API — подписываем запрос AWS Signature V4
 * вручную, без тяжёлого SDK.
 */
async function sendViaPostbox(p: {
  keyId: string;
  secret: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const path = "/v2/email/outbound-emails";
  const body = JSON.stringify({
    FromEmailAddress: encodeFrom(p.fromName, p.from),
    Destination: { ToAddresses: [p.to] },
    Content: {
      Simple: {
        Subject: { Data: p.subject, Charset: "UTF-8" },
        Body: { Text: { Data: p.text, Charset: "UTF-8" }, Html: { Data: p.html, Charset: "UTF-8" } },
      },
    },
  });

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20261012T150000Z
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body);
  const canonicalHeaders = `content-type:application/json\nhost:${POSTBOX_HOST}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = ["POST", path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${POSTBOX_REGION}/${POSTBOX_SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${p.secret}`, dateStamp);
  const kRegion = hmac(kDate, POSTBOX_REGION);
  const kService = hmac(kRegion, POSTBOX_SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  try {
    const res = await fetch(`https://${POSTBOX_HOST}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-amz-date": amzDate,
        authorization: `AWS4-HMAC-SHA256 Credential=${p.keyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body,
    });
    if (!res.ok) {
      // Диагностика без раскрытия секрета: формат ID ключа (у Яндекса начинается с «YCAJ») и длина секрета (обычно 40).
      console.error(
        "sendEmailCode postbox:",
        res.status,
        await res.text().catch(() => ""),
        `keyId=${p.keyId.slice(0, 4)}…(${p.keyId.length}) secretLen=${p.secret.length} from=${p.from}`
      );
      return { ok: false, error: "email_failed" };
    }
    return { ok: true };
  } catch (err) {
    console.error("sendEmailCode postbox:", err);
    return { ok: false, error: "email_failed" };
  }
}
