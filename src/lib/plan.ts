import { catalog, validSelectedIds, sessionsById, getConflicts, sessionSort, type Session } from './catalog';

/** User-only data: never imported from static assets or checked into the repository. */
export interface PlanState {
  selectedIds: string[];
  savedIds: string[];
  ratings: Record<string, number>;
  notes: Record<string, string>;
}
export const PLAN_STORAGE_KEY = `codepath:${catalog.event.id}:v1`;
export const EMPTY_PLAN: PlanState = { selectedIds: [], savedIds: [], ratings: {}, notes: {} };
function parseStoredPlan(json: string | null): PlanState | null {
  if (!json) return null;
  try {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const o = value as Record<string, unknown>;
    const savedIds = Array.isArray(o.savedIds) ? o.savedIds.filter((id): id is string => typeof id === 'string' && sessionsById.has(id)) : [];
    const ratings = Object.fromEntries(Object.entries(o.ratings && typeof o.ratings === 'object' ? o.ratings : {}).filter(([id, rating]) => sessionsById.has(id) && typeof rating === 'number' && Number.isInteger(rating) && rating >= 1 && rating <= 5));
    const notes = Object.fromEntries(Object.entries(o.notes && typeof o.notes === 'object' ? o.notes : {}).filter(([id, note]) => sessionsById.has(id) && typeof note === 'string').map(([id, note]) => [id, (note as string).slice(0, 4000)]));
    // All user data is validated against the current immutable conference catalog.
    return { selectedIds: validSelectedIds(o.selectedIds), savedIds: [...new Set(savedIds)], ratings, notes };
  } catch { return null; }
}

/** Persistent, per-origin storage. Existing sessionStorage users are migrated on first load. */
export function readPlan(): PlanState {
  try {
    const local = parseStoredPlan(localStorage.getItem(PLAN_STORAGE_KEY));
    if (local) return local;
  } catch { /* localStorage may be disabled by browser policy */ }
  try {
    const legacy = parseStoredPlan(sessionStorage.getItem(PLAN_STORAGE_KEY));
    if (legacy) return legacy;
  } catch { /* legacy storage may also be inaccessible */ }
  return { ...EMPTY_PLAN };
}
export function storePlan(plan: PlanState): void {
  try {
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
    // Remove old tab-session data only after localStorage succeeded.
    try { sessionStorage.removeItem(PLAN_STORAGE_KEY); } catch { /* harmless */ }
  } catch { /* browser/storage restriction: continue with in-memory React state */ }
}
export function downloadText(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], {type: mime});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportPlan(plan: PlanState): void {
  downloadText('codemotion-il-mio-percorso.json', JSON.stringify({schemaVersion: 1, eventId: catalog.event.id, exportedAt: new Date().toISOString(), ...plan}, null, 2), 'application/json');
}
export function parseImportedPlan(text: string): PlanState {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object') throw new Error('Il file non contiene un percorso valido.');
  const data = raw as Record<string, unknown>;
  if (data.eventId !== catalog.event.id) throw new Error('Il percorso appartiene a un altro evento.');
  const selectedIds = validSelectedIds(data.selectedIds);
  // Only import a conflict-free selection; never silently alter someone's saved itinerary.
  const selected: Session[] = [];
  for (const id of selectedIds) {
    const s = sessionsById.get(id)!;
    if (getConflicts(s, selected.map(v => v.id)).length) throw new Error('Il file contiene talk sovrapposti. Controlla le selezioni.');
    selected.push(s);
  }
  const savedIds = Array.isArray(data.savedIds) ? data.savedIds.filter((id): id is string => typeof id === 'string' && sessionsById.has(id)) : [];
  const ratings = Object.fromEntries(Object.entries(data.ratings && typeof data.ratings === 'object' ? data.ratings : {}).filter(([id, r]) => sessionsById.has(id) && typeof r === 'number' && Number.isInteger(r) && r >= 1 && r <= 5));
  const notes = Object.fromEntries(Object.entries(data.notes && typeof data.notes === 'object' ? data.notes : {}).filter(([id, n]) => sessionsById.has(id) && typeof n === 'string').map(([id, n]) => [id, (n as string).slice(0, 4000)]));
  return {selectedIds: selected.map(s => s.id), savedIds: [...new Set(savedIds)], ratings, notes};
}
function icsEscape(str: string): string { return str.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'); }
function utcIcs(iso: string): string { return new Date(iso).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'); }
export function exportIcs(selectedIds: string[]): void {
  const sessions = selectedIds.map(id => sessionsById.get(id)).filter((s): s is Session => Boolean(s?.schedule)).sort(sessionSort);
  if (!sessions.length) return;
  const now = utcIcs(new Date().toISOString());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Codepath//Codemotion 2026//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const s of sessions) {
    lines.push('BEGIN:VEVENT', `UID:${s.id}@codepath.local`, `DTSTAMP:${now}`, `DTSTART:${utcIcs(s.schedule!.startsAt)}`, `DTEND:${utcIcs(s.schedule!.endsAt)}`, `SUMMARY:${icsEscape(s.title)}`, `LOCATION:${icsEscape(getIcsLocation(s))}`, `DESCRIPTION:${icsEscape(s.summary.text)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  downloadText('codemotion-milano-2026.ics', lines.join('\r\n') + '\r\n', 'text/calendar;charset=utf-8');
}
function getIcsLocation(s: Session): string { return `${catalog.event.location} — ${catalog.rooms.find(r => r.id === s.schedule?.roomId)?.name ?? ''}`; }
