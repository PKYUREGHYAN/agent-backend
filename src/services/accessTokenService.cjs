
const db = require("../../database/database.cjs");
const { hashToken } = require("../utils/tokenHash.cjs");

// ==========================================
// CREATE REVOKED ACCESS TOKENS TABLE
// ==========================================

db.exec(`
    CREATE TABLE IF NOT EXISTS revoked_access_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// ==========================================
// REVOKE ACCESS TOKEN
// ==========================================

const revokeAccessToken = (token, expiresAt) => {
    const tokenHash = hashToken(token);

    db.prepare(`
        INSERT OR IGNORE INTO revoked_access_tokens (
            token_hash,
            expires_at
        )
        VALUES (?, ?)
    `).run(tokenHash, expiresAt);
};

// ==========================================
// CHECK ACCESS TOKEN REVOCATION
// ==========================================

const isAccessTokenRevoked = (token) => {
    const tokenHash = hashToken(token);

    const revokedToken = db.prepare(`
        SELECT id
        FROM revoked_access_tokens
        WHERE token_hash = ?
          AND expires_at > ?
    `).get(tokenHash, Math.floor(Date.now() / 1000));

    return Boolean(revokedToken);
};

// ==========================================
// EXPORT
// ==========================================

module.exports = {
    revokeAccessToken,
    isAccessTokenRevoked,
};