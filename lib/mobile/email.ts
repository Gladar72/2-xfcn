/**
 * Отправка кода входа на почту через Brevo (бесплатно до 300 писем в день).
 * Env: BREVO_API_KEY, MAIL_FROM (подтверждённый в Brevo адрес отправителя),
 * MAIL_FROM_NAME (по умолчанию «Место»). Без ключа в разработке код пишется в лог.
 */
export async function sendEmailCode(email: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email:dev] ${email}: код ${code}`);
      return { ok: true };
    }
    return { ok: false, error: "email_not_configured" };
  }

  const html = `<!doctype html><html><body style="margin:0;background:#F7F3FF;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:420px;margin:0 auto;padding:32px 20px;text-align:center">
    <div style="font-size:26px;font-weight:900;letter-spacing:2px;color:#6C3BFF">МЕСТО</div>
    <div style="background:#fff;border-radius:24px;padding:28px 20px;margin-top:20px">
      <div style="font-size:16px;color:#111">Твой код для входа</div>
      <div style="font-size:40px;font-weight:800;letter-spacing:10px;color:#6C3BFF;margin:16px 0">${code}</div>
      <div style="font-size:13px;color:#686868">Код действует 10 минут. Если ты не входил в «Место» — просто удали это письмо.</div>
    </div>
  </div></body></html>`;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: from, name: process.env.MAIL_FROM_NAME || "Место" },
        to: [{ email }],
        subject: `${code} — код для входа в «Место»`,
        htmlContent: html,
        textContent: `Твой код для входа в «Место»: ${code}. Код действует 10 минут.`,
      }),
    });
    if (!res.ok) {
      console.error("sendEmailCode:", res.status, await res.text().catch(() => ""));
      return { ok: false, error: "email_failed" };
    }
    return { ok: true };
  } catch (err) {
    console.error("sendEmailCode:", err);
    return { ok: false, error: "email_failed" };
  }
}
