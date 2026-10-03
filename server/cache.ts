import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
// Cloud Run's writable filesystem uses instance memory. Only prune our completed,
// content-addressed entries; never touch in-flight temporary files or other data.
export async function pruneSourceCache(
  directory: string,
  budget: number,
): Promise<void> {
  const names = (await readdir(directory)).filter((name) =>
    /^[a-f0-9]{64}$/.test(name),
  );
  const files = (
    await Promise.all(
      names.map(async (name) => {
        const path = join(directory, name);
        try {
          const info = await stat(path);
          return { path, size: info.size, time: info.mtimeMs };
        } catch (e: any) {
          if (e.code === "ENOENT") return null;
          throw e;
        }
      }),
    )
  )
    .filter((file) => file !== null)
    .sort((a, b) => a.time - b.time);
  let total = files.reduce((sum, file) => sum + file.size, 0);
  for (const file of files) {
    if (total <= budget) break;
    await unlink(file.path).catch((e: any) => {
      if (e.code !== "ENOENT") throw e;
    });
    total -= file.size;
  }
}
