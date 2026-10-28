const Redis = require("ioredis");

const REDIS_URL = String(process.env.REDIS_URL || "redis://127.0.0.1:6379").trim();
const REDIS_ENABLED = String(process.env.REDIS_ENABLED || "1").trim() !== "0";

let client = null;
let lastError = "";

function getRedis() {
    if (!REDIS_ENABLED) {
        return null;
    }

    if (client) {
        return client;
    }

    client = new Redis(REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        connectTimeout: 3000,
    });

    client.on("error", (error) => {
        lastError = error?.message || String(error);
    });

    return client;
}

async function connectRedis() {
    if (!REDIS_ENABLED) {
        return { available: false, reason: "Redis disabled" };
    }

    const redis = getRedis();
    try {
        if (redis.status === "wait" || redis.status === "end") {
            await redis.connect();
        }
        const pong = await redis.ping();
        lastError = "";
        return {
            available: pong === "PONG",
            url: REDIS_URL.replace(/\/\/.*@/, "//***@"),
            reason: "",
        };
    } catch (error) {
        lastError = error?.message || String(error);
        return {
            available: false,
            url: REDIS_URL.replace(/\/\/.*@/, "//***@"),
            reason: lastError,
        };
    }
}

async function getRedisStatus() {
    if (!REDIS_ENABLED) {
        return { available: false, reason: "Redis disabled" };
    }

    const redis = getRedis();
    try {
        if (redis.status !== "ready") {
            return connectRedis();
        }
        const pong = await redis.ping();
        return {
            available: pong === "PONG",
            url: REDIS_URL.replace(/\/\/.*@/, "//***@"),
            reason: "",
        };
    } catch (error) {
        return {
            available: false,
            url: REDIS_URL.replace(/\/\/.*@/, "//***@"),
            reason: error?.message || lastError || String(error),
        };
    }
}

async function cacheGet(key) {
    const redis = getRedis();
    if (!redis || redis.status !== "ready") {
        return null;
    }
    return redis.get(key);
}

async function cacheSet(key, value, ttlSeconds = 300) {
    const redis = getRedis();
    if (!redis || redis.status !== "ready") {
        return false;
    }
    if (ttlSeconds > 0) {
        await redis.set(key, value, "EX", ttlSeconds);
    } else {
        await redis.set(key, value);
    }
    return true;
}

module.exports = {
    getRedis,
    connectRedis,
    getRedisStatus,
    cacheGet,
    cacheSet,
};
