require("dotenv").config();

const jwt = require("jsonwebtoken");


// ==========================================
// CREATE ACCESS TOKEN
// ==========================================

const createAccessToken = (user) => {
    return jwt.sign(
        {
            userId: user.id,
            username: user.username,
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "15m",
        }
    );
};


// ==========================================
// CREATE REFRESH TOKEN
// ==========================================

const createRefreshToken = (user) => {
    return jwt.sign(
        {
            userId: user.id,
        },
        process.env.JWT_REFRESH_SECRET,
        {
            expiresIn: "7d",
        }
    );
};


// ==========================================
// VERIFY ACCESS TOKEN
// ==========================================

const verifyAccessToken = (token) => {
    return jwt.verify(
        token,
        process.env.JWT_SECRET
    );
};


// ==========================================
// VERIFY REFRESH TOKEN
// ==========================================

const verifyRefreshToken = (token) => {
    return jwt.verify(
        token,
        process.env.JWT_REFRESH_SECRET
    );
};


// ==========================================
// EXPORT
// ==========================================

module.exports = {
    createAccessToken,
    createRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
};