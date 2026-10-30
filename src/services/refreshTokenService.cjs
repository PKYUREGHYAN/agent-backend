const db = require("../../database/database.cjs");

const {
    hashToken,
} = require("../utils/tokenHash.cjs");


// ==========================================
// SAVE REFRESH TOKEN
// ==========================================

const saveRefreshToken = (userId, refreshToken, expiresAt) => {

    const tokenHash = hashToken(refreshToken);

    const result = db
        .prepare(`
            INSERT INTO refresh_tokens (
                user_id,
                token_hash,
                expires_at
            )
            VALUES (?, ?, ?)
        `)
        .run(
            userId,
            tokenHash,
            expiresAt
        );

    return result.lastInsertRowid;
};


// ==========================================
// FIND REFRESH TOKEN
// ==========================================

const findRefreshToken = (refreshToken) => {

    const tokenHash = hashToken(refreshToken);

    return db
        .prepare(`
            SELECT
                id,
                user_id,
                token_hash,
                expires_at,
                created_at,
                rotated_at
            FROM refresh_tokens
            WHERE token_hash = ?
        `)
        .get(tokenHash);
};


// ==========================================
// DELETE REFRESH TOKEN
// ==========================================

const markRefreshTokenRotated = (refreshToken) => {
    const tokenHash = hashToken(refreshToken);

    db.prepare(`
        UPDATE refresh_tokens
        SET rotated_at = ?
        WHERE token_hash = ?
          AND rotated_at IS NULL
    `).run(new Date().toISOString(), tokenHash);
};


const deleteRefreshToken = (refreshToken) => {

    const tokenHash = hashToken(refreshToken);

    const result = db
        .prepare(`
            DELETE FROM refresh_tokens
            WHERE token_hash = ?
        `)
        .run(tokenHash);

    return result.changes;
};


const deleteRefreshTokensByUserId = (userId) => {
    const result = db
        .prepare(`
            DELETE FROM refresh_tokens
            WHERE user_id = ?
        `)
        .run(userId);

    return result.changes;
};


// ==========================================
// EXPORT
// ==========================================

module.exports = {
    saveRefreshToken,
    findRefreshToken,
    markRefreshTokenRotated,
    deleteRefreshToken,
    deleteRefreshTokensByUserId,
};