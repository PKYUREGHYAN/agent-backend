require("dotenv").config();

const { telegramCall } = require("../src/services/telegramApi.cjs");
const { getSetting, setSetting } = require("../src/services/appSettings.cjs");
const { getTelegramConfig } = require("../src/services/telegramConfig.cjs");

async function main() {
    const config = getTelegramConfig();
    console.log("channel_id", config.channelId || getSetting("telegram_channel_id"));
    console.log("join", config.joinUrl);

    const chatId = config.channelId || getSetting("telegram_channel_id");
    if (!chatId) {
        console.log("missing");
        return;
    }

    const chat = await telegramCall("getChat", { chat_id: chatId });
    console.log("title", chat.title);
    console.log("type", chat.type);

    const invite = await telegramCall("createChatInviteLink", {
        chat_id: chatId,
        name: "agent1-join",
    });
    setSetting("telegram_join_url", invite.invite_link);
    console.log("invite_ok");
}

main().catch((error) => {
    console.error("fail", error.message);
    process.exit(1);
});
