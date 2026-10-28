const os = require("os");

function lanIPv4() {
    const groups = Object.values(os.networkInterfaces());

    for (const addrs of groups) {
        for (const item of addrs || []) {
            const family = String(item.family);
            if ((family === "IPv4" || family === "4") && !item.internal) {
                return item.address;
            }
        }
    }

    return "127.0.0.1";
}

function lanWebOrigin(port = 5173) {
    return `http://${lanIPv4()}:${port}`;
}

function publicWebPort() {
    const fs = require("fs");
    const path = require("path");
    const distIndex = path.join(__dirname, "../../frontend/dist/index.html");

    if (process.env.SERVE_FRONTEND === "1" || fs.existsSync(distIndex)) {
        return Number(process.env.PORT || 5000);
    }

    return 5173;
}

function publicWebOrigin() {
    const fromEnv = String(process.env.APP_PUBLIC_ORIGIN || "").trim().replace(/\/$/, "");
    if (fromEnv) {
        return fromEnv;
    }

    const publicHost = String(process.env.APP_PUBLIC_HOST || "").trim();
    if (publicHost) {
        const port = publicWebPort();
        const host = publicHost.replace(/^https?:\/\//, "").split("/")[0];
        if (host.includes(":") || port === 80) {
            return `http://${host}`;
        }
        return `http://${host}:${port}`;
    }

    return lanWebOrigin(publicWebPort());
}

function appShareUrl(token) {
    return `agent1://share/${token}`;
}

function webShareUrl(token) {
    return `${publicWebOrigin()}/?share=${encodeURIComponent(token)}`;
}

module.exports = {
    lanIPv4,
    lanWebOrigin,
    publicWebPort,
    publicWebOrigin,
    appShareUrl,
    webShareUrl,
};
