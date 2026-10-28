const { getTelegramConfig } = require("./telegramConfig.cjs");

function housesBotToken() {
    return getTelegramConfig().botToken;
}

async function telegramCall(method, payload = {}, form, options = {}) {
    const botToken = options.token || housesBotToken();

    if (!botToken) {
        throw new Error("Telegram բոտը կարգավորված չէ");
    }

    if (options.role === "agency" && botToken === housesBotToken()) {
        throw new Error("Գործակալության բոտը չի կարող օգտագործել տների բոտի token-ը");
    }

    const url = `https://api.telegram.org/bot${botToken}/${method}`;

    const response = form
        ? await fetch(url, { method: "POST", body: form })
        : await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

    const result = await response.json().catch(() => ({}));

    if (!result.ok) {
        const message = result.description || "Telegram հարցումը ձախողվեց";
        const error = new Error(message);
        error.telegram = result;
        throw error;
    }

    return result.result;
}

async function resolveChannelId() {
    const config = getTelegramConfig();

    if (config.channelId) {
        return config.channelId;
    }

    throw new Error("Ալիքի id-ն դեռ պահված չէ");
}

function dataUrlToBuffer(dataUrl) {
    if (typeof dataUrl !== "string") {
        return null;
    }

    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

    if (!match) {
        return null;
    }

    return {
        type: match[1],
        buffer: Buffer.from(match[2], "base64"),
    };
}

function extractPhotos(data) {
    const raw = data?.uploadedPhotos || data?.photos || [];

    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .map((item) => (typeof item === "string" ? item : item?.url || item?.original || item?.cleaned))
        .map(dataUrlToBuffer)
        .filter(Boolean)
        .slice(0, 10);
}

const LISTING_TYPE_META = {
    "apartment-rent": {
        deal: "Երկարաժամկետ վարձակալություն",
        property: "Բնակարաններ",
    },
    "house-rent": {
        deal: "Երկարաժամկետ վարձակալություն",
        property: "Տուն",
    },
    "daily-apartment": {
        deal: "Օրական վարձակալություն",
        property: "Բնակարաններ",
    },
    "daily-house": {
        deal: "Օրական վարձակալություն",
        property: "Տուն",
    },
    "apartment-sale": {
        deal: "Վաճառք",
        property: "Բնակարաններ",
    },
    "house-sale": {
        deal: "Վաճառք",
        property: "Տուն",
    },
};

const ROLE_LABELS = {
    owner: "Սեփականատեր",
    agency: "Գործակալություն",
    "0": "Սեփականատեր",
    "1": "Գործակալություն",
};

const OPTION_LABELS = {
    tv: "Հեռուստացույց",
    internet: "Ինտերնետ",
    airConditioner: "Օդորակիչ",
    pool: "Լողավազան",
    sauna: "Սաունա",
    fireplace: "Բուխարի",
    bbq: "Խորովածի վառարան",
    billiards: "Բիլիարդ",
    gazebo: "Տաղավար",
    security: "Անվտանգության համակարգ",
    fridge: "Սառնարան",
    stove: "Սալօջախ",
    microwave: "Միկրոալիքային վառարան",
    coffeeMaker: "Սրճեփ",
    dishwasher: "Սպասք լվացող մեքենա",
    washingMachine: "Լվացքի մեքենա",
    dryer: "Չորացնող մեքենա",
    waterHeater: "Ջրատաքացուցիչ",
    iron: "Արդուկ",
    hairDryer: "Ֆեն",
    intercom: "Դոմոֆոն",
    concierge: "Կոնսյերժ",
    playground: "Խաղահրապարակ",
    open: "Բաց",
    covered: "Ծածկած",
    garage: "Ավտոտնակ",
    yard: "Բակ",
    street: "Փողոց",
    city: "Քաղաք",
    park: "Այգի",
    ararat: "Արարատ",
};

const FIELD_LABELS = {
    dealType: "Գործարք",
    propertyType: "Գույք",
    category: "Գույք",
    userRole: "Կարգավիճակ",
    status: "Կարգավիճակ",
    city: "Վայր",
    selectedCity: "Վայր",
    region: "Մարզ / քաղաք",
    selectedRegion: "Վայր",
    cityOrDistrict: "Քաղաք / համայնք",
    street: "Փողոց",
    buildingNumber: "Շենքի համար",
    buildingType: "Շենքի տիպ",
    constructionType: "Կառուցվածք",
    condition: "Վիճակ",
    newBuilding: "Նորակառույց",
    newConstruction: "Նորակառույց",
    isNewBuilding: "Նորակառույց",
    elevator: "Վերելակ",
    totalFloors: "Շենքի հարկեր",
    buildingFloors: "Շենքի հարկեր",
    floorsCount: "Հարկերի քանակ",
    buildingAmenities: "Շենքի հարմարություններ",
    buildingFeatures: "Շենքի առանձնահատկություններ",
    parking: "Ավտոկայանատեղի",
    totalArea: "Մակերես",
    houseArea: "Տան մակերես",
    apartmentArea: "Բնակարանի մակերես",
    floorArea: "Մակերես",
    landArea: "Հողատարածք",
    totalLandArea: "Հողատարածք",
    rooms: "Սենյակ",
    roomsCount: "Սենյակ",
    bathrooms: "Սանհանգույց",
    bathroomsCount: "Սանհանգույց",
    ceilingHeight: "Առաստաղի բարձրություն",
    floor: "Հարկ",
    apartmentFloor: "Հարկ",
    balcony: "Պատշգամբ",
    furniture: "Կահույք",
    renovation: "Վերանորոգում",
    garage: "Ավտոտնակ",
    conveniences: "Հարմարություններ",
    amenities: "Հարմարություններ",
    comfort: "Հարմարավետություն",
    comfortList: "Հարմարավետություն",
    appliances: "Կենցաղային տեխնիկա",
    windowViews: "Տեսարան պատուհանից",
    viewsFromWindows: "Տեսարան պատուհանից",
    facilities: "Հարմարություններ",
    serviceLines: "Կոմունիկացիաներ",
    wheelchairAccessible: "Անվասայլակով հասանելի",
    childrenRule: "Երեխաներ",
    withChildren: "Երեխաներ",
    petsRule: "Կենդանիներ",
    petsAllowed: "Կենդանիներ",
    maxGuests: "Հյուրերի առավելագույն քանակ",
    overnightAllowed: "Գիշերակաց",
    availabilityStatus: "Հասանելիություն",
    availableFromDate: "Հասանելի է",
    availableDate: "Հասանելի է",
    rentAmount: "Գին",
    rentPrice: "Գին",
    price: "Գին",
    currency: "Արժույթ",
    paymentPeriod: "Վճարման պարբերականություն",
    period: "Ժամանակահատված",
    utilities: "Կոմունալներ",
    advancePayment: "Կանխավճար",
    prepayment: "Կանխավճար",
    description: "Նկարագրություն",
    contactPhone: "Հեռախոս",
    phoneNumber: "Հեռախոս",
};

const SKIP_FIELDS = new Set([
    "photos",
    "uploadedPhotos",
    "isDraft",
    "mainPhotoIndex",
    "photosCount",
    "uploadedPhotosCount",
    "hideBuildingNumber",
    "contactType",
    "useCustomPhone",
    "contactMode",
    "contactPhoneOption",
    "yerevanDistrict",
    "dealPath",
    "customPhone",
    "customPhoneNumber",
]);

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function formatOption(value) {
    if (value === true || value === "true") {
        return "";
    }

    if (ROLE_LABELS[value]) {
        return ROLE_LABELS[value];
    }

    if (OPTION_LABELS[value]) {
        return OPTION_LABELS[value];
    }

    return String(value);
}

function formatFieldValue(key, value) {
    if (value === null || value === undefined || value === false) {
        return "";
    }

    if (typeof value === "string" && !value.trim()) {
        return "";
    }

    if (Array.isArray(value)) {
        const items = value
            .map((item) => formatOption(item))
            .filter(Boolean);
        return items.join(", ");
    }

    if (typeof value === "object") {
        const items = Object.entries(value)
            .filter(([, selected]) => Boolean(selected) && selected !== "false" && selected !== "0")
            .map(([name, selected]) => {
                const label = OPTION_LABELS[name] || name;
                if (selected === true || selected === "true" || selected === 1) {
                    return label;
                }
                return `${label}: ${formatOption(selected)}`;
            })
            .filter(Boolean);
        return items.join(", ");
    }

    if (key === "userRole" || key === "status") {
        return formatOption(value);
    }

    if (key === "wheelchairAccessible") {
        if (value === "1" || value === 1 || value === "Այո") {
            return "Այո";
        }
        if (value === "2" || value === 2 || value === "Ոչ") {
            return "Ոչ";
        }
        return formatOption(value);
    }

    if (
        [
            "totalArea",
            "houseArea",
            "apartmentArea",
            "floorArea",
            "landArea",
            "totalLandArea",
        ].includes(key)
    ) {
        const text = String(value).trim();
        return /քմ|մ²|m2/i.test(text) ? text : `${text} քմ`;
    }

    if (typeof value === "boolean") {
        return value ? "Այո" : "";
    }

    return String(value);
}

function listingCaption(listingType, data, user) {
    const source = data && typeof data === "object" ? data : {};
    const meta = LISTING_TYPE_META[listingType] || {};
    const hideBuilding = Boolean(source.hideBuildingNumber);
    const used = new Set();
    const lines = ["🏠 <b>Նոր հայտարարություն</b>", ""];

    const addLine = (label, value) => {
        if (!value) {
            return;
        }
        lines.push(`<b>${escapeHtml(label)}:</b> ${escapeHtml(value)}`);
    };

    addLine("Գործարք", source.dealType || meta.deal);
    used.add("dealType");
    addLine("Գույք", source.propertyType || source.category || meta.property);
    used.add("propertyType");
    used.add("category");

    const orderedKeys = Object.keys(FIELD_LABELS);

    for (const key of orderedKeys) {
        if (used.has(key) || SKIP_FIELDS.has(key)) {
            continue;
        }

        if (hideBuilding && key === "buildingNumber") {
            used.add(key);
            continue;
        }

        const value = formatFieldValue(key, source[key]);
        used.add(key);

        if (!value) {
            continue;
        }

        addLine(FIELD_LABELS[key], value);
    }

    for (const [key, raw] of Object.entries(source)) {
        if (used.has(key) || SKIP_FIELDS.has(key) || key.startsWith("_")) {
            continue;
        }

        const value = formatFieldValue(key, raw);

        if (!value) {
            continue;
        }

        addLine(FIELD_LABELS[key] || key, value);
    }

    if (user?.username) {
        addLine("Ուղարկող", `@${user.username}`);
    }

    return lines.join("\n");
}

function splitTelegramText(text, limit = 3900) {
    if (text.length <= limit) {
        return [text];
    }

    const chunks = [];
    let rest = text;

    while (rest.length > limit) {
        let cut = rest.lastIndexOf("\n", limit);
        if (cut < limit / 2) {
            cut = limit;
        }
        chunks.push(rest.slice(0, cut));
        rest = rest.slice(cut).replace(/^\n+/, "");
    }

    if (rest) {
        chunks.push(rest);
    }

    return chunks;
}

async function sendListingToChannel(listingType, data, user, filePhotos = []) {
    const config = getTelegramConfig();
    const chatId = await resolveChannelId();
    const fullText = listingCaption(listingType, data, user);
    const textParts = splitTelegramText(fullText);
    const photos = filePhotos.length > 0 ? filePhotos : extractPhotos(data);
    const shortCaption = "🏠 Նոր հայտարարություն";

    const chatUrlFor = (messageId) => {
        const numeric = String(chatId).replace(/^-100/, "");
        if (messageId) {
            return `https://t.me/c/${numeric}/${messageId}`;
        }
        return config.joinUrl || `https://t.me/c/${numeric}`;
    };

    let firstMessageId = null;

    if (photos.length > 0) {
        const form = new FormData();
        form.append("chat_id", chatId);

        const media = photos.map((photo, index) => ({
            type: "photo",
            media: `attach://photo${index}`,
            ...(index === 0
                ? { caption: shortCaption }
                : {}),
        }));

        form.append("media", JSON.stringify(media));

        photos.forEach((photo, index) => {
            const blob = new Blob([photo.buffer], { type: photo.type || "image/jpeg" });
            form.append(`photo${index}`, blob, `photo${index}.jpg`);
        });

        const messages = await telegramCall("sendMediaGroup", {}, form);
        const first = Array.isArray(messages) ? messages[0] : messages;
        firstMessageId = first?.message_id;
    }

    for (const part of textParts) {
        const message = await telegramCall("sendMessage", {
            chat_id: chatId,
            text: part,
            parse_mode: "HTML",
        });

        if (!firstMessageId) {
            firstMessageId = message.message_id;
        }
    }

    return {
        messageId: firstMessageId,
        chatUrl: chatUrlFor(firstMessageId),
    };
}

async function getMembership(telegramId) {
    const chatId = await resolveChannelId();
    const member = await telegramCall("getChatMember", {
        chat_id: chatId,
        user_id: telegramId,
    });

    const status = member?.status || "";
    const isMember = [
        "creator",
        "administrator",
        "member",
        "restricted",
    ].includes(status);

    return {
        status,
        isMember,
        isChannelChief: status === "creator" || status === "administrator",
    };
}

module.exports = {
    telegramCall,
    resolveChannelId,
    sendListingToChannel,
    getMembership,
    extractPhotos,
};
