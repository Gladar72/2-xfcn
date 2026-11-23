const crypto = require("node:crypto");
const assert = require("node:assert/strict");
async function check() {
  assert.equal(process.env.TICKET_SANDBOX, "1");
  const rest = process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.equal(rest, "http://gateway:8000");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(rest + "/rest/v1/rpc/ticket_test_guest", {
    method: "POST", headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({p_sub:"mesto-internal-sandbox-smoke"}),
  });
  assert.equal(res.status, 200, "Synthetic guest must have two approved reservations");
  const id = await res.json();
  const encode = obj => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const payload = encode({alg:"HS256",typ:"JWT"}) + "." + encode({
    sub:id, role:"authenticated", telegram_id:0, exp:Math.floor(Date.now()/1000)+60,
  });
  const token = payload + "." + crypto.createHmac("sha256",process.env.SUPABASE_JWT_SECRET).update(payload).digest("base64url");
  const headers = {Authorization:"Bearer " + token, "X-App-Platform":"ios", "Content-Type":"application/json"};
  const base = "http://127.0.0.1:3000/api/";
  for (const event of ["5717f10a-0000-4000-8000-000000000011", "5717f10a-0000-4000-8000-000000000012"]) {
    const detail = await fetch(base + "events/" + event,{headers});
    assert.equal(detail.status, 200, "Mobile event detail");
    const data = await detail.json();
    assert.equal(data.onlineCheckout?.state, "approved");
    assert.equal(data.onlineCheckout?.priceKopecks, 150000);
    assert.ok(data.onlineCheckout.termsVersion && data.onlineCheckout.terms);
    const status = await fetch(base+"events/"+event+"/checkout", {method:"POST", headers, body:JSON.stringify({action:"status"})});
    assert.equal(status.status, 200, "Mobile checkout status");
    assert.equal((await status.json()).state,"approved");
  }
  const basic = Buffer.from(process.env.TICKET_TEST_SHOP_ID + ":" + process.env.TICKET_TEST_SECRET_KEY).toString("base64");
  const bank = await fetch("https://api.yookassa.ru/v3/payments?limit=1", {
    headers: {Authorization:"Basic " + basic}, signal: AbortSignal.timeout(15000),
  });
  assert.equal(bank.status,200,"Sandbox acquiring authentication");
  const payments = (await bank.json()).items;
  assert.ok(Array.isArray(payments) && payments.every(p => p.test === true),"Test transactions only");
  if (process.env.ATOL_DEMO_PASSWORD) {
    const receipt = await fetch("https://testonline.atol.ru/possystem/v4/getToken", {
      method:"POST", headers:{"Content-Type":"application/json"}, signal:AbortSignal.timeout(15000),
      body:JSON.stringify({login:"v4-online-atol-ru",pass:process.env.ATOL_DEMO_PASSWORD}),
    });
    assert.ok(receipt.ok && (await receipt.json()).token,"ATOL demo authentication");
    console.log("ATOL demo authentication: OK");
  }
  const worker = await fetch("http://127.0.0.1:3000/api/cron/ticket-refunds", {
    headers:{Authorization:"Bearer " + process.env.CRON_SECRET},
  });
  assert.equal(worker.status,200,"Background payment and refund verification");
  console.log("Background payment and refund verification: OK");
  console.log("YooKassa test authentication: OK");
  console.log("Authenticated iPhone API: both events, agreement, price and reservation status verified");
}
check().catch(e => {console.error(e.message); process.exitCode=1;});
