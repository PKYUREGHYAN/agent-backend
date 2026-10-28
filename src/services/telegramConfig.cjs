require("dotenv").config();

const { getSetting } = require("./appSettings.cjs");

function clean(value) {
    return String(value || "").trim().replace(/^@/, "");
}

function getTelegramConfig() {
    const botToken = clean(process.env.TELEGRAM_BOT_TOKEN);
    const botUsername = clean(process.env.TELEGRAM_BOT_USERNAME);
    const channelUsername = clean(process.env.TELEGRAM_CHANNEL_USERNAME);
    const channelId =
        clean(process.env.TELEGRAM_CHANNEL_ID) ||
        clean(getSetting("telegram_channel_id"));
    const joinUrl =
        clean(process.env.TELEGRAM_JOIN_URL) ||
        clean(getSetting("telegram_join_url"));

    return {
        botToken,
        botUsername,
        channelUsername,
        channelId,
        ready: Boolean(botToken && botUsername && channelId),
        joinUrl,
        botUrl: botUsername ? `https://t.me/${botUsername}` : "",
        adminUsernames: String(process.env.TELEGRAM_ADMIN_USERNAMES || "")
            .split(/[,;\s]+/)
            .map((name) => clean(name))
            .filter(Boolean)
            .map((name) => name.toLowerCase()),
    };
}

function getAgencyTelegramConfig() {
    const botToken = clean(process.env.TELEGRAM_AGENCY_BOT_TOKEN);
    const botUsername = clean(process.env.TELEGRAM_AGENCY_BOT_USERNAME);
    const directorUsername = clean(process.env.TELEGRAM_DIRECTOR_USERNAME);
    const directorUrl =
        clean(process.env.TELEGRAM_DIRECTOR_URL) ||
        (directorUsername ? `https://t.me/${directorUsername}` : "");
    const directorChatId = clean(process.env.TELEGRAM_DIRECTOR_CHAT_ID);

    return {
        botToken,
        botUsername,
        directorUsername,
        directorUrl,
        directorChatId,
        ready: Boolean(botToken),
        botUrl: botUsername ? `https://t.me/${botUsername}` : "",
        startUrl: botUsername ? `https://t.me/${botUsername}?start=agency` : "",
    };
}

module.exports = {
    getTelegramConfig,
    getAgencyTelegramConfig,
};
