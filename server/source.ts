import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { upstream } from "./catalog";
const cache = resolve(".cache/source");
const pending = new Map<string, Promise<Buffer>>();
export async function source(
  path: string,
  limit = 8 * 1024 * 1024,
): Promise<Buffer> {
  if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.includes(".."))
    throw new Error("Invalid source path");
  const key = createHash("sha256").update(`${upstream}/${path}`).digest("hex");
  const dest = resolve(cache, key);
  try {
    const bytes = await readFile(dest);
    if (bytes.length > limit) throw new Error("Source exceeds size limit");
    return bytes;
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
  const existing = pending.get(key);
  if (existing) return existing;
  const work = (async () => {
    const r = await fetch(`${upstream}/${path}`, {
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok || !r.body)
      throw new Error(
        `Sprite source is unavailable (${r.status}). Please try another form or retry.`,
      );
    const parts: Uint8Array[] = [];
    let size = 0;
    for await (const part of r.body as any) {
      size += part.length;
      if (size > limit) {
        throw new Error("Source exceeds size limit");
      }
      parts.push(part);
    }
    const bytes = Buffer.concat(parts);
    await mkdir(cache, { recursive: true });
    const temp = `${dest}.${randomUUID()}`;
    await writeFile(temp, bytes);
    await rename(temp, dest);
    return bytes;
  })();
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
  }
}
