"use client";

import { Suspense, useEffect, useState } from "react";
import { Paywall } from "@/components/paywall/Paywall";
import { useSearchParams } from "next/navigation";
import { CreateMeetingFlow } from "@/components/create-event/CreateMeetingFlow";

export default function CreatePage() {
  const [status, setStatus] = useState<"loading" | "needs_subscription" | "ready">("loading");

  useEffect(() => {
    checkSubscription();
  }, []);

  function checkSubscription() {
    setStatus("loading");
    fetch("/api/subscriptions")
      .then((r) => r.json())
      .then((data) => setStatus(data.active ? "ready" : "needs_subscription"))
      .catch(() => setStatus("needs_subscription"));
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
