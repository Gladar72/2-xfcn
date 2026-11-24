import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { fetchTicketRefund, type RefundOrder } from "@/lib/payments/ticket-refund";
import { checkTestReceipt } from "@/lib/payments/ticket-receipt";

const uuid=(i:number)=>"01234567-0000-4000-8000-"+String(i).padStart(12,"0");
const row:RefundOrder={id:uuid(1),provider_id:uuid(2),state:"refund_pending",price_kopecks:150000,
  refund_key:uuid(3),refund_id:null,refund_first_attempt:new Date().toISOString(),receipt_number:null};
const refund={id:uuid(4),payment_id:row.provider_id,status:"succeeded",amount:{value:"1500.00",currency:"RUB"}};
const http=vi.fn();
beforeEach(()=>{http.mockReset();vi.stubGlobal("fetch",http);vi.stubEnv("TICKET_TEST_SHOP_ID","1466532");vi.stubEnv("TICKET_TEST_SECRET_KEY","test_fixture");});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const reply=(data:unknown)=>http.mockResolvedValueOnce(Response.json(data));
describe("ticket refunds",()=>{
  it("uses the full captured amount and the same key on retry",async()=>{
    reply(refund);reply(refund);
    for(let i=0;i<2;i++) {
      expect((await fetchTicketRefund(row)).status).toBe("succeeded");
      const [url,init]=http.mock.calls[i]!;
      expect(url).toBe("https://api.yookassa.ru/v3/refunds");
      expect(init.headers["Idempotence-Key"]).toBe(row.refund_key);
      expect(JSON.parse(init.body)).toMatchObject({payment_id:row.provider_id,amount:refund.amount});
    }
  });
  it.each([{payment_id:uuid(8)},{amount:{value:"1499.00",currency:"RUB"}},{id:uuid(8)}])("rejects a mismatched confirmation",async change=>{
    reply({...refund,...change});await expect(fetchTicketRefund({...row,refund_id:refund.id})).rejects.toThrow();
  });
  it("only reads the original refund after the provider idempotency window",async()=>{
    const old={...row,refund_first_attempt:"2020-01-01T00:00:00Z"};
    reply({items:[]});await expect(fetchTicketRefund(old)).rejects.toThrow("reconciliation");
    reply({items:[refund]});reply(refund);expect(await fetchTicketRefund(old)).toEqual(refund);
    expect(http.mock.calls.every(c=>!c[1].method)).toBe(true);
  });
  it("registers one separate return receipt with the demo cashier and stores fiscal confirmation",async()=>{
    vi.stubEnv("ATOL_DEMO_PASSWORD","fixture");
    const state:Record<string,unknown>={state:"refunded",price_kopecks:150000,receipt_number:"1"};
    const db={from:()=>({select:()=>({eq:()=>({single:async()=>({data:state})})}),
      update:(v:object)=>({eq:async()=>{Object.assign(state,v);return {error:null};}})})} as unknown as Parameters<typeof checkTestReceipt>[0];
    reply({token:"demo"});reply({uuid:uuid(9)});reply({status:"done",payload:{total:1500,fiscal_document_number:42,fiscal_document_attribute:123}});
    expect(await checkTestReceipt(db,row.id,"sell_refund")).toBe(true);
    expect(http.mock.calls[1]![0]).toMatch(/\/sell_refund$/);
    const receipt=JSON.parse(http.mock.calls[1]![1].body);
    expect(receipt.external_id).toBe("mesto-refund-"+row.id);
    expect(receipt.receipt.client.email).toBe("buyer@example.invalid");
    expect(state.refund_receipt_number).toBe("42");
    expect(await checkTestReceipt(db,row.id,"sell_refund")).toBe(true);expect(http).toHaveBeenCalledTimes(3);
  });
});
