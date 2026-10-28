function splitEmails(value) {
    return String(value || "")
        .split(/[,;\s]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
}

function envAdminEmails() {
    const raw = [
        process.env.SUPER_ADMIN_EMAIL,
        process.env.ADMIN_EMAIL,
        process.env.ADMIN_EMAILS,
        process.env.SHARE_ADMIN_EMAILS,
    ]
        .filter(Boolean)
        .join(",");

    return splitEmails(raw);
}

function envSuperAdminEmails() {
    return splitEmails(process.env.SUPER_ADMIN_EMAIL);
}

function isEnvAdminEmail(email) {
    return envAdminEmails().includes(String(email || "").trim().toLowerCase());
}

module.exports = {
    envAdminEmails,
    envSuperAdminEmails,
    isEnvAdminEmail,
    splitEmails,
};
