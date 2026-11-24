import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileTicket, type TicketOrder } from "@/lib/payments/ticket-checkout";

const uuid = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12,"0");
const rpc = vi.fn();
const db = { rpc } as unknown as Parameters<typeof reconcileTicket>[0];
const order: TicketOrder = { id:uuid(1), event_id:uuid(2), user_id:uuid(3), attempt_id:uuid(4),
  price_kopecks:150000, provider_id:null, state:"pending", attempted_at:"", buyer_email:"buyer@example.invalid", event_title:"Вечеринка" };
const payment = {id:uuid(5),test:true,paid:false,status:"pending", amount:{value:"1500.00",currency:"RUB"},
  metadata:{ticket_order:order.id,ticket_attempt:order.attempt_id}, confirmation:{confirmation_url:"https://yoomoney.ru/checkout"}};
const fetcher = vi.fn();
beforeEach(() => {
  rpc.mockReset().mockImplementation(async (_fn, args) => ({data:args.p_state,error:null}));
  fetcher.mockReset();
  vi.stubGlobal("fetch",fetcher);
  vi.stubEnv("TICKET_TEST_SHOP_ID","1466532"); vi.stubEnv("TICKET_TEST_SECRET_KEY","test_fixture");
  order.attempted_at = new Date().toISOString();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const reply = (data: unknown) => fetcher.mockResolvedValueOnce(Response.json(data));

describe("ticket payments", () => {
  it("reuses the original idempotency key, price and order metadata on lost responses",async()=>{
    reply(payment);reply(payment);
    for (let i=0;i<2;i++) {
      expect(await reconcileTicket(db,order)).toEqual({state:"pending",confirmationUrl:payment.confirmation.confirmation_url});
      const init = fetcher.mock.calls[i]?.[1];
      expect(init.headers["Idempotence-Key"]).toBe(order.attempt_id);
      expect(JSON.parse(init.body)).toMatchObject({amount:payment.amount,metadata:payment.metadata,capture:true});
    }
  });
  it.each(["bank_card", "sbp"] as const)("sends the chosen %s method on creation and retry", async method => {
    reply(payment); reply(payment);
    for (let i = 0; i < 2; i++) {
      await reconcileTicket(db, {...order, checkout_method:method});
      expect(JSON.parse(fetcher.mock.calls[i]?.[1].body).payment_method_data).toEqual({type:method});
    }
  });
  it("verifies at the provider before sending a successful payment to the database",async()=>{
    reply({...payment,status:"succeeded",paid:true});
    expect(await reconcileTicket(db,order,payment.id)).toEqual({state:"paid",confirmationUrl:null});
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.yookassa.ru/v3/payments/"+payment.id);
    expect(rpc).toHaveBeenCalledWith("apply_ticket_payment",expect.objectContaining({p_payment:payment.id,p_amount:150000,p_state:"paid"}));
  });
  it.each([{test:false},{amount:{value:"15.00",currency:"RUB"}},{amount:{value:"1500.00",currency:"USD"}},
    {metadata:{ticket_order:uuid(7),ticket_attempt:order.attempt_id}},{status:"succeeded",paid:false},{id:uuid(9)}])(
    "rejects an unmatched provider response",async mismatch=>{
      reply({...payment,...mismatch}); await expect(reconcileTicket(db,order,payment.id)).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
    });
  it("keeps waiting_for_capture pending and accepts an authoritative cancellation",async()=>{
    reply({...payment,status:"waiting_for_capture"});reply({...payment,status:"canceled"});
    expect((await reconcileTicket(db,order,payment.id)).state).toBe("pending");
    expect((await reconcileTicket(db,order,payment.id)).state).toBe("canceled");
  });
  it("blocks live credentials, expired blind retries and reprocessing of paid orders",async()=>{
    vi.stubEnv("TICKET_TEST_SECRET_KEY","live_fixture");
    await expect(reconcileTicket(db,order)).rejects.toThrow("ticket_shop_unavailable");
    const old = {...order,attempted_at:new Date(Date.now()-25*3600_000).toISOString()};
    await expect(reconcileTicket(db,old)).rejects.toThrow("ticket_reconciliation_required");
    expect((await reconcileTicket(db,{...order,state:"paid"})).state).toBe("paid");expect(fetcher).not.toHaveBeenCalled();
  });
});
