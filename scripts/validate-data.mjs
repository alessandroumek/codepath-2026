import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(resolve(root, 'src/data/catalog.json'), 'utf8'));
const assert = (condition, message) => {if (!condition) throw new Error(message)};
const unique = items => new Set(items).size === items.length;
const speakerIds = new Set(catalog.speakers.map(s => s.id));
const sessionIds = new Set(catalog.sessions.map(s => s.id));
const categoryIds = new Set(catalog.categories.map(c => c.id));
const roomIds = new Set(catalog.rooms.map(r => r.id));
assert(unique([...speakerIds]) && sessionIds.size === catalog.sessions.length, 'Duplicate session IDs');
assert(speakerIds.size === catalog.speakers.length, 'Duplicate speaker IDs');
for (const session of catalog.sessions) {
  for (const id of session.speakerIds) assert(speakerIds.has(id), `Unknown speaker: ${session.id} / ${id}`);
  for (const id of session.categoryIds) assert(categoryIds.has(id), `Unknown category: ${session.id} / ${id}`);
  if (session.schedule) {
    assert(roomIds.has(session.schedule.roomId), `Unknown room: ${session.id}`);
    assert(Date.parse(session.schedule.endsAt) > Date.parse(session.schedule.startsAt), `Invalid schedule: ${session.id}`);
  }
}
for (const speaker of catalog.speakers) {
  for (const id of speaker.sessionIds) assert(sessionIds.has(id), `Unknown talk: ${speaker.id} / ${id}`);
}
console.log(`Validato: ${catalog.speakers.length} speaker, ${catalog.sessions.length} sessioni, ${catalog.sessions.filter(s=>s.schedule).length} sessioni con orario, ${catalog.categories.length} categorie, ${catalog.rooms.length} sale.`);
