const db = require("../../database/database.cjs");
const { getTelegramConfig } = require("../services/telegramConfig.cjs");
const { getMembership, resolveChannelId } = require("../services/telegramApi.cjs");
const { sendListingToChannel } = require("../services/telegramApi.cjs");
const { createLinkToken } = require("../services/telegramBot.cjs");

function getUser(req) {
    const userId = req.user?.userId;

    if (!userId) {
        return null;
    }

    return db.prepare(`
        SELECT id, username, email, role, telegram_id, telegram_username
        FROM users
        WHERE id = ?
    `).get(userId);
}

function isChannelChiefRole(role) {
    return role === "admin" || role === "super_admin";
}

function isTelegramNamedAdmin(username) {
    const names = getTelegramConfig().adminUsernames || [];
    return names.includes(String(username || "").replace(/^@/, "").toLowerCase());
}

async function status(req, res) {
    try {
        const config = getTelegramConfig();
        const user = getUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Մուտք գործեք",
            });
        }

        let membership = {
            isMember: false,
            isChannelChief: false,
            status: "",
        };

        if (user.telegram_id) {
            try {
                membership = await getMembership(user.telegram_id);
            } catch {
                membership = {
                    isMember: false,
                    isChannelChief: false,
                    status: "unknown",
                };
            }
        }

        return res.json({
            success: true,
            ready: config.ready,
            role: user.role,
            isChannelChief: isChannelChiefRole(user.role) || membership.isChannelChief,
            linked: Boolean(user.telegram_id),
            member: membership.isMember,
            joinUrl: config.joinUrl,
            botUrl: config.botUrl,
            canWriteInChat: false,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
}

function link(req, res) {
    const config = getTelegramConfig();
    const user = getUser(req);

    if (!user) {
        return res.status(401).json({
            success: false,
            message: "Մուտք գործեք",
        });
    }

    if (!config.botUsername) {
        return res.status(503).json({
            success: false,
            message: "Telegram բոտը կարգավորված չէ",
        });
    }

    const token = createLinkToken(user.id);

    return res.json({
        success: true,
        botUrl: `https://t.me/${config.botUsername}?start=${token}`,
        joinUrl: config.joinUrl,
    });
}

function listingPayloadForDb(data) {
    const copy = { ...(data || {}) };
    delete copy.photos;
    delete copy.uploadedPhotos;
    copy.photosCount = Array.isArray(data?.photos)
        ? data.photos.length
        : Array.isArray(data?.uploadedPhotos)
            ? data.uploadedPhotos.length
            : data?.photosCount || 0;
    return copy;
}

async function sendListing(req, res) {
    try {
        const config = getTelegramConfig();
        const user = getUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Մուտք գործեք",
            });
        }

        if (!config.ready) {
            return res.status(503).json({
                success: false,
                message: "Telegram ալիքը դեռ պատրաստ չէ",
            });
        }

        const listingType = req.body?.listingType || "houses";
        let data = req.body?.data || {};

        if (typeof data === "string") {
            try {
                data = JSON.parse(data);
            } catch {
                data = {};
            }
        }

        const filePhotos = (req.files || []).map((file) => ({
            type: file.mimetype || "image/jpeg",
            buffer: file.buffer,
        }));

        const posted = await sendListingToChannel(listingType, data, user, filePhotos);

        db.prepare(`
            INSERT INTO listings (user_id, listing_type, payload_json, telegram_message_id)
            VALUES (?, ?, ?, ?)
        `).run(
            user.id,
            listingType,
            JSON.stringify(listingPayloadForDb(data)),
            String(posted.messageId || "")
        );

        return res.json({
            success: true,
            chatUrl: posted.chatUrl || config.joinUrl,
            message: "Հայտարարությունը ուղարկվեց ալիք",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Ուղարկելը ձախողվեց",
        });
    }
}

async function warmupChannelId() {
    try {
        const id = await resolveChannelId();
        if (id) {
            console.log("Telegram channel id:", id);
        }
    } catch (error) {
        console.error("Telegram channel դեռ հասանելի չէ բոտին:", error.message);
    }
}

module.exports = {
    status,
    link,
    sendListing,
    warmupChannelId,
};
