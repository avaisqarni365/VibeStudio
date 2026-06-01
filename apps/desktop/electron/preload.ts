/**
 * Preload — runs in an isolated context with contextIsolation + sandbox on.
 * Exposes a tiny, safe surface the web app can feature-detect to know it is
 * running inside the desktop shell (e.g. show "Check for updates", hide
 * "Open in browser"). Keep this minimal — no Node/fs access leaks to the page.
 */
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("vibestudio", {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
