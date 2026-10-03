import { writeFile, mkdir } from "node:fs/promises";
// Pin both catalog and assets to one revision; updating this file is an explicit release operation.
const revision =
  process.env.SPRITE_REVISION || "d2ceb96254fbd52385a5ca495eaa98c1626f9323";
if (!/^[a-f0-9]{40}$/.test(revision))
  throw new Error("SPRITE_REVISION must be a full Git SHA");
const base = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/${revision}`;
async function get(file: string) {
  const r = await fetch(`${base}/${file}`);
  if (!r.ok) throw new Error(`${file}: ${r.status}`);
  return r.text();
}
const [trackerText, credits, license] = await Promise.all(
  ["tracker.json", "credit_names.txt", "LICENSE.md"].map(get),
);
const names = new Map(
  credits
    .split("\n")
    .slice(1)
    .map((line) => {
      const [name, id, contact] = line.split("\t");
      return [id, { name, contact }];
    }),
);
const entries: object[] = [];
function walk(node: any, path: string, species: string, forms: string[]) {
  if (
    node.sprite_credit.primary &&
    Object.keys(node.sprite_files).some((a) => a === "Idle" || a === "Walk")
  ) {
    entries.push({
      id: path.replaceAll("/", "-"),
      path,
      number: Number(path.split("/")[0]),
      species,
      form: forms.filter(Boolean).join(" · ").replaceAll("_", " "),
      animations: Object.keys(node.sprite_files),
      artists: [
        node.sprite_credit.primary,
        ...node.sprite_credit.secondary,
      ].map((id) => names.get(id) || { name: id }),
    });
  }
  for (const [id, child] of Object.entries<any>(node.subgroups))
    walk(child, `${path}/${id}`, species, [...forms, child.name]);
}
for (const [id, node] of Object.entries<any>(JSON.parse(trackerText)))
  if (Number(id) > 0) walk(node, id, node.name, []);
await mkdir("data", { recursive: true });
await writeFile("data/catalog.json", JSON.stringify({ revision, entries }));
await writeFile("data/ARTWORK-LICENSE.md", license);
await writeFile("data/credit_names.txt", credits);
console.log(`Indexed ${entries.length} sprite variants at ${revision}`);
