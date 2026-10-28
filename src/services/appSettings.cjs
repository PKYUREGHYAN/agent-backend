const db = require("../../database/database.cjs");

function getSetting(key) {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
    return row?.value || "";
}

function setSetting(key, value) {
    db.prepare(`
        INSERT INTO app_settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value));
}

module.exports = {
    getSetting,
    setSetting,
};
