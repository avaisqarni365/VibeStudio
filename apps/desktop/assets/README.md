# Build assets

electron-builder reads icons + installer assets from this folder
(`directories.buildResources: assets`).

Drop in (optional — Electron defaults are used if absent):

- `icon.ico` — Windows app + installer icon (256×256 recommended)
- `icon.icns` — macOS app icon
- `icon.png` — Linux app icon (512×512)

Then uncomment the matching `icon:` lines in `../electron-builder.yml`.
