import rawCatalog from '../data/catalog.json';

export interface Speaker {
  id: string;
  name: string;
  role: string | null;
  biography: string | null;
  photoUrl: string | null;
  profileUrl: string;
  sessionIds: string[];
  profileSource: 'speakers-page' | 'agenda-page-only';
}
export interface Session {
  id: string;
  title: string;
  speakerIds: string[];
  categoryIds: string[];
  tags: string[];
  summary: { text: string; language: string; basis: string; sourceUrl?: string; retrievedAt?: string };
  format: 'talk' | 'workshop';
  schedule: {
    date: string;
    startsAt: string;
    endsAt: string;
    durationMinutes: number;
    roomId: string;
  } | null;
  status: 'scheduled' | 'schedule-unconfirmed';
  sources: string[];
}
export interface Category { id: string; label: string }
export interface Room { id: string; name: string; kind: 'stage' | 'workshop' }
export interface Catalog {
  event: {
    id: string;
    name: string;
    location: string;
    timeZone: string;
    dates: string[];
    sourceSnapshot: string;
    abstractSnapshot?: string;
    sourcePages: { speakers: string; agenda: string };
  };
  speakers: Speaker[];
  sessions: Session[];
  categories: Category[];
  rooms: Room[];
}

export const catalog = rawCatalog as Catalog;
export const speakersById = new Map(catalog.speakers.map(s => [s.id, s]));
export const sessionsById = new Map(catalog.sessions.map(s => [s.id, s]));
export const roomsById = new Map(catalog.rooms.map(r => [r.id, r]));
export const categoriesById = new Map(catalog.categories.map(c => [c.id, c]));

export const getSpeakers = (session: Session) => session.speakerIds
  .map(id => speakersById.get(id))
  .filter((item): item is Speaker => Boolean(item));
export const getSpeakerNames = (session: Session) => getSpeakers(session).map(s => s.name).join(', ');
export const getRoomName = (session: Session) => session.schedule ? roomsById.get(session.schedule.roomId)?.name ?? 'Sala da confermare' : 'Sala da confermare';
export const getDate = (session: Session) => session.schedule?.date ?? '';
export const getTime = (session: Session) => session.schedule?.startsAt.slice(11, 16) ?? '—';
export const getEndTime = (session: Session) => session.schedule?.endsAt.slice(11, 16) ?? '—';

/** Time intervals are compared as timestamps, not slot start times: a workshop can span multiple slots. */
export function overlapping(a: Session, b: Session): boolean {
  if (!a.schedule || !b.schedule) return false;
  return Date.parse(a.schedule.startsAt) < Date.parse(b.schedule.endsAt) &&
    Date.parse(b.schedule.startsAt) < Date.parse(a.schedule.endsAt);
}
export function getConflicts(candidate: Session, selectedIds: readonly string[]): Session[] {
  return selectedIds.map(id => sessionsById.get(id)).filter((other): other is Session => Boolean(other && overlapping(other, candidate)));
}
export const sessionSort = (a: Session, b: Session) => (a.schedule?.startsAt ?? '').localeCompare(b.schedule?.startsAt ?? '') || a.title.localeCompare(b.title);
export const validSelectedIds = (ids: unknown): string[] => Array.isArray(ids)
  ? [...new Set(ids.filter((id): id is string => typeof id === 'string' && Boolean(sessionsById.get(id)?.schedule)))]
  : [];

export const DATE_LABEL: Record<string, string> = {
  '2026-10-28': 'Mercoledì 28 ottobre',
  '2026-10-29': 'Giovedì 29 ottobre',
};
