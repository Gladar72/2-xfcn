"use client";

import { Suspense } from "react";
import { CreateMeetingFlow } from "@/components/create-event/CreateMeetingFlow";

/** Правка встречи — тот же мастер, что и создание (как в прототипе: «Правка 1/4»). */
export default function EditEventPage({ params }: { params: { id: string } }) {
  return (
    <Suspense>
      <CreateMeetingFlow editId={params.id} />
    </Suspense>
  );
}
