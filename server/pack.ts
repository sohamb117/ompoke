import sharp from "sharp";
import { XMLParser } from "fast-xml-parser";
import { zipSync, strToU8 } from "fflate";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { findEntry, revision, upstream } from "./catalog";
import { source } from "./source";
export const states = [
  "idle",
  "working",
  "waiting",
  "compacting",
  "error",
  "sleep",
  "celebrate",
] as const;
export type State = (typeof states)[number];
export type Frame = {
  file: string;
  x: number;
  y: number;
  width: number;
  height: number;
  duration_ms: number;
};
export type Manifest = {
  version: number;
  pixel_art: boolean;
  frame_ms: number;
} & Record<State, Frame[]>;
const choices: Record<State, string[]> = {
  idle: ["Idle", "Walk"],
  working: ["Walk", "Run", "Attack"],
  waiting: ["LookUp", "Pose", "Idle"],
  compacting: ["Charge", "DeepBreath", "Walk"],
  error: ["Hurt", "Pain", "Idle"],
  sleep: ["Sleep", "EventSleep"],
  celebrate: ["Hop", "Happy", "Pose", "Walk"],
};
type Animation = {
  Name: string;
  CopyOf?: string;
  FrameWidth?: number;
  FrameHeight?: number;
  Durations?: { Duration: number | number[] };
};
export function animations(xml: string): Map<string, Animation> {
  if (xml.includes("<!DOCTYPE") || xml.includes("<!ENTITY"))
    throw new Error("Unsupported sprite XML");
  const parsed = new XMLParser({ parseTagValue: true }).parse(xml)?.AnimData
    ?.Anims?.Anim;
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (!list[0]) throw new Error("No animations in this sprite set");
  return new Map(list.map((a) => [String(a.Name), a]));
}
export function resolveAnimation(
  all: Map<string, Animation>,
  name: string,
  visited = new Set<string>(),
): Animation {
  if (visited.has(name)) throw new Error("Circular animation alias");
  visited.add(name);
  const a = all.get(name);
  if (!a) throw new Error(`Missing animation ${name}`);
  return a.CopyOf ? resolveAnimation(all, String(a.CopyOf), visited) : a;
}
export function sampleDurations(durations: number[], maximum = 16) {
  if (
    !durations.length ||
    durations.length > 512 ||
    durations.some((d) => !Number.isFinite(d) || d <= 0)
  )
    throw new Error("Invalid animation durations");
  const n = Math.min(maximum, durations.length);
  return Array.from({ length: n }, (_, i) => {
    const index = Math.floor((i * durations.length) / n),
      end = Math.floor(((i + 1) * durations.length) / n);
    return {
      index,
      duration_ms: Math.min(
        2000,
        Math.max(
          80,
          Math.round(
            (durations.slice(index, end).reduce((a, b) => a + b, 0) * 1000) /
              60,
          ),
        ),
      ),
    };
  });
}
export type Pack = {
  manifest: Manifest;
  mapping: Record<State, string>;
  notes: string[];
  files: Record<string, Uint8Array>;
  zip: Buffer;
  sha256: string;
  filename: string;
  credits: string;
};
async function normalizedFrame(
  sheet: Buffer,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const { data, info } = await sharp(sheet)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let x1 = width,
    y1 = height,
    x2 = -1,
    y2 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 0) {
        x1 = Math.min(x1, x);
        y1 = Math.min(y1, y);
        x2 = Math.max(x2, x);
        y2 = Math.max(y2, y);
      }
  if (x2 < 0)
    return sharp({
      create: { width: 128, height: 128, channels: 4, background: "#00000000" },
    })
      .png()
      .toBuffer();
  return sharp(data, { raw: info })
    .extract({ left: x1, top: y1, width: x2 - x1 + 1, height: y2 - y1 + 1 })
    .resize(128, 128, {
      fit: "contain",
      kernel: "nearest",
      background: "#00000000",
    })
    .png()
    .toBuffer();
}
export async function compilePack(
  id: string,
  direction: number,
): Promise<Pack> {
  const entry = findEntry(id);
  if (!Number.isInteger(direction) || direction < 0 || direction > 7)
    throw new Error("Direction must be 0–7");
  const xml = (
    await source(`sprite/${entry.path}/AnimData.xml`, 256 * 1024)
  ).toString();
  const all = animations(xml);
  const idle = choices.idle.find((n) => all.has(n));
  if (!idle) throw new Error("This sprite set has no idle or walk animation");
  const files: Record<string, Uint8Array> = {};
  const manifest = { version: 1, pixel_art: true, frame_ms: 200 } as Manifest;
  const mapping = {} as Record<State, string>;
  const notes: string[] = [];
  const built = new Map<string, Frame[]>();
  for (const state of states) {
    const picked = choices[state].find((n) => all.has(n));
    const name = picked || idle;
    const a = resolveAnimation(all, name);
    const resolved = String(a.Name);
    if (!/^[a-zA-Z0-9_-]+$/.test(resolved))
      throw new Error("Invalid upstream animation filename");
    mapping[state] = picked ? name : `${idle} (fallback)`;
    if (!picked)
      notes.push(
        `${state}: this form has no dedicated animation; uses ${idle}${state === "sleep" ? " as a still pose" : ""}.`,
      );
    if (!built.has(resolved)) {
      const w = Number(a.FrameWidth),
        h = Number(a.FrameHeight);
      if (
        !Number.isInteger(w) ||
        !Number.isInteger(h) ||
        w < 1 ||
        h < 1 ||
        w > 1024 ||
        h > 1024
      )
        throw new Error("Unsupported frame dimensions");
      const ds = a.Durations?.Duration;
      const durations = Array.isArray(ds) ? ds : [Number(ds)];
      const samples = sampleDurations(durations);
      if (durations.length > 16)
        notes.push(
          `${name}: ${durations.length} frames sampled to 16 for OMP Pet.`,
        );
      const sheet = await source(`sprite/${entry.path}/${resolved}-Anim.png`);
      const meta = await sharp(sheet, {
        limitInputPixels: 16_777_216,
      }).metadata();
      if (
        !meta.width ||
        !meta.height ||
        meta.width < w * durations.length ||
        meta.height < h ||
        meta.height % h
      )
        throw new Error("Sprite sheet does not match its animation");
      const rows = meta.height / h;
      if (rows !== 1 && rows !== 8)
        throw new Error("Unsupported sprite direction layout");
      const row = rows === 1 ? 0 : direction;
      const frames: Buffer[] = [];
      for (const sample of samples)
        frames.push(
          await normalizedFrame(sheet, sample.index * w, row * h, w, h),
        );
      const filename = `${resolved}.png`;
      files[filename] = await sharp({
        create: {
          width: 128 * frames.length,
          height: 128,
          channels: 4,
          background: "#00000000",
        },
      })
        .composite(frames.map((input, i) => ({ input, left: i * 128, top: 0 })))
        .png()
        .toBuffer();
      built.set(
        resolved,
        samples.map((s, i) => ({
          file: filename,
          x: i * 128,
          y: 0,
          width: 128,
          height: 128,
          duration_ms: s.duration_ms,
        })),
      );
    }
    const frames = built.get(resolved)!;
    manifest[state] =
      state === "sleep" && !picked
        ? [{ ...frames[0], duration_ms: 1000 }]
        : frames;
  }
  const rawCredits = (
    await source(`sprite/${entry.path}/credits.txt`, 512 * 1024)
  ).toString();
  const credits = `# ${entry.species}${entry.form ? " — " + entry.form : ""}\n\nSprite artists: ${entry.artists.map((a) => a.name).join(", ")}.\n\nSource: ${upstream}/sprite/${entry.path}\nRevision: ${revision}\nProject: https://sprites.pmdcollab.org/\n\nArtwork is provided through SpriteCollab under its attribution and noncommercial terms; see ARTWORK-LICENSE.md and upstream-credits.txt. Pokémon and related characters belong to their respective owners. This is an unofficial fan project.\n\nAdapted by Morisoba: selected direction ${direction}; trimmed transparent margins; fit frames to 128px with nearest-neighbor scaling; mapped animations to OMP Pet states; timings clamped to 80–2000ms. Long animations are sampled to 16 frames. Sleep playback in OMP Pet is at most 1fps.\n\n${states.map((s) => `${s}: ${mapping[s]}`).join("\n")}\n${notes.join("\n")}\n`;
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["CREDITS.md"] = strToU8(credits);
  files["upstream-credits.txt"] = strToU8(rawCredits);
  files["ARTWORK-LICENSE.md"] = await readFile(
    new URL("../data/ARTWORK-LICENSE.md", import.meta.url),
  );
  files["artist-names.txt"] = await readFile(
    new URL("../data/credit_names.txt", import.meta.url),
  );
  const zip = Buffer.from(
    zipSync(files, { level: 6, mtime: new Date("2020-01-01T00:00:00Z") }),
  );
  return {
    manifest,
    mapping,
    notes,
    files,
    zip,
    sha256: createHash("sha256").update(zip).digest("hex"),
    filename: `${entry.species.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${id}-d${direction}.omp-pet.zip`,
    credits,
  };
}
// Bounded, single-flight build cache. Limit CPU work and memory regardless of catalog size.
const ready = new Map<string, Pack>();
const pending = new Map<string, Promise<Pack>>();
export function getPack(id: string, direction: number): Promise<Pack> {
  findEntry(id);
  const key = `${id}:${direction}`;
  const hit = ready.get(key);
  if (hit) {
    ready.delete(key);
    ready.set(key, hit);
    return Promise.resolve(hit);
  }
  const underway = pending.get(key);
  if (underway) return underway;
  if (pending.size >= 3)
    throw new Error(
      "The sprite workshop is busy. Please try again in a moment.",
    );
  const work = compilePack(id, direction)
    .then((pack) => {
      ready.set(key, pack);
      while (ready.size > 12) ready.delete(ready.keys().next().value!);
      return pack;
    })
    .finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}
