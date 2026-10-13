import { NextResponse } from "next/server";
import { ANDROID_PACKAGE } from "@/lib/applinks";

/**
 * /.well-known/assetlinks.json — Android проверяет этот файл (App Links) и открывает
 * ссылки mesto-go.ru сразу в приложении. Адрес с «.json» middleware переписывает сюда.
 * ANDROID_CERT_SHA256 — отпечатки SHA-256 ключей подписи через запятую
 * (ключ сборки EAS/RuStore и ключ Google Play App Signing).
 */
export const dynamic = "force-dynamic";

export function GET() {
  const prints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  if (prints.length === 0) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: prints },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
