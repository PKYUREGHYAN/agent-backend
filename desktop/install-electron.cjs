const fs = require("fs");
const https = require("https");
const path = require("path");
const { spawnSync } = require("child_process");

const electronDir = path.join(__dirname, "../node_modules/electron");
const pkgPath = path.join(electronDir, "package.json");

if (!fs.existsSync(pkgPath)) {
    console.error("Electron փաթեթը չկա։ Նախ աշխատեցրեք npm install");
    process.exit(1);
}

const { version } = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const distDir = path.join(electronDir, "dist");
const pathFile = path.join(electronDir, "path.txt");
const exeName = process.platform === "win32" ? "electron.exe" : "electron";
const exePath = path.join(distDir, exeName);

function alreadyInstalled() {
    return fs.existsSync(exePath) && fs.existsSync(pathFile);
}

function markInstalled() {
    fs.writeFileSync(pathFile, exeName);
    fs.writeFileSync(path.join(distDir, "version"), version);
}

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const request = (current, hops) => {
            https
                .get(current, { headers: { "User-Agent": "agent1-setup" } }, (response) => {
                    const status = response.statusCode || 0;
                    if (status >= 300 && status < 400 && response.headers.location && hops < 8) {
                        response.resume();
                        request(response.headers.location, hops + 1);
                        return;
                    }
                    if (status !== 200) {
                        response.resume();
                        reject(new Error(`Electron download HTTP ${status}`));
                        return;
                    }

                    const file = fs.createWriteStream(dest);
                    response.pipe(file);
                    file.on("finish", () => file.close(() => resolve()));
                    file.on("error", reject);
                })
                .on("error", reject);
        };

        request(url, 0);
    });
}

async function extractZip(zipPath) {
    const nested = path.join(electronDir, "node_modules", "extract-zip");
    const root = path.join(__dirname, "../node_modules/extract-zip");
    const extract = require(fs.existsSync(nested) ? nested : root);

    fs.mkdirSync(distDir, { recursive: true });
    await extract(zipPath, { dir: distDir });
}

function extractZipWindows(zipPath) {
    const result = spawnSync(
        "powershell.exe",
        [
            "-NoProfile",
            "-Command",
            `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${distDir.replace(/'/g, "''")}' -Force`,
        ],
        { stdio: "inherit" }
    );

    if (result.status !== 0) {
        throw new Error("Zip-ը չհաջողվեց բացել");
    }
}

async function main() {
    if (alreadyInstalled()) {
        markInstalled();
        console.log(`Electron ${version} պատրաստ է`);
        return;
    }

    const platform = process.platform === "win32" ? "win32" : process.platform;
    const arch = process.arch === "ia32" ? "ia32" : process.arch === "arm64" ? "arm64" : "x64";
    const zipName = `electron-v${version}-${platform}-${arch}.zip`;
    const url = `https://github.com/electron/electron/releases/download/v${version}/${zipName}`;
    const zipPath = path.join(require("os").tmpdir(), zipName);

    console.log(`Electron ${version} ներբեռնում...`);
    await download(url, zipPath);

    if (fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true, force: true });
    }
    fs.mkdirSync(distDir, { recursive: true });

    try {
        await extractZip(zipPath);
    } catch {
        extractZipWindows(zipPath);
    }

    if (!fs.existsSync(exePath)) {
        throw new Error("electron.exe չգտնվեց ներբեռնումից հետո");
    }

    markInstalled();
    console.log("Electron-ը տեղադրված է");
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
