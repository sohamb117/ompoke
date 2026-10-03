# Morisoba Pets

A standalone site that builds OMP Pet-compatible Pokémon sprite packs from a pinned SpriteCollab revision. Keep the native app in ../omp-pet separate.

- Make small, frequent commits. Do not deploy or create a remote without being asked.
- Preserve upstream artist credits and licensing in every pack. The MIT code license does not cover Pokémon artwork.
- Keep downloads bounded, validate all identifiers against the catalog, and reject arbitrary upstream URLs.
- Packs must satisfy OMP Pet v1 limits: 128 frames, 2048px sheets, 4 million decoded pixels, 16MiB PNGs, 64KiB manifest, and 80–2000ms durations.
- Run npm test and npm run build. Exercise preview, ZIP download, and install links after changing the pack flow.
- Do not start the user's native pet to test this site without permission.
