/**
 * VibeStudio — Electron main process.
 *
 * Self-contained: in a packaged build the app spawns the bundled API + web
 * servers (see servers.ts) on fixed ports and loads the local URL. In dev it
 * assumes `npm run dev` is already serving the web app on :3100.
 *
 * URL precedence:
 *   1. VIBESTUDIO_WEB_URL (override — skips spawning bundled servers)
 *   2. dev (not packaged):  http://localhost:3100/dev-portal
 *   3. packaged:            http://127.0.0.1:3100/dev-portal (bundled servers)
 */
import { app, BrowserWindow, shell, Menu, type MenuItemConstructorOptions } from "electron";
import * as path from "node:path";
import { startBundledServers, stopBundledServers, WEB_PORT } from "./servers";

const DEV_WEB_URL = "http://localhost:3100";
const APP_PATH = "/dev-portal";

const isDev = !app.isPackaged;
/** True when we manage the bundled API/web child processes ourselves. */
const useBundledServers = app.isPackaged && !process.env.VIBESTUDIO_WEB_URL;

function resolveStartUrl(): string {
  if (process.env.VIBESTUDIO_WEB_URL) {
    return process.env.VIBESTUDIO_WEB_URL.replace(/\/$/, "") + APP_PATH;
  }
  if (isDev) return DEV_WEB_URL + APP_PATH;
  return `http://127.0.0.1:${WEB_PORT}` + APP_PATH;
}

function appOrigin(): string {
  try {
    return new URL(resolveStartUrl()).origin;
  } catch {
    return "";
  }
}

let mainWindow: BrowserWindow | null = null;

function splash(message: string): string {
  return (
    "data:text/html;charset=utf-8," +
    encodeURIComponent(
      `<body style="font:14px system-ui;background:#0b1020;color:#cbd5e1;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
         <div style="text-align:center">
           <div style="font-size:18px;color:#818cf8">VibeStudio</div>
           <div style="margin-top:8px">${message}</div>
         </div>
       </body>`,
    )
  );
}

/** loadURL rejects until the server is up; retry so start order is forgiving. */
async function loadWithRetry(win: BrowserWindow, url: string, attempts = 60): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await win.loadURL(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  win.loadURL(splash(`Could not reach ${url}.<br/>Check the logs and restart.`));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0b1020",
    show: false,
    title: "VibeStudio",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.loadURL(splash(useBundledServers ? "Starting local servers…" : "Loading…"));

  const origin = appOrigin();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (origin && url.startsWith(origin)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (origin && !url.startsWith(origin) && !url.startsWith("data:")) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "VibeStudio",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        ...(isDev ? [{ role: "toggleDevTools" } as MenuItemConstructorOptions] : []),
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    buildMenu();
    createWindow();

    if (useBundledServers) {
      try {
        await startBundledServers((m) => console.log(m));
      } catch (err) {
        console.error("failed to start bundled servers:", err);
        mainWindow?.loadURL(
          splash("Local servers failed to start.<br/>See logs / configure db.env."),
        );
        return;
      }
    }

    if (mainWindow) void loadWithRetry(mainWindow, resolveStartUrl());

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("will-quit", () => stopBundledServers());

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
