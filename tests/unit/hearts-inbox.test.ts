import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ user: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/telegram/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { GET, PATCH } from "@/app/api/me/hearts/inbox/route";

const owner = "00000000-0000-4000-8000-000000000001";
const sender = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const at = "2026-11-20T03:04:05.000123+00:00";
const row = (id: string, from: string, viewed?: boolean) => ({ id, created_at: at, is_read: true, payload: { fromUserId: from, profileViewed: viewed } });
const profile = (id: string) => ({ id, name: "Имя", moderation_status: "active", avatar_url: null, birth_date: null });
const request = (suffix = "") => new NextRequest("https://example.test/api/me/hearts/inbox"+suffix);
function queries(results: object[][]) {
  const calls = results.map(data => {
    const query = { select: vi.fn(), update: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), in: vi.fn(), or: vi.fn(), then: (done: (r: object) => unknown) => Promise.resolve({ data, error: null }).then(done) };
    for (const f of [query.select,query.update,query.eq,query.order,query.limit,query.in,query.or]) f.mockReturnValue(query);
    return query;
  });
  const from=vi.fn();for(const q of calls)from.mockReturnValueOnce(q);mocks.admin.mockReturnValue({from});
  return calls;
}
beforeEach(()=>{vi.resetAllMocks();mocks.user.mockResolvedValue({userId:owner})});

it("keeps previously read hearts and separates inbox views from opening the bell",async()=>{
  const q=queries([[row(owner,sender,false),row(sender,sender,true),row(other,other)], [profile(sender),profile(other)],[],[]]);
  const body=await (await GET(request())).json();
  expect(body.items.map((p: {id:string;unread:boolean})=>[p.id,p.unread])).toEqual([[sender,true],[other,false]]);
  expect(q[0]?.eq).toHaveBeenCalledWith("user_id",owner);
});
it("excludes blocked senders and returns an advancing cursor even for an empty visible page",async()=>{
  const rows=Array.from({length:61},(_,i)=>row(`00000000-0000-4000-8000-${String(100-i).padStart(12,'0')}`,sender));
  queries([rows,[profile(sender)],[{blocked_id:sender}],[]]);
  const first=await (await GET(request())).json();
  expect(first.items).toEqual([]);expect(first.nextCursor).toBe(at+"_"+rows[59]?.id);
  const q=queries([[]]);await GET(request("?cursor="+encodeURIComponent(first.nextCursor)));
  expect(q[0]?.or).toHaveBeenCalledWith(expect.stringContaining(String(rows[59]?.id)));
});
it("rejects malformed cursors without running the notification query",async()=>{
  const q=queries([[]]);expect((await GET(request("?cursor=bad"))).status).toBe(400);expect(q[0]?.then).toBeDefined();expect(q[0]?.or).not.toHaveBeenCalled();
});
it("marks only the authenticated recipient's matching sender and keeps the payload",async()=>{
  const q=queries([[{id:other,payload:{fromUserId:sender,extra:"keep"}}],[]]);
  const req=new NextRequest(request().url,{method:"PATCH",body:JSON.stringify({senderId:sender})});
  expect((await PATCH(req)).status).toBe(200);
  expect(q[0]?.eq).toHaveBeenCalledWith("payload->>fromUserId",sender);
  expect(q[1]?.update).toHaveBeenCalledWith({is_read:true,payload:{fromUserId:sender,extra:"keep",profileViewed:true}});
  expect(q[1]?.eq).toHaveBeenCalledWith("user_id",owner);
  expect(q[1]?.eq).toHaveBeenCalledWith("id",other);
});
