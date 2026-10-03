import { test, expect } from "bun:test";
import { mkdtemp, writeFile, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pruneSourceCache } from "../server/cache";
test("source cache prunes oldest completed files without touching temporary or unrelated files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ompoke-cache-"));
  try {
    await writeFile(join(dir, "a".repeat(64)), Buffer.alloc(20));
    await utimes(join(dir, "a".repeat(64)), new Date(0), new Date(0));
    await writeFile(join(dir, "b".repeat(64)), Buffer.alloc(20));
    await writeFile(join(dir, "in-flight.tmp"), Buffer.alloc(20));
    await pruneSourceCache(dir, 20);
    expect((await readdir(dir)).sort()).toEqual([
      "b".repeat(64),
      "in-flight.tmp",
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
