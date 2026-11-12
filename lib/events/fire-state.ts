export type FireValue = { count: number; mine: boolean };
export type FireSnapshot = FireValue & { pending: boolean };
type Entry = { value: FireSnapshot; confirmed: FireValue; changedAt: number; running: boolean };

/** One optimistic value per event, shared by the feed and detail screen. */
export function createFireStore(
  save: (id: string, mine: boolean) => Promise<FireValue>,
  onError: () => void = () => {},
) {
  const entries = new Map<string, Entry>();
  const listeners = new Map<string, Set<() => void>>();
  const emit = (id: string) => listeners.get(id)?.forEach(fn => fn());
  async function flush(id: string, entry: Entry) {
    entry.running = true;
    // Serialize writes: a slow POST must never overtake a newer DELETE.
    while (true) {
      const desired = entry.value.mine;
      try {
        entry.confirmed = await save(id, desired);
      } catch {
        entry.value = { ...entry.confirmed, pending: false };
        entry.changedAt = Date.now();
        entry.running = false;
        emit(id);
        onError();
        return;
      }
      entry.changedAt = Date.now();
      if (entry.value.mine === desired) {
        entry.value = { ...entry.confirmed, pending: false };
        entry.running = false;
        emit(id);
        return;
      }
      // Keep the latest tap visible while its request waits for the previous one.
      entry.value = { count: Math.max(0, entry.confirmed.count + (entry.value.mine ? 1 : -1)), mine: entry.value.mine, pending: true };
      emit(id);
    }
  }
  return {
    get: (id: string) => entries.get(id)?.value,
    subscribe(id: string, listener: () => void) {
      const group = listeners.get(id) ?? new Set();
      group.add(listener);
      listeners.set(id, group);
      return () => { group.delete(listener); if (!group.size) listeners.delete(id); };
    },
    observe(id: string, value: FireValue, requestedAt: number) {
      const entry = entries.get(id);
      // A cached home snapshot or an in-flight GET cannot undo a new tap.
      if (!entry || entry.running || requestedAt <= entry.changedAt) return;
      entry.confirmed = value;
      entry.value = { ...value, pending: false };
      emit(id);
    },
    toggle(id: string, initial: FireValue) {
      let entry = entries.get(id);
      if (!entry) {
        if (entries.size >= 200) {
          for (const [key, old] of entries) {
            if (!old.running && !listeners.has(key)) { entries.delete(key); break; }
          }
        }
        entry = { value: { ...initial, pending: false }, confirmed: initial, changedAt: 0, running: false };
        entries.set(id, entry);
      }
      const mine = !entry.value.mine;
      entry.changedAt = Date.now();
      entry.value = { mine, count: Math.max(0, entry.value.count + (mine ? 1 : -1)), pending: true };
      emit(id);
      if (!entry.running) void flush(id, entry);
    },
  };
}
