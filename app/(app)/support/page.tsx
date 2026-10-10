"use client";

import { useRouter } from "next/navigation";
import { useGuide } from "@/lib/mosya/guide";
import { Ic, Screen } from "@/components/proto/ui";
import { SupportChat } from "@/components/proto/SupportSheet";

/** Мося-помощник отдельной страницей (из бота и по ссылке). В приложении — шторка из профиля. */
export default function SupportPage() {
  const router = useRouter();
  useGuide("support");
  return (
    <Screen id="support" anim="in">
      <div className="bar-top">
        <button className="rb gl" onClick={() => router.back()} aria-label="Назад">
          <Ic n="back" />
        </button>
        <span />
      </div>
      <div style={{ display: "grid", gap: 14, marginTop: 16 }} className="suppage">
        <SupportChat />
      </div>
    </Screen>
  );
}
