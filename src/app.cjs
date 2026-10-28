const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { lanIPv4, publicWebOrigin, publicWebPort } = require("./utils/lanAddress.cjs");

const authRoutes = require("./routes/authRoutes.cjs");
const telegramRoutes = require("./routes/telegramRoutes.cjs");
const listAmRoutes = require("./routes/listAmRoutes.cjs");
const agencyRoutes = require("./routes/agencyRoutes.cjs");
const adminLockRoutes = require("./routes/adminLockRoutes.cjs");
const lockMiddleware = require("./middleware/lockMiddleware.cjs");

const app = express();

function isAllowedAppOrigin(origin) {
    if (!origin) {
        return true;
    }

    try {
        const url = new URL(origin);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return false;
        }

        const host = url.hostname;
        if (host === "localhost" || host === "127.0.0.1") {
            return true;
        }

        const selfIp = lanIPv4();
        if (host === selfIp) {
            return true;
        }

        const extraHosts = String(process.env.APP_PUBLIC_HOST || "")
            .split(",")
            .map((item) => item.trim().toLowerCase().replace(/^https?:\/\//, "").split(":")[0])
            .filter(Boolean);
        if (extraHosts.includes(host.toLowerCase())) {
            return true;
        }

        return (
            /^10(?:\.\d{1,3}){3}$/.test(host) ||
            /^192\.168(?:\.\d{1,3}){2}$/.test(host) ||
            /^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(host)
        );
    } catch {
        return false;
    }
}


// ==========================================
// CORS
// ==========================================

app.use(
    cors({
        // Vite may choose 5174/5175 when its default port is already in use.
        // Accept only loopback development origins, rather than pinning CORS to
        // one port and breaking login whenever that happens.
        origin(origin, callback) {
            const allowed = isAllowedAppOrigin(origin);

            callback(
                allowed
                    ? null
                    : new Error("Այս origin-ից հարցումը չի թույլատրվում"),
                allowed
            );
        },
        methods: [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
        ],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
        ],
    })
);


// ==========================================
// JSON
// ==========================================

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

app.use((error, req, res, next) => {
    if (error?.type === "entity.too.large") {
        return res.status(413).json({
            success: false,
            message: "Նկարները չափից մեծ են։ Փոքրացրեք կամ քիչ նկար ուղարկեք։",
        });
    }

    return next(error);
});


// ==========================================
// AUTH ROUTES
// ==========================================

app.use("/cleaned-photos", express.static(path.join(__dirname, "../data/cleaned")));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminLockRoutes);
app.use("/api/telegram", lockMiddleware, telegramRoutes);
app.use("/api/listam", lockMiddleware, listAmRoutes);
app.use("/api/agency", lockMiddleware, agencyRoutes);


// ==========================================
// TEST ROUTE
// ==========================================

app.get("/api/runtime", (req, res) => {
    const { getAgencyTelegramConfig } = require("./services/telegramConfig.cjs");
    const { isAppLocked } = require("./services/appLock.cjs");
    const agencyTg = getAgencyTelegramConfig();
    res.json({
        success: true,
        lanIp: lanIPv4(),
        phoneUrl: publicWebOrigin(),
        apiUrl: `http://${lanIPv4()}:5000`,
        port: publicWebPort(),
        protocol: "agent1",
        agencyBotUrl: agencyTg.startUrl || agencyTg.botUrl || "",
        directorUrl: agencyTg.directorUrl || "",
        agencyBotUsername: agencyTg.botUsername || "",
        directorUsername: agencyTg.directorUsername || "",
        locked: isAppLocked(),
    });
});

const distDir = path.join(__dirname, "../frontend/dist");
const distIndex = path.join(distDir, "index.html");

if (process.env.SERVE_FRONTEND === "1" || fs.existsSync(distIndex)) {
    app.use(express.static(distDir));
    app.use((req, res, next) => {
        if (req.method !== "GET" || req.path.startsWith("/api")) {
            return next();
        }
        return res.sendFile(distIndex);
    });
} else {
    app.get("/", (req, res) => {
        res.json({
            success: true,
            message: "Agent_1 API is running",
        });
    });
}


// ==========================================
// EXPORT
// ==========================================

module.exports = app;
