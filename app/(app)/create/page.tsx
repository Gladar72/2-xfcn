"use client";

import { Suspense, useEffect, useState } from "react";
import { Paywall } from "@/components/paywall/Paywall";
import { useSearchParams } from "next/navigation";
import { CreateEventWizard } from "@/components/create-event/CreateEventWizard";
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
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-2 text-sm text-ink-600">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mosya/mosya_think.webp" alt="" className="h-24 w-24 animate-pulse object-contain" />
        Секунду…
      </div>
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

/** Бизнес-события — прежний мастер (свои шаги про билеты и чат), обычные встречи — новые 4 шага. */
function CreateRouter() {
  const business = useSearchParams().get("business") === "true";
  return business ? <CreateEventWizard /> : <CreateMeetingFlow />;
}
