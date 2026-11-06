/** Compact, plain text shared by the story preview and exported image. */
export function storyDescription(description: string | null | undefined, title = ""): string {
  const text = (description ?? "").replace(/\s+/g, " ").trim();
  if (!text || text.toLocaleLowerCase("ru") === title.replace(/\s+/g, " ").trim().toLocaleLowerCase("ru")) return "";
  if (text.length <= 180) return text;
  const clipped = text.slice(0, 179);
  const space = clipped.lastIndexOf(" ");
  return (space > 140 ? clipped.slice(0, space) : clipped).trimEnd() + "…";
}
