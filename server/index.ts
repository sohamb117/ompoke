import express from "express";
import { resolve } from "node:path";
import { entries, findEntry, revision } from "./catalog";
import { getPack } from "./pack";
import { source } from "./source";
const app = express();
const port = Number(process.env.PORT || 4173);
const publicURL = new URL(process.env.SITE_URL || `http://localhost:${port}`);
app.disable("x-powered-by");
app.get("/healthz", (_req, res) =>
  res.set("Cache-Control", "no-store").json({ ok: true }),
);
app.use((_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
  });
  next();
});
app.get("/api/catalog", (_req, res) =>
  res.set("Cache-Control", "public, max-age=3600").json({ entries, revision }),
);
function selection(req: express.Request) {
  const id = String(req.params.id);
  findEntry(id);
  const d = String(req.query.direction ?? "1");
  if (!/^[0-7]$/.test(d)) throw new Error("Invalid direction");
  return { id, direction: Number(d) };
}
app.get("/api/preview/:id", async (req, res) => {
  const { id, direction } = selection(req);
  const pack = await getPack(id, direction);
  const url = new URL(`/api/packs/${id}?direction=${direction}`, publicURL);
  const installURL = `omppet://install?url=${encodeURIComponent(url.href)}&sha256=${pack.sha256}`;
  res.set("Cache-Control", "no-store").json({
    manifest: pack.manifest,
    mapping: pack.mapping,
    notes: pack.notes,
    sha256: pack.sha256,
    bytes: pack.zip.length,
    filename: pack.filename,
    installURL,
  });
});
app.get("/api/packs/:id", async (req, res) => {
  const { id, direction } = selection(req);
  const pack = await getPack(id, direction);
  res
    .set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${pack.filename}"`,
      "Cache-Control": "no-cache",
      ETag: `"${pack.sha256}"`,
    })
    .send(pack.zip);
});
app.get("/api/sheets/:id/:file", async (req, res) => {
  const { id, direction } = selection(req);
  const file = String(req.params.file);
  const pack = await getPack(id, direction);
  if (req.query.v && req.query.v !== pack.sha256) {
    res.status(409).json({
      error: "This preview has changed. Refresh to get the latest pack.",
    });
    return;
  }
  if (!/^[\w-]+\.png$/.test(file) || !pack.files[file]) {
    res.status(404).end();
    return;
  }
  res
    .set({
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    })
    .send(Buffer.from(pack.files[file]));
});
app.get("/api/portrait/:id", async (req, res) => {
  const entry = findEntry(String(req.params.id));
  const bytes = await source(`portrait/${entry.path}/Normal.png`, 512 * 1024);
  res
    .set({
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    })
    .send(bytes);
});
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err.message);
    res.status(400).json({
      error:
        err.message || "Could not build this sprite pack. Please try again.",
    });
  },
);
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: {
      middlewareMode: true,
      // Bun's native filesystem watcher can leave Vite's transform cache stale on macOS.
      watch: {
        usePolling: true,
        interval: 300,
        ignored: ["**/.cache/**", "**/work/**"],
      },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Morisoba Pets: http://localhost:${port}`),
);
