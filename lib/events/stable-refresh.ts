/** Refresh fields without moving existing cards under the user's finger. */
export function stableRefresh<T extends { id: string }>(previous: T[], incoming: T[]): T[] {
  const fresh = new Map(incoming.map(item => [item.id, item]));
  const ordered: T[] = [];
  for (const old of previous) {
    const item = fresh.get(old.id);
    if (item) { ordered.push(item); fresh.delete(old.id); }
  }
  return [...ordered, ...fresh.values()];
}
