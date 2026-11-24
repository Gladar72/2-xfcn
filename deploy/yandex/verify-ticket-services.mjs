// Run inside the ticket service with its production environment. No orders or receipts are created.
function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing " + name);
  return value;
}

async function providerJson(name, url, init) {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(name + " returned HTTP " + response.status);
  return response.json();
}

async function verifyShop() {
  const shopId = required("TICKET_LIVE_SHOP_ID");
  const secret = required("TICKET_LIVE_SECRET_KEY");
  if (!/^\d+$/.test(shopId) || !secret.startsWith("live_") || shopId === process.env.YOOKASSA_SHOP_ID) {
    throw new Error("Expected dedicated live ticket credentials");
  }
  const basic = Buffer.from(shopId + ":" + secret).toString("base64");
  const shop = await providerJson("YooKassa", "https://api.yookassa.ru/v3/me", {
    headers: { Authorization: "Basic " + basic },
  });
  if (shop.account_id !== shopId || shop.test !== false || shop.status !== "enabled") {
    throw new Error("YooKassa did not confirm an enabled live ticket shop");
  }
  const methods = Array.isArray(shop.payment_methods) ? shop.payment_methods : [];
  if (!methods.includes("bank_card")) throw new Error("Card payments are unavailable");
  console.log("YooKassa ticket shop verified. Card: enabled. SBP:", methods.includes("sbp") ? "enabled" : "unavailable");
  if (shop.fiscalization_enabled !== false) {
    throw new Error("Verify YooKassa receipt routing before enabling direct ATOL receipts");
  }
  console.log("YooKassa fiscalization is disabled for this shop.");
}

async function verifyCashRegister() {
  const version = required("TICKET_ATOL_API_VERSION");
  if (!["v4", "v5"].includes(version)) throw new Error("Unrecognized ATOL protocol version");
  required("TICKET_ATOL_GROUP");
  const result = await providerJson("ATOL", "https://online.atol.ru/possystem/" + version + "/getToken", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ login: required("TICKET_ATOL_LOGIN"), pass: required("TICKET_ATOL_PASSWORD") }),
  });
  if (result.error || typeof result.token !== "string" || !result.token) {
    throw new Error("ATOL did not confirm the live credentials");
  }
  console.log("ATOL live authentication confirmed for " + version + ".");
}

const checks = await Promise.allSettled([verifyShop(), verifyCashRegister()]);
for (const result of checks) {
  if (result.status === "rejected") {
    console.error(result.reason instanceof Error ? result.reason.message : "Provider check failed");
    process.exitCode = 1;
  }
}
