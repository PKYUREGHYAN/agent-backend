const crypto = require("crypto");
const db = require("../../database/database.cjs");
const { getTelegramConfig, getAgencyTelegramConfig } = require("./telegramConfig.cjs");
const { telegramCall } = require("./telegramApi.cjs");
const { setSetting } = require("./appSettings.cjs");
const { acquireTelegramPollLock } = require("./telegramPollLock.cjs");
const { isAppLocked } = require("./appLock.cjs");

let started = false;
let offset = 0;

function createLinkToken(userId) {
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    db.prepare(`
        INSERT INTO telegram_link_tokens (token, user_id, expires_at)
        VALUES (?, ?, ?)
    `).run(token, userId, expiresAt);

    return token;
}

async function handleStart(message) {
    const config = getTelegramConfig();
    const from = message.from || {};
    const text = String(message.text || "");
    const payload = text.split(/\s+/)[1] || "";

    if (!payload) {
        await telegramCall("sendMessage", {
            chat_id: from.id,
            text: "Հայտարարությունը ուղարկվում է պրոյեկտից։ Այստեղ գրել պետք չէ։\n\nՄիացեք ալիքին՝ " + config.joinUrl,
        });
        return;
    }

    const row = db.prepare(`
        SELECT user_id, expires_at
        FROM telegram_link_tokens
        WHERE token = ?
    `).get(payload);

    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
        await telegramCall("sendMessage", {
            chat_id: from.id,
            text: "Հղումը ժամկետանց է։ Վերադարձեք պրոյեկտ և նորից սեղմեք Ուղարկել։",
        });
        return;
    }

    db.prepare(`
        UPDATE users
        SET telegram_id = ?, telegram_username = ?
        WHERE id = ?
    `).run(String(from.id), from.username || "", row.user_id);

    db.prepare("DELETE FROM telegram_link_tokens WHERE token = ?").run(payload);

    await telegramCall("sendMessage", {
        chat_id: from.id,
        text: "Կապը ստեղծվեց։ Հիմա միացեք ալիքին, հետո պրոյեկտից սեղմեք Ուղարկել։\n\n" + config.joinUrl,
    });
}

async function rememberChannel(chat, replyChatId) {
    if (!chat || (chat.type !== "channel" && chat.type !== "supergroup")) {
        return false;
    }

    const channelId = String(chat.id);
    setSetting("telegram_channel_id", channelId);

    try {
        const invite = await telegramCall("createChatInviteLink", {
            chat_id: channelId,
            name: "agent1-join",
        });
        if (invite?.invite_link) {
            setSetting("telegram_join_url", invite.invite_link);
        }
    } catch {
        // invite may already exist
    }

    if (replyChatId) {
        await telegramCall("sendMessage", {
            chat_id: replyChatId,
            text: "Ալիքը կապվեց։ Հիմա հայտարարությունը կարող եք ուղարկել պրոյեկտից։",
        });
    }

    console.log("Telegram channel saved:", channelId);
    return true;
}

async function pollOnce() {
    const updates = await telegramCall("getUpdates", {
        offset,
        timeout: 20,
        allowed_updates: ["message", "channel_post", "my_chat_member"],
    });

    for (const update of updates || []) {
        offset = update.update_id + 1;
        const message = update.message;
        const forwarded =
            message?.forward_from_chat ||
            message?.forward_origin?.chat;

        if (forwarded) {
            await rememberChannel(forwarded, message.chat.id);
            continue;
        }

        if (update.my_chat_member?.chat) {
            await rememberChannel(update.my_chat_member.chat);
            continue;
        }

        if (update.channel_post?.chat) {
            await rememberChannel(update.channel_post.chat);
            continue;
        }

        if (isAppLocked() && message?.chat?.type === "private") {
            await telegramCall("sendMessage", {
                chat_id: message.chat.id,
                text: "Ծրագիրը արգելափակված է։",
            });
            continue;
        }

        if (message?.text && String(message.text).startsWith("/start")) {
            await handleStart(message);
        } else if (message?.chat?.type === "private") {
            const agency = getAgencyTelegramConfig();
            await telegramCall("sendMessage", {
                chat_id: message.chat.id,
                text: [
                    "Սա տների բոտն է։ Այստեղ գրելու դաշտ չի օգտագործվում։",
                    "Հայտարարությունը ուղարկեք պրոյեկտի Ուղարկել կոճակով։",
                    agency.botUrl ? `List.am նկարների համար բացեք գործակալության բոտը՝ ${agency.botUrl}` : "",
                ].filter(Boolean).join("\n"),
            });
        }
    }
}

async function loop() {
    while (started) {
        try {
            await pollOnce();
        } catch (error) {
            const conflict = String(error.message || "").includes("Conflict");
            if (conflict) {
                console.error("Houses telegram poll: Conflict — մեկ այլ Agent 1 (Electron/հին node) դեռ polling է անում նույն տների բոտով։ Փակեք Electron-ը, թողեք միայն մեկ npm start։");
                try {
                    await telegramCall("deleteWebhook", { drop_pending_updates: false });
                } catch {
                    // ignore
                }
                await new Promise((resolve) => setTimeout(resolve, 12000));
            } else {
                console.error("Houses telegram poll:", error.message);
                await new Promise((resolve) => setTimeout(resolve, 4000));
            }
        }
    }
}

async function prepareHousesBot() {
    try {
        await telegramCall("deleteWebhook", { drop_pending_updates: true });
    } catch {
        // polling
    }

    try {
        await telegramCall("setMyName", { name: "Agent 1 տներ" });
        await telegramCall("setMyShortDescription", {
            short_description: "Տների հայտարարությունները ուղարկվում են պրոյեկտից",
        });
        await telegramCall("setMyDescription", {
            description:
                "Սա Agent 1 տների բոտն է։ Հայտարարությունը ուղարկեք պրոյեկտից։ Գործակալության list.am բոտը առանձին է՝ @Agent1AgencyBot",
        });
        await telegramCall("setMyCommands", {
            commands: [{ command: "start", description: "Տների բոտ" }],
        });
    } catch {
        // optional profile
    }

    const config = getTelegramConfig();
    if (!config.joinUrl && config.channelId) {
        try {
            const invite = await telegramCall("createChatInviteLink", {
                chat_id: config.channelId,
                name: "agent1-houses-join",
            });
            if (invite?.invite_link) {
                setSetting("telegram_join_url", invite.invite_link);
            }
        } catch {
            // private invite may already exist
        }
    }
}

function startTelegramBot() {
    const config = getTelegramConfig();

    if (started || !config.botToken) {
        return;
    }

    if (!acquireTelegramPollLock("houses-" + config.botUsername)) {
        return;
    }

    started = true;
    console.log("Houses Telegram bot polling started for @" + config.botUsername);
    prepareHousesBot()
        .then(loop)
        .catch((error) => {
            console.error("Houses telegram start:", error.message);
            started = false;
        });
}

module.exports = {
    startTelegramBot,
    createLinkToken,
};
