"use client";

import { Suspense, useEffect, useState } from "react";
import { Paywall } from "@/components/paywall/Paywall";
import { useSearchParams } from "next/navigation";
import { CreateMeetingFlow } from "@/components/create-event/CreateMeetingFlow";
import { getJson } from "@/lib/http/get-json";

export default function CreatePage() {
  const [status, setStatus] = useState<"loading" | "needs_subscription" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    getJson<{ active: boolean }>("/api/subscriptions", controller.signal)
      .then((data) => {
        if (typeof data?.active !== "boolean") throw new Error("Invalid subscription response");
        if (!controller.signal.aborted) setStatus(data.active ? "ready" : "needs_subscription");
      })
      .catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, [attempt]);

  const checkSubscription = () => setAttempt((n) => n + 1);

  if (status === "error") {
    return <section className="scr aurora fade" data-id="create">
      <div className="empty" style={{ marginTop: 100 }}>
        <b>Не удалось проверить подписку.</b>
        <span>Проверь соединение и попробуй ещё раз.</span>
        <button className="btn v" onClick={checkSubscription}>Попробовать снова</button>
      </div>
    </section>;
  }

  if (status === "loading") {
    return (
      <section className="scr aurora fade" data-id="create">
        <div className="done" style={{ paddingTop: 200 }}>
          <div className="burst wait">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mosya/mosya_think.webp" alt="" />
          </div>
          <p>Секунду…</p>
        </div>
      </section>
    );
  }

  if (status === "needs_subscription") {
    return <Paywall onActivated={checkSubscription} />;
  }

  return (
    <Suspense>
      <CreateRouter />
    </Suspense>
  );
}

/** Встреча и бизнес-событие — один мастер из прототипа (у бизнеса свои условия: билет, гостей до 500). */
function CreateRouter() {
  const business = useSearchParams().get("business") === "true";
  return <CreateMeetingFlow business={business} />;
}
