import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { eventTiming } from "@/lib/events/timing";
import { eventSchedule } from "@/lib/payments/ticket-terms";

export async function POST(req: Request,{params}:{params:{id:string}}) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({error:"unauthorized"},{status:401});
  const body = await req.json().catch(() => null);
  const note = body?.note;
  if (note != null && (typeof note !== "string" || note.length > 500)) {
    return NextResponse.json({message:"Причина обращения должна быть не длиннее 500 символов."},{status:400});
  }
  const db = createAdminClient({noStore:true});
  const event = await db.from("events").select("event_date,event_time,event_end_time,city,longitude").eq("id",params.id).maybeSingle();
  if (event.error || !event.data) return NextResponse.json({error:"event_unavailable"},{status:404});
  const result = await db.rpc("submit_ticket_refund",{p_note:note?.trim() || null,p_event:params.id,p_user:user.userId,
    p_start:eventTiming(event.data).start.toISOString(),p_event_snapshot:eventSchedule(event.data)});
  if (result.error) return NextResponse.json({message:"Не удалось зарегистрировать заявление. Попробуй ещё раз."},{status:503});
  if (["refund_pending","refunded","refund_review"].includes(result.data)) return NextResponse.json({state:result.data});
  return NextResponse.json({message:result.data === "support" ? "Сейчас этот билет можно вернуть через поддержку." :
    "Обнови билет и проверь его статус."},{status:409});
}
