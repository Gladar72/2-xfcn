/** Compact, plain text shared by the story preview and exported image. */
export function storyDescription(description: string | null | undefined, title = ""): string {
  const text = (description ?? "").replace(/\s+/g, " ").trim();
  if (!text || text.toLocaleLowerCase("ru") === title.replace(/\s+/g, " ").trim().toLocaleLowerCase("ru")) return "";
  if (text.length <= 180) return text;
  const clipped = text.slice(0, 179);
  const space = clipped.lastIndexOf(" ");
  return (space > 140 ? clipped.slice(0, space) : clipped).trimEnd() + "…";
}

/** Public location and attendance, identical in the preview and exported story. */
export function storyMeta(event: {
  placeName?: string | null;
  address?: string | null;
  city?: string | null;
  seatsTaken?: number | null;
  seatsTotal?: number | null;
  isBusiness?: boolean | null;
  isAnonymous?: boolean | null;
}): string {
  const clean = (value?: string | null) => (value ?? "").replace(/\s+/g, " ").trim();
  const city = clean(event.city).toLocaleLowerCase("ru");
  const name = clean(event.placeName);
  const place = /^точка на карте$/i.test(name) ? "" : name;
  const address = clean(event.address).split(/,\s*/).filter(part => {
    const normalized = part.toLocaleLowerCase("ru");
    return normalized !== "россия" && (!city || normalized !== city);
  }).join(", ");
  const location = event.isAnonymous ? "место после одобрения"
    : place && address.toLocaleLowerCase("ru").includes(place.toLocaleLowerCase("ru")) ? address
    : [place, address].filter(Boolean).join(", ");
  // seats_total / seats_taken store guest places. The host also attends a
  // personal meeting, so include them in both sides, as on the event page.
  const host = event.isBusiness ? 0 : 1;
  const going = (event.seatsTaken ?? 0) + host;
  const total = (event.seatsTotal ?? 0) + host;
  return [location, `${going} из ${total}`].filter(Boolean).join(" · ");
}
