"use client";

import { Suspense, useEffect, useState } from "react";
import { Paywall } from "@/components/paywall/Paywall";
import { CreateEventWizard } from "@/components/create-event/CreateEventWizard";

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
      <div className="flex min-h-[70vh] items-center justify-center">
        <p className="text-ink-600">Загрузка...</p>
      </div>
    );
  }

  if (status === "needs_subscription") {
    return <Paywall onActivated={checkSubscription} />;
  }

  return (
    <Suspense>
      <CreateEventWizard />
    </Suspense>
  );
}
