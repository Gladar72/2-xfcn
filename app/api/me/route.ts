import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";

/** GET /api/me — используется клиентом, чтобы узнать свой userId (uuid). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ userId: user.userId });
}
