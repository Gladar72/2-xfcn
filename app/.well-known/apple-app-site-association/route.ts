import { NextResponse } from "next/server";
import { APP_BUNDLE_ID, APP_LINK_PATHS } from "@/lib/applinks";

/**
 * /.well-known/apple-app-site-association — iPhone проверяет этот файл и после этого
 * открывает ссылки mesto-go.ru сразу в приложении. Нужен APPLE_TEAM_ID (Team ID из
 * developer.apple.com → Membership). Без него отдаём 404 — ссылки просто открываются в браузере.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const team = process.env.APPLE_TEAM_ID?.trim();
  if (!team) return new NextResponse("Not found", { status: 404 });
  const appID = `${team}.${APP_BUNDLE_ID}`;
  return NextResponse.json(
    {
      applinks: {
        details: [{ appIDs: [appID], components: APP_LINK_PATHS.map((p) => ({ "/": p })) }],
      },
      webcredentials: { apps: [appID] },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
