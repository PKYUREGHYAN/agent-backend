require("dotenv").config();

const { telegramCall, resolveChannelId } = require("../src/services/telegramApi.cjs");
const { getTelegramConfig } = require("../src/services/telegramConfig.cjs");

async function main() {
    const config = getTelegramConfig();
    const me = await telegramCall("getMe");
    console.log("bot", me.username);

    let chatId = "";
    try {
        chatId = await resolveChannelId();
        console.log("channel_id", chatId);
    } catch (error) {
        console.log("channel_error", error.message);
        return;
    }

    const chat = await telegramCall("getChat", { chat_id: chatId || `@${config.channelUsername}` });
    console.log("title", chat.title);
    console.log("type", chat.type);
    console.log("username", chat.username || "");
    console.log("id", chat.id);

    const invite = await telegramCall("createChatInviteLink", {
        chat_id: chat.id,
        name: "agent1-join",
    });
    console.log("join", invite.invite_link);
}

main().catch((error) => {
    console.error("fail", error.message);
    process.exit(1);
});
