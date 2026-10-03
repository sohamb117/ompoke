# OMP Pet sprite builder

A standalone Pokémon sprite picker for **morisoba.moe**, built for [OMP Pet](https://github.com/sohamb117/omp-pet). Search 984 available species / 3,330 sprite variants, preview seven task states, choose a form and facing direction, then download a ZIP or install directly into the native macOS app.

## Run locally

Install Bun 1.3.14+, then:

```sh
bun install --frozen-lockfile
bun run dev
```

Open http://localhost:4173. The first preview fetches a few sprite files from GitHub; subsequent requests use the local cache. The app does not call an AI model or need API keys.

```sh
bun test tests
bun run build
bun run start
```

## Automatic deployment to Google Cloud

GitHub Actions is configured to test and deploy `main` to Cloud Run. See [deploy/README.md](deploy/README.md) for project setup, keyless authentication, resource limits, repository variables, and Cloudflare DNS. The existing server-based sprite generation is retained; no browser-only or native-app rewrite is needed. Deployment remains gated until a Google Cloud project and public hostname are configured.

## Run on another container host

This is a Bun + Express server with a Vite/React frontend. It needs a server/container, not static-only hosting, because it generates ZIP files and offers stable download endpoints for native installation.

```sh
bun install --frozen-lockfile
bun run build
NODE_ENV=production HOST=0.0.0.0 PORT=4173 SITE_URL=https://morisoba.moe bun server/index.ts
```

Terminate HTTPS at your host/reverse proxy. Forward requests to port 4173. `SITE_URL` must match the public origin; it is deliberately not inferred from client headers. Use the origin root (not a path prefix). `https://pets.morisoba.moe` and `https://www.morisoba.moe` are also accepted by the native app. Loopback HTTP on an explicit port works for local development. Other domains require updating the app's allowlist.

Or build the included container:

```sh
docker build -t morisoba-pets .
docker run --rm -p 4173:4173 -e SITE_URL=https://morisoba.moe morisoba-pets
```

A writable `.cache/` persists pinned source files. It can be removed safely to reclaim disk space. Preview packs use an LRU of 12 entries capped at 32 MiB; no more than three packs compile concurrently. The source cache is capped at 64 MiB. All requests fetch from one pinned upstream repository; arbitrary source URLs are never accepted. API responses are cacheable. The repository includes CI checks and the Cloud Run deployment workflow.

## Direct installation

Requires **OMP Pet 0.1.2+**, Apple Silicon macOS:

```sh
omp plugin install 'github:sohamb117/omp-pet#v0.1.2'
```

In OMP: `/reload-plugins`, then `/pet show`. If an older companion is already running, `/pet quit` before `/pet show` to load the new app.

The website opens `omppet://install?url=<encoded pack URL>&sha256=<checksum>`. macOS opens OMP Pet, which downloads in a background thread, verifies SHA-256, rejects unsupported archive entries and excessive sizes, then validates PNGs and activates the pack. Packs live under `~/Library/Application Support/OMP Pet/packs/<sha256>/`. Existing sprite preferences change only after a successful load. Nothing executes from an archive.

Browsers cannot reliably detect whether the native app is installed. The site shows setup instructions and a retry link after installation. A downloaded ZIP remains the fallback: unzip it and use `/pet sprites /path/to/folder`.

## Source and pack format

Artwork comes from [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab), pinned at the revision in `data/catalog.json`. `bun run catalog` refreshes that catalog from the pinned revision. Set `SPRITE_REVISION` to a full Git commit SHA to deliberately update the catalog and source together.

The compiler resolves animation aliases, chooses one of eight facing rows (single-row animations stay single-row), and maps Idle/Walk/LookUp/Charge/Hurt/Sleep/Hop to the pet's task states. Missing animations use documented fallbacks. Empty margins are trimmed per frame; images fit a consistent 128×128 viewport with nearest-neighbor scaling. Long cycles are sampled to at most 16 frames, preserving aggregate timing before the native 80–2000ms clamp. Sleep is previewed at a maximum of 1fps, matching the app.

Packs have a flat `manifest.json`, up to seven PNG sheets, artist directory, source revision, transformation notes, original per-sprite credits, and artwork license. They fit the native limits: 128 total frames, 2048px sheet dimensions, four million decoded pixels, 16MiB encoded PNGs, 64KiB manifest.

The source includes catalog metadata and credit/license text, not bulk Pokémon sprite images. Sprite files are fetched on demand. This is an unofficial, noncommercial fan project. Pokémon belongs to its respective owners. SpriteCollab's attribution and noncommercial terms apply to the artwork; see `data/ARTWORK-LICENSE.md`. The code license does not grant rights to the characters or artwork.
