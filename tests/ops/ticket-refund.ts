// Refund only the paid fixture from the verified checkout run in shop 1466532.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ticketProviderRequest } from "../../lib/payments/ticket-checkout";
import { fetchTicketRefund, type RefundOrder } from "../../lib/payments/ticket-refund";
const originalRun = "45178554089";
const paymentId = "32967f48-000f-5001-a000-1e52d16fd004";
function fixtureId(label:string) {
  const hex=createHash("sha256").update("mesto-test-"+originalRun+"-"+label).digest("hex");
  return [hex.slice(0,8),hex.slice(8,12),"4"+hex.slice(13,16),"8"+hex.slice(17,20),hex.slice(20,32)].join("-");
}
async function run() {
  assert.equal(process.env.TICKET_TEST_SHOP_ID,"1466532");
  const payment=await ticketProviderRequest("payments/"+paymentId);
  assert.equal(payment.test,true);
  assert.equal(payment.status,"succeeded");
  assert.equal(payment.paid,true);
  assert.equal(payment.amount.value,"1500.00");
  assert.equal(payment.amount.currency,"RUB");
  assert.equal(payment.metadata.ticket_order,fixtureId("order"));
  assert.equal(payment.metadata.ticket_attempt,fixtureId("attempt"));
  const prior=await ticketProviderRequest("refunds?payment_id="+paymentId);
  assert.ok(Array.isArray(prior.items) && prior.items.length<=1 && !prior.next_cursor);
  const order: RefundOrder={id:fixtureId("order"),state:"refund_pending",price_kopecks:150000,provider_id:paymentId,
    receipt_number:null,refund_key:fixtureId("refund"),refund_first_attempt:new Date().toISOString(),refund_id:prior.items[0]?.id ?? null};
  for (let i=0;i<24;i++) {
    const refund=await fetchTicketRefund(order);
    if (refund.status==="succeeded") {console.log("ЮKassa Test подтвердила полный возврат 1 500 ₽.");return;}
    assert.equal(refund.status,"pending");
    order.refund_id=refund.id;
    await new Promise(resolve=>setTimeout(resolve,5000));
  }
  throw new Error("Refund still pending");
}
run().catch(err=>{console.error("Ticket refund test failed:",err instanceof Error ? err.name : "error");process.exitCode=1;});
