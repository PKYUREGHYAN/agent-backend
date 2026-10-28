const { getSetting, setSetting } = require("./appSettings.cjs");
const db = require("../../database/database.cjs");
const { envSuperAdminEmails } = require("../utils/envEmails.cjs");

function isAppLocked() {
    return getSetting("app_locked") === "1";
}

function setAppLocked(locked) {
    setSetting("app_locked", locked ? "1" : "0");
    return isAppLocked();
}

function isSuperAdminUser(user) {
    if (!user) {
        return false;
    }

    if (user.role === "super_admin") {
        return true;
    }

    return envSuperAdminEmails().includes(String(user.email || "").trim().toLowerCase());
}

function findUserById(userId) {
    if (!userId) {
        return null;
    }

    return db
        .prepare("SELECT id, username, email, role FROM users WHERE id = ?")
        .get(userId);
}

module.exports = {
    isAppLocked,
    setAppLocked,
    isSuperAdminUser,
    findUserById,
};
