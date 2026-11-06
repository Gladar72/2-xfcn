interface SelectedPreview {
  id: string;
  name: string;
  age: number;
  avatarUrl: string | null;
}

// A clicked photo can paint immediately while the server validates the person.
// Keep only that public card in this document, never in persistent storage.
let selected: { person: SelectedPreview; at: number } | null = null;

export function rememberSelectedPerson(person: SelectedPreview) {
  selected = { person: { id: person.id, name: person.name, age: person.age, avatarUrl: person.avatarUrl }, at: Date.now() };
}

export function selectedPersonPreview(id: string | null): SelectedPreview | null {
  return selected?.person.id === id && Date.now() - selected.at < 60_000 ? selected.person : null;
}
