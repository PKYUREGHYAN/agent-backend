const fs = require("fs");
const path = require("path");
const { getAgencyTelegramConfig, getTelegramConfig } = require("./telegramConfig.cjs");
const { acquireTelegramPollLock } = require("./telegramPollLock.cjs");
const { telegramCall } = require("./telegramApi.cjs");
const { fetchListAmListing, CLEAN_DIR } = require("./listAmService.cjs");
const {
    findByTelegramId,
    findByTelegramUsername,
    linkTelegram,
    consumeSearch,
    saveListing,
    createShareLink,
    saveBotJob,
    getBotJob,
    latestBotJob,
    toAgent,
} = require("./agencyService.cjs");
const { getSetting, setSetting } = require("./appSettings.cjs");
const { isAppLocked } = require("./appLock.cjs");
const { getCatalog, findPackage } = require("./packages.cjs");
const { zipBuffers } = require("../utils/zipBuffers.cjs");
const { webShareUrl } = require("../utils/lanAddress.cjs");

const BTN_PHOTOS = "🔶 Отправить клиенту все фото";
const BTN_CARD = "🔷 Отправить карточку объекта";
const BTN_ZIP = "⬇️ Скачать все фото (ZIP-архив)";
const BTN_PACKAGE = "📦 Ակտիվացնել փաթեթը";
const FIRST_ID_RE = /AG-1ST-\d{4}/i;
const LIST_AM_RE = /(?:https?:\/\/)?(?:www\.)?list\.am\/item\/(\d+)/i;

let started = false;
let offset = 0;

function tokenOpts() {
    return { token: getAgencyTelegramConfig().botToken, role: "agency" };
}

async function call(method, payload = {}, form) {
    return telegramCall(method, payload, form, tokenOpts());
}

function directorUrl() {
    return getAgencyTelegramConfig().directorUrl;
}

function rememberDirector(from) {
    const username = String(from?.username || "").replace(/^@/, "");
    const expected = getAgencyTelegramConfig().directorUsername;
    if (username && expected && username.toLowerCase() === expected.toLowerCase()) {
        setSetting("agency_director_chat_id", String(from.id));
    }
}

function directorChatId() {
    const config = getAgencyTelegramConfig();
    if (config.directorChatId) {
        return config.directorChatId;
    }

    const saved = getSetting("agency_director_chat_id");
    if (saved) {
        return saved;
    }

    const row = findByTelegramUsername(config.directorUsername);
    return row?.telegram_id ? String(row.telegram_id) : "";
}

function packageRequestText({ agent, pkg, from }) {
    const name = agent?.name || from?.first_name || from?.username || "օգտատեր";
    const who = from?.username ? `${name} (@${from.username})` : name;
    const price = pkg.finalPriceAMD ?? pkg.priceAMD;
    return [
        "Բարև։",
        `Օգտատեր ${who} ցանկանում է միացնել այս փաթեթը՝ ${pkg.name} (${pkg.listingsCount} հայտարարություն, ${price} դրամ)։`,
        agent?.secondId ? `2-րդ ID՝ ${agent.secondId}` : "",
        "Խնդրում եմ պայմանավորվել։",
    ].filter(Boolean).join("\n");
}

async function sendPackageRequestToDirector({ agent, pkg, from }) {
    const chatId = directorChatId();
    const text = packageRequestText({ agent, pkg, from });
    const agentChat = from?.username ? `https://t.me/${from.username}` : "";

    if (!chatId) {
        return { ok: false };
    }

    const payload = {
        chat_id: chatId,
        text,
    };

    if (agentChat) {
        payload.reply_markup = {
            inline_keyboard: [[{ text: "Գրել օգտատիրոջը", url: agentChat }]],
        };
    }

    await call("sendMessage", payload);
    return { ok: true };
}

async function sendPackageCatalog(from) {
    const agent = toAgent(findByTelegramId(from.id));
    if (!agent) {
        await call("sendMessage", {
            chat_id: from.id,
            text: "Նախ գրեք 1-ին ID-ն (AG-1ST-XXXX)։",
        });
        return;
    }

    const catalog = getCatalog();
    const keyboard = catalog.packages.map((pkg) => ([
        {
            text: `${pkg.popular ? "★ " : ""}${pkg.name} — ${pkg.finalPriceAMD} դրամ`,
            callback_data: `sel:${pkg.id}`,
        },
    ]));

    await call("sendMessage", {
        chat_id: from.id,
        text: "Փաթեթներ",
        reply_markup: { inline_keyboard: keyboard },
    });
}

function directorContact() {
    const config = getAgencyTelegramConfig();
    const username = config.directorUsername;
    const url = directorUrl() || (username ? `https://t.me/${username}` : "");
    return { url, username };
}

async function sendDirectorRedirect(chatId, pkg) {
    const { url, username } = directorContact();
    const price = pkg.finalPriceAMD ?? pkg.priceAMD;
    const who = username ? `@${username}` : "տնօրենին";
    const lines = [
        `Ընտրել եք ${pkg.name} (${pkg.listingsCount} հայտարարություն, ${price} դրամ)։`,
        `Փաթեթը ակտիվացնելու համար գրեք ${who}։`,
    ];

    if (!url) {
        lines.push("Տնօրենի Telegram-ը դեռ կարգավորված չէ։");
    }

    const payload = {
        chat_id: chatId,
        text: lines.join("\n"),
    };

    if (url) {
        payload.reply_markup = {
            inline_keyboard: [[{ text: `Գրել ${who}`, url }]],
        };
    }

    await call("sendMessage", payload);
}

async function handlePackageSelect(from, pkgId) {
    const pkg = getCatalog().packages.find((item) => item.id === pkgId) || findPackage(pkgId);
    const agent = toAgent(findByTelegramId(from.id));

    if (!pkg || !agent) {
        await sendPackageCatalog(from);
        return;
    }

    try {
        await sendPackageRequestToDirector({ agent, pkg, from });
    } catch (error) {
        console.error("Director notify:", error.message);
    }

    await sendDirectorRedirect(from.id, pkg);
}

function actionKeyboard(jobId) {
    return {
        inline_keyboard: [
            [{ text: BTN_PHOTOS, callback_data: `p:${jobId}` }],
            [{ text: BTN_CARD, callback_data: `c:${jobId}` }],
            [{ text: BTN_ZIP, callback_data: `z:${jobId}` }],
        ],
    };
}

function replyActions() {
    return {
        keyboard: [[{ text: BTN_PHOTOS }], [{ text: BTN_CARD }], [{ text: BTN_ZIP }]],
        resize_keyboard: true,
        is_persistent: true,
    };
}

function listingFiles(listing) {
    const itemId = String(listing?.id || "");
    const photos = Array.isArray(listing?.photos) ? listing.photos : [];
    const files = [];

    photos.forEach((photo, index) => {
        const id = photo.id || index + 1;
        const disk = path.join(CLEAN_DIR, itemId, `${id}.jpg`);
        if (fs.existsSync(disk)) {
            files.push({
                name: `${String(index + 1).padStart(2, "0")}.jpg`,
                buffer: fs.readFileSync(disk),
            });
        }
    });

    return files;
}

async function sendCleanedPhotos(chatId, listing) {
    const files = listingFiles(listing);
    if (!files.length) {
        await call("sendMessage", {
            chat_id: chatId,
            text: "Մաքուր նկարներ չգտնվեցին։",
        });
        return;
    }

    for (let i = 0; i < files.length; i += 10) {
        const chunk = files.slice(i, i + 10);
        const form = new FormData();
        form.append("chat_id", String(chatId));
        const media = chunk.map((file, index) => ({
            type: "photo",
            media: `attach://photo${index}`,
        }));
        form.append("media", JSON.stringify(media));
        chunk.forEach((file, index) => {
            const blob = new Blob([new Uint8Array(file.buffer)], { type: "image/jpeg" });
            form.append(`photo${index}`, blob, file.name);
        });
        await call("sendMediaGroup", {}, form);
    }
}

async function sendMenu(chatId, remaining) {
    if (remaining === 0) {
        return;
    }

    await call("sendMessage", {
        chat_id: chatId,
        text: remaining == null
            ? "Գրեք 1-ին ID-ն (AG-1ST-XXXX) կամ list.am հղումը։"
            : "Ուղարկեք list.am հղումը։",
    });
}

async function handleLink(from, firstId) {
    const agent = linkTelegram({
        firstId,
        telegramId: from.id,
        username: from.username || "",
    });

    if (!agent) {
        await call("sendMessage", {
            chat_id: from.id,
            text: "1-ին ID-ն չգտնվեց։",
        });
        return null;
    }

    if (Number(agent.remainingListings || 0) <= 0) {
        await sendPackageCatalog(from);
        return agent;
    }

    await call("sendMessage", {
        chat_id: from.id,
        text: "Ուղարկեք list.am հղումը։",
    });

    return agent;
}

async function processListing(from, url) {
    let agent = findByTelegramId(from.id);
    if (!agent) {
        await call("sendMessage", {
            chat_id: from.id,
            text: "Նախ գրեք ձեր 1-ին ID-ն (AG-1ST-XXXX), որ բոտը կապվի գործակալի հաշվին։",
        });
        return;
    }

    if (Number(agent.remaining_listings || 0) <= 0) {
        await sendPackageCatalog(from);
        return;
    }

    let listing;
    try {
        listing = await fetchListAmListing(url);
    } catch (error) {
        await call("sendMessage", {
            chat_id: from.id,
            text: error.message || "List.am-ից չհաջողվեց վերցնել։",
        });
        return;
    }

    const used = consumeSearch(agent.first_id);
    if (!used.ok) {
        await sendPackageCatalog(from);
        return;
    }

    saveListing(listing.id, agent.email, listing);
    const jobId = saveBotJob({
        telegramId: from.id,
        agentId: agent.id,
        listing,
    });

    await sendCleanedPhotos(from.id, listing);
    await call("sendMessage", {
        chat_id: from.id,
        text: "\u200b",
        reply_markup: actionKeyboard(jobId),
    });
}

async function shareKind(chatId, listing, kind) {
    const share = createShareLink({
        kind,
        listing,
        agentEmail: listing.agentEmail || "",
    });
    const url = webShareUrl(share.token);
    const label = kind === "photos"
        ? "Հաճախորդի նկարների հղում (3 օր)՝"
        : "Օբյեկտի քարտի հղում (3 օր)՝";
    await call("sendMessage", {
        chat_id: chatId,
        text: `${label}\n${url}`,
    });
}

async function sendZip(chatId, listing) {
    const files = listingFiles(listing);
    if (!files.length) {
        await call("sendMessage", { chat_id: chatId, text: "ZIP-ի համար նկար չկա։" });
        return;
    }

    const zip = zipBuffers(files);
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append(
        "document",
        new Blob([new Uint8Array(zip)], { type: "application/zip" }),
        `listam-${listing.id || "photos"}.zip`
    );
    form.append("caption", "Все фото (ZIP-архив)");
    await call("sendDocument", {}, form);
}

async function runAction(chatId, job, action) {
    if (!job?.listing) {
        await call("sendMessage", {
            chat_id: chatId,
            text: "Նախ ուղարկեք list.am հղումը։",
        });
        return;
    }

    if (action === "photos") {
        await shareKind(chatId, job.listing, "photos");
        return;
    }
    if (action === "card") {
        await shareKind(chatId, job.listing, "card");
        return;
    }
    await sendZip(chatId, job.listing);
}

function actionFromText(text) {
    if (text === BTN_PHOTOS) {
        return "photos";
    }
    if (text === BTN_CARD) {
        return "card";
    }
    if (text === BTN_ZIP) {
        return "zip";
    }
    if (text === BTN_PACKAGE || text === "/package") {
        return "package";
    }
    return "";
}

async function handleMessage(message) {
    if (!message || message.chat?.type !== "private") {
        return;
    }

    const from = message.from || {};
    rememberDirector(from);
    const text = String(message.text || "").trim();
    if (!text) {
        return;
    }

    if (isAppLocked()) {
        await call("sendMessage", {
            chat_id: from.id,
            text: "Ծրագիրը արգելափակված է",
        });
        return;
    }

    if (text.startsWith("/start") || text === "/menu") {
        const payload = text.split(/\s+/)[1] || "";
        const firstId = payload.match(FIRST_ID_RE)?.[0] || "";
        const wantsPkg = /^pkg/i.test(payload);

        if (firstId) {
            await handleLink(from, firstId);
        }

        const agent = findByTelegramId(from.id);
        const remaining = agent ? Number(agent.remaining_listings || 0) : null;

        if (wantsPkg) {
            if (!(firstId && remaining === 0)) {
                await sendPackageCatalog(from);
            }
            return;
        }

        if (!firstId && remaining === 0) {
            await sendPackageCatalog(from);
            return;
        }

        if (!firstId) {
            await sendMenu(from.id, remaining);
        }
        return;
    }

    if (text === "/package" || text === BTN_PACKAGE) {
        await sendPackageCatalog(from);
        return;
    }

    const action = actionFromText(text);
    if (action === "photos" || action === "card" || action === "zip") {
        await runAction(from.id, latestBotJob(from.id), action);
        return;
    }

    const firstId = text.match(FIRST_ID_RE)?.[0];
    if (firstId && !LIST_AM_RE.test(text)) {
        await handleLink(from, firstId);
        return;
    }

    const listMatch = text.match(LIST_AM_RE);
    if (listMatch) {
        await processListing(from, `https://www.list.am/item/${listMatch[1]}`);
        return;
    }

    await call("sendMessage", {
        chat_id: from.id,
        text: "list.am հղում կամ AG-1ST-XXXX",
    });
}

async function handleCallback(query) {
    const data = String(query.data || "");
    const chatId = query.message?.chat?.id || query.from?.id;
    rememberDirector(query.from);

    await call("answerCallbackQuery", { callback_query_id: query.id });

    if (isAppLocked()) {
        await call("sendMessage", {
            chat_id: chatId,
            text: "Ծրագիրը արգելափակված է",
        });
        return;
    }

    if (data === "pkg") {
        await sendPackageCatalog(query.from);
        return;
    }

    if (data.startsWith("sel:")) {
        await handlePackageSelect(query.from, data.slice(4));
        return;
    }

    const [code, jobId] = data.split(":");
    const job = jobId ? getBotJob(jobId) : latestBotJob(query.from.id);
    const map = { p: "photos", c: "card", z: "zip" };
    if (!map[code]) {
        return;
    }
    await runAction(chatId, job, map[code]);
}

async function pollOnce() {
    const updates = await call("getUpdates", {
        offset,
        timeout: 20,
        allowed_updates: ["message", "callback_query"],
    });

    for (const update of updates || []) {
        offset = update.update_id + 1;
        try {
            if (update.callback_query) {
                await handleCallback(update.callback_query);
            } else if (update.message) {
                await handleMessage(update.message);
            }
        } catch (error) {
            console.error("Agency telegram update:", error.message);
        }
    }
}

async function loop() {
    while (started) {
        try {
            await pollOnce();
        } catch (error) {
            console.error("Agency telegram poll:", error.message);
            await new Promise((resolve) => setTimeout(resolve, 4000));
        }
    }
}

async function prepare() {
    const config = getAgencyTelegramConfig();
    try {
        await call("deleteWebhook", { drop_pending_updates: true });
    } catch {
        // polling mode
    }

    try {
        await call("setMyName", { name: "Agent 1 գործակալություն" });
        await call("setMyShortDescription", {
            short_description: "list.am հղում → մաքուր նկարներ",
        });
        await call("setMyDescription", {
            description:
                "Սա Agent 1 գործակալության բոտն է։ Ուղարկեք list.am հղումը։ Տների բոտը առանձին է՝ @Agent1HousesBot",
        });
        await call("setMyCommands", {
            commands: [
                { command: "start", description: "Սկսել / միացնել հաշիվը" },
                { command: "menu", description: "Մենյու" },
                { command: "package", description: "Ակտիվացնել փաթեթը" },
            ],
        });
    } catch {
        // ignore
    }

    console.log("Agency Telegram bot polling started for @" + (config.botUsername || "unset"));
}

function startAgencyTelegramBot() {
    const config = getAgencyTelegramConfig();
    const houses = getTelegramConfig();

    if (started || !config.botToken) {
        if (!config.botToken) {
            console.log("Agency Telegram bot skipped: TELEGRAM_AGENCY_BOT_TOKEN դատարկ է");
        }
        return;
    }

    if (config.botToken === houses.botToken) {
        console.error("Agency Telegram bot skipped: նույն token-ը, ինչ տների բոտինն է");
        return;
    }

    if (!acquireTelegramPollLock("agency-" + (config.botUsername || "bot"))) {
        return;
    }

    started = true;
    prepare().then(loop).catch((error) => {
        console.error("Agency telegram start:", error.message);
        started = false;
    });
}

module.exports = {
    startAgencyTelegramBot,
    directorUrl,
};
