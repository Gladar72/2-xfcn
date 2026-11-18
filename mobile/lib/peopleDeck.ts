export function appendPeople<T extends { id: string }>(current: T[], page: T[], dismissed: ReadonlySet<string>): T[] {
  const ids = new Set(current.map(person => person.id));
  const next = [...current];
  for (const person of page) {
    if (!person.id || ids.has(person.id) || dismissed.has(person.id)) continue;
    ids.add(person.id);
    next.push(person);
  }
  return next;
}
