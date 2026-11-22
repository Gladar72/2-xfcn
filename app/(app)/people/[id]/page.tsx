"use client";

import { PersonView } from "@/components/people/PersonView";

/** Профиль человека по ссылке (из чата, встречи, уведомлений). */
export default function PersonPage({ params, searchParams }: { params: { id: string }; searchParams: { heart?: string } }) {
  return <PersonView key={params.id} id={params.id} openedFromHeart={searchParams.heart === "1"} />;
}
