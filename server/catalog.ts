import catalog from '../data/catalog.json';
export const entries = catalog.entries;
export type Entry = typeof entries[number];
export const revision = catalog.revision;
export const upstream = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/${revision}`;
const byId = new Map(entries.map(entry => [entry.id,entry]));
export function findEntry(id: string): Entry {
  const entry = byId.get(id);
  if (!entry) throw new Error('This Pokémon or form is not in the sprite catalog.');
  return entry;
}
