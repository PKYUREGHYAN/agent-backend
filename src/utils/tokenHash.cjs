const crypto = require("crypto");

// ==========================================
// HASH TOKEN
// ==========================================

const hashToken = (token) => {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
};


// ==========================================
// EXPORT
// ==========================================

module.exports = {
    hashToken,
};