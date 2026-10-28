require("dotenv").config();

const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");

const PROTOCOL = "agent1";
const PORT = Number(process.env.PORT || 5000);
const ROOT = path.join(__dirname, "..");
const DIST_INDEX = path.join(ROOT, "frontend", "dist", "index.html");

let mainWindow = null;
let serverProcess = null;

app.setName("Agent 1");
app.setAppUserModelId("com.agent1.desktop");

function uiOrigin() {
    return `http://127.0.0.1:${PORT}`;
}

function parseDeepLink(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== `${PROTOCOL}:`) {
            return null;
        }

        const parts = parsed.hostname
            ? [parsed.hostname, ...parsed.pathname.split("/").filter(Boolean)]
            : parsed.pathname.split("/").filter(Boolean);

        if (parts[0] === "share" && parts[1]) {
            return `${uiOrigin()}/?share=${encodeURIComponent(parts[1])}`;
        }

        if (parts[0] === "house" && parts[2]) {
            return `${uiOrigin()}/?share=${encodeURIComponent(parts[2])}&house=${encodeURIComponent(parts[1])}`;
        }

        if (parts[0] === "house" && parts[1]) {
            return `${uiOrigin()}/?house=${encodeURIComponent(parts[1])}`;
        }
    } catch {
        return null;
    }

    return null;
}

function waitForServer() {
    return new Promise((resolve, reject) => {
        const started = Date.now();

        const ping = () => {
            http
                .get(`http://127.0.0.1:${PORT}/api/runtime`, (response) => {
                    response.resume();
                    resolve();
                })
                .on("error", () => {
                    if (Date.now() - started > 40000) {
                        reject(new Error("Agent_1 սերվերը չմիացավ"));
                        return;
                    }
                    setTimeout(ping, 400);
                });
        };

        ping();
    });
}

function isServerUp() {
    return new Promise((resolve) => {
        http
            .get(`http://127.0.0.1:${PORT}/api/runtime`, (response) => {
                response.resume();
                resolve(true);
            })
            .on("error", () => resolve(false));
    });
}

async function startApi() {
    if (serverProcess || await isServerUp()) {
        return;
    }

    const nodeBin = process.platform === "win32" ? "node.exe" : "node";

    serverProcess = spawn(nodeBin, [path.join(ROOT, "server.cjs")], {
        cwd: ROOT,
        env: {
            ...process.env,
            SERVE_FRONTEND: "1",
            PORT: String(PORT),
        },
        stdio: "inherit",
        windowsHide: true,
    });

    serverProcess.on("exit", (code) => {
        serverProcess = null;
        if (code && !app.isQuitting) {
            dialog.showErrorBox("Agent 1", "Ներքին սերվերը կանգնեց");
        }
    });
}

function stopApi() {
    if (!serverProcess) {
        return;
    }

    if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(serverProcess.pid), "/f", "/t"], {
            windowsHide: true,
        });
    } else {
        serverProcess.kill();
    }

    serverProcess = null;
}

function openInWindow(targetUrl) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(targetUrl);
        mainWindow.show();
        mainWindow.focus();
        return;
    }

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 390,
        minHeight: 680,
        backgroundColor: "#060b13",
        autoHideMenuBar: true,
        title: "Agent 1",
        icon: path.join(ROOT, "frontend", "public", "images", "level-home-logo.jpg"),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    mainWindow.loadURL(targetUrl);
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

async function createWindow(deepLink) {
    if (!fs.existsSync(DIST_INDEX)) {
        dialog.showErrorBox(
            "Agent 1",
            "frontend/dist չկա։ Նախ աշխատեցրեք setup.bat կամ npm run build:ui"
        );
        app.quit();
        return;
    }

    await startApi();
    await waitForServer();
    openInWindow(parseDeepLink(deepLink) || `${uiOrigin()}/`);
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
    app.quit();
} else {
    app.on("second-instance", (_event, argv) => {
        const link = argv.find((item) => String(item).startsWith(`${PROTOCOL}://`));
        if (link) {
            const target = parseDeepLink(link);
            if (target) {
                openInWindow(target);
                return;
            }
        }

        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    if (process.defaultApp) {
        app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
            path.resolve(__dirname, "main.cjs"),
        ]);
    } else {
        app.setAsDefaultProtocolClient(PROTOCOL);
    }

    app.whenReady().then(() => createWindow(process.argv.find((item) =>
        String(item).startsWith(`${PROTOCOL}://`)
    )));

    app.on("open-url", (event, url) => {
        event.preventDefault();
        const target = parseDeepLink(url);
        if (target) {
            openInWindow(target);
        }
    });

    app.on("before-quit", () => {
        app.isQuitting = true;
        stopApi();
    });

    app.on("window-all-closed", () => {
        app.isQuitting = true;
        stopApi();
        app.quit();
    });
}

app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("http:") || url.startsWith("https:")) {
            shell.openExternal(url);
        }
        return { action: "deny" };
    });
});
