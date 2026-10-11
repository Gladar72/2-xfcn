"use client";

import { PersonView } from "@/components/people/PersonView";

/** Профиль человека по ссылке (из чата, встречи, уведомлений). */
export default function PersonPage({ params }: { params: { id: string } }) {
  return <PersonView id={params.id} />;
}
