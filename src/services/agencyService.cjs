const crypto = require("crypto");
const db = require("../../database/database.cjs");
const { sendAgencyKeysEmail } = require("./mailService.cjs");

function makeFirstId() {
    return `AG-1ST-${Math.floor(1000 + Math.random() * 9000)}`;
}

function makeSecondId() {
    return `AG-2ND-${Math.floor(1000 + Math.random() * 9000)}`;
}

function toAgent(row) {
    if (!row) {
        return null;
    }

    return {
        id: `usr-${row.id}`,
        dbId: row.id,
        name: row.name,
        email: row.email,
        firstId: row.first_id,
        secondId: row.second_id,
        remainingListings: Number(row.remaining_listings || 0),
        activePackageId: row.active_package_id,
        activePackageName: row.active_package_name,
        paidAmountAMD: Number(row.paid_amount_amd || 0),
        registeredDate: String(row.created_at || "").slice(0, 10),
        createdAt: String(row.created_at || "").slice(0, 10),
    };
}

function findByEmail(email) {
    return db
        .prepare("SELECT * FROM agency_agents WHERE LOWER(email) = LOWER(?)")
        .get(String(email || "").trim());
}

function findByFirstId(firstId) {
    return db
        .prepare("SELECT * FROM agency_agents WHERE UPPER(first_id) = UPPER(?)")
        .get(String(firstId || "").trim());
}

function findBySecondId(secondId) {
    return db
        .prepare("SELECT * FROM agency_agents WHERE UPPER(second_id) = UPPER(?)")
        .get(String(secondId || "").trim());
}

function findByTelegramId(telegramId) {
    return db
        .prepare("SELECT * FROM agency_agents WHERE telegram_id = ?")
        .get(String(telegramId || "").trim());
}

function findByTelegramUsername(username) {
    const clean = String(username || "").trim().replace(/^@/, "");
    if (!clean) {
        return null;
    }

    return db
        .prepare("SELECT * FROM agency_agents WHERE LOWER(telegram_username) = LOWER(?)")
        .get(clean);
}

function linkTelegram({ firstId, telegramId, username }) {
    const row = findByFirstId(firstId);
    if (!row) {
        return null;
    }

    db.prepare(`
        UPDATE agency_agents
        SET telegram_id = ?, telegram_username = ?
        WHERE id = ?
    `).run(String(telegramId), String(username || ""), row.id);

    return toAgent(db.prepare("SELECT * FROM agency_agents WHERE id = ?").get(row.id));
}

function saveBotJob({ telegramId, agentId, listing }) {
    const id = crypto.randomBytes(4).toString("hex");
    db.prepare(`
        INSERT INTO agency_bot_jobs (id, telegram_id, agent_id, listing_json)
        VALUES (?, ?, ?, ?)
    `).run(id, String(telegramId), agentId || null, JSON.stringify(listing || {}));
    return id;
}

function getBotJob(jobId) {
    const row = db.prepare("SELECT * FROM agency_bot_jobs WHERE id = ?").get(String(jobId || ""));
    if (!row) {
        return null;
    }

    let listing = {};
    try {
        listing = JSON.parse(row.listing_json || "{}");
    } catch {
        listing = {};
    }

    return {
        id: row.id,
        telegramId: row.telegram_id,
        agentId: row.agent_id,
        listing,
    };
}

function latestBotJob(telegramId) {
    const row = db.prepare(`
        SELECT * FROM agency_bot_jobs
        WHERE telegram_id = ?
        ORDER BY created_at DESC
        LIMIT 1
    `).get(String(telegramId));

    if (!row) {
        return null;
    }

    return getBotJob(row.id);
}

function listAgents() {
    return db
        .prepare("SELECT * FROM agency_agents ORDER BY id DESC")
        .all()
        .map(toAgent);
}

function createAgent({ name, email, packageInfo }) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    const existing = findByEmail(cleanEmail);

    if (existing) {
        return toAgent(existing);
    }

    const info = db
        .prepare(`
            INSERT INTO agency_agents (
                name, email, first_id, second_id,
                remaining_listings, active_package_id, active_package_name, paid_amount_amd
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
            String(name || cleanEmail.split("@")[0]).trim(),
            cleanEmail,
            makeFirstId(),
            makeSecondId(),
            Number(packageInfo?.listingsCount || 0),
            packageInfo?.id || null,
            packageInfo?.name || null,
            Number(packageInfo?.priceAMD || 0)
        );

    return toAgent(
        db.prepare("SELECT * FROM agency_agents WHERE id = ?").get(info.lastInsertRowid)
    );
}

function deleteAgent(userId) {
    const id = Number(userId);
    if (!id) {
        return false;
    }

    const row = db.prepare("SELECT id FROM agency_agents WHERE id = ?").get(id);
    if (!row) {
        return false;
    }

    db.prepare("DELETE FROM agency_agents WHERE id = ?").run(id);
    return true;
}

async function requestKeys(email) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    let agent = toAgent(findByEmail(cleanEmail));

    if (!agent) {
        agent = createAgent({ email: cleanEmail, name: cleanEmail.split("@")[0] });
    }

    await sendAgencyKeysEmail(cleanEmail, {
        firstId: agent.firstId,
        secondId: agent.secondId,
    });

    const masked = cleanEmail.replace(/^(.{1}).*(@.*)$/, "$1***$2");
    return {
        delivery: "email",
        message: `Կոդերը ուղարկվեցին ${masked} հասցեին։ Բացեք Gmail-ը և 1-ին կոդը գրեք վերևի դաշտում։`,
    };
}

function loginWithFirstId(firstId) {
    const agent = toAgent(findByFirstId(firstId));
    if (!agent) {
        return null;
    }
    return agent;
}

function consumeSearch(firstId) {
    const row = findByFirstId(firstId);
    if (!row || Number(row.remaining_listings || 0) <= 0) {
        return { ok: false, remaining: 0, empty: true };
    }

    const remaining = Number(row.remaining_listings) - 1;
    db.prepare("UPDATE agency_agents SET remaining_listings = ? WHERE id = ?").run(
        remaining,
        row.id
    );

    return { ok: true, remaining, empty: remaining <= 0, agent: toAgent({ ...row, remaining_listings: remaining }) };
}

function activatePackage(agentId, pkg) {
    const id = String(agentId || "").replace(/^usr-/, "");
    const row = db.prepare("SELECT * FROM agency_agents WHERE id = ?").get(id);
    if (!row) {
        return null;
    }

    db.prepare(`
        UPDATE agency_agents
        SET remaining_listings = ?, active_package_id = ?, active_package_name = ?, paid_amount_amd = ?
        WHERE id = ?
    `).run(
        Number(pkg.listingsCount),
        pkg.id,
        pkg.name || pkg.nameRu || "",
        Number(pkg.priceAMD || 0),
        id
    );

    return toAgent(db.prepare("SELECT * FROM agency_agents WHERE id = ?").get(id));
}

function cancelPackage(agentId) {
    const id = String(agentId || "").replace(/^usr-/, "");
    db.prepare(`
        UPDATE agency_agents
        SET remaining_listings = 0, active_package_id = NULL, active_package_name = NULL, paid_amount_amd = 0
        WHERE id = ?
    `).run(id);

    return toAgent(db.prepare("SELECT * FROM agency_agents WHERE id = ?").get(id));
}

function saveListing(itemId, agentEmail, payload) {
    const cleanId = String(itemId || "").trim();
    const email = agentEmail ? String(agentEmail).trim().toLowerCase() : null;
    const json = JSON.stringify(payload || {});

    const existing = email
        ? db.prepare(`
            SELECT id FROM agency_listings
            WHERE item_id = ? AND LOWER(COALESCE(agent_email, '')) = ?
            ORDER BY id DESC LIMIT 1
        `).get(cleanId, email)
        : db.prepare(`
            SELECT id FROM agency_listings
            WHERE item_id = ?
            ORDER BY id DESC LIMIT 1
        `).get(cleanId);

    if (existing?.id) {
        db.prepare(`
            UPDATE agency_listings
            SET payload_json = ?, agent_email = COALESCE(?, agent_email)
            WHERE id = ?
        `).run(json, email, existing.id);
        return existing.id;
    }

    const info = db.prepare(`
        INSERT INTO agency_listings (item_id, agent_email, payload_json)
        VALUES (?, ?, ?)
    `).run(cleanId, email, json);

    return info.lastInsertRowid;
}

function getListingByItemId(itemId, agentEmail = null) {
    const cleanId = String(itemId || "").trim();
    if (!cleanId) {
        return null;
    }

    const email = agentEmail ? String(agentEmail).trim().toLowerCase() : null;
    const row = email
        ? db.prepare(`
            SELECT * FROM agency_listings
            WHERE item_id = ? AND LOWER(COALESCE(agent_email, '')) = ?
            ORDER BY id DESC LIMIT 1
        `).get(cleanId, email)
        : db.prepare(`
            SELECT * FROM agency_listings
            WHERE item_id = ?
            ORDER BY id DESC LIMIT 1
        `).get(cleanId);

    if (!row) {
        return null;
    }

    try {
        return JSON.parse(row.payload_json || "{}");
    } catch {
        return null;
    }
}

function createShareLink({ kind, listing, agentEmail }) {
    const token = crypto.randomBytes(18).toString("hex");
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const houseId = String(listing?.id || listing?.itemId || "").replace(/\D/g, "") || null;

    db.prepare(`
        INSERT INTO share_links (token, kind, title, house_id, payload_json, agent_email, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        token,
        kind === "photos" ? "photos" : "card",
        listing?.title || "",
        houseId,
        JSON.stringify(listing || {}),
        agentEmail || null,
        expiresAt
    );

    return {
        token,
        kind: kind === "photos" ? "photos" : "card",
        expiresAt,
        title: listing?.title || "",
        houseId,
        appUrl: houseId ? `agent1://house/${houseId}/${token}` : `agent1://share/${token}`,
    };
}

function getShareByToken(token, { allowExpired = false } = {}) {
    const row = db.prepare("SELECT * FROM share_links WHERE token = ?").get(token);
    if (!row) {
        return null;
    }

    const expired = new Date(row.expires_at).getTime() <= Date.now();
    if (expired && !allowExpired) {
        return { expired: true, expiresAt: row.expires_at, title: row.title };
    }

    return {
        token: row.token,
        kind: row.kind,
        title: row.title,
        houseId: row.house_id,
        listing: JSON.parse(row.payload_json),
        expiresAt: row.expires_at,
        expired,
        agentEmail: row.agent_email,
        createdAt: row.created_at,
        id: row.id,
        appUrl: row.house_id
            ? `agent1://house/${row.house_id}/${row.token}`
            : `agent1://share/${row.token}`,
    };
}

function listShareLinks() {
    return db
        .prepare("SELECT * FROM share_links ORDER BY id DESC")
        .all()
        .map((row) => {
            let listing = {};
            try {
                listing = JSON.parse(row.payload_json || "{}");
            } catch {
                listing = {};
            }

            return {
                id: row.id,
                token: row.token,
                kind: row.kind,
                title: row.title,
                houseId: row.house_id || listing.id || "",
                address: listing.address || "",
                price: listing.price || "",
                agentEmail: row.agent_email,
                expiresAt: row.expires_at,
                createdAt: row.created_at,
                expired: new Date(row.expires_at).getTime() <= Date.now(),
                appUrl: row.house_id
                    ? `agent1://house/${row.house_id}/${row.token}`
                    : `agent1://share/${row.token}`,
            };
        });
}

function renewShareLink(id) {
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("UPDATE share_links SET expires_at = ? WHERE id = ?").run(expiresAt, id);
    const row = db.prepare("SELECT * FROM share_links WHERE id = ?").get(id);
    if (!row) {
        return null;
    }
    return {
        token: row.token,
        expiresAt: row.expires_at,
        title: row.title,
        kind: row.kind,
        houseId: row.house_id,
        appUrl: row.house_id
            ? `agent1://house/${row.house_id}/${row.token}`
            : `agent1://share/${row.token}`,
    };
}

module.exports = {
    listAgents,
    createAgent,
    deleteAgent,
    requestKeys,
    loginWithFirstId,
    consumeSearch,
    activatePackage,
    cancelPackage,
    saveListing,
    getListingByItemId,
    createShareLink,
    getShareByToken,
    listShareLinks,
    renewShareLink,
    findByEmail,
    findByFirstId,
    findBySecondId,
    findByTelegramId,
    findByTelegramUsername,
    linkTelegram,
    saveBotJob,
    getBotJob,
    latestBotJob,
    toAgent,
};
