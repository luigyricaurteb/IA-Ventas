// Shared LID (Linked Device ID) → real phone number map.
// WhatsApp uses @lid JIDs as internal identifiers; this map resolves them to
// real @s.whatsapp.net phone numbers. Kept as module-level state so both
// client.ts (writer) and handler.ts (reader) can use it without circular deps.

const lidMaps = new Map<string, Map<string, string>>(); // slug → (lid → phone)

function getMap(slug: string): Map<string, string> {
  if (!lidMaps.has(slug)) lidMaps.set(slug, new Map());
  return lidMaps.get(slug)!;
}

export function resolveLid(slug: string, lid: string): string | null {
  return getMap(slug).get(lid) ?? null;
}

export function setLid(slug: string, lid: string, phone: string): void {
  getMap(slug).set(lid, phone);
}
