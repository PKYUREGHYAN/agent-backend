const db = require("../../database/database.cjs");


// ==========================================
// CHECK EMAIL EXISTS
// ==========================================

const checkUserExists = (req, res, next) => {

    const {
        username,
        email,
    } = req.body;

    const cleanUsername = username ? username.trim() : "";
    const cleanEmail = email ? email.trim().toLowerCase() : "";

    const existingUser = db
        .prepare(`
SELECT
id,
    username,
    email
FROM users
WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
    `)
        .get(
            cleanUsername,
            cleanEmail
        );

    if (existingUser) {
        const sameEmail =
            existingUser.email.toLowerCase() === cleanEmail;

        return res.status(409).json({
            success: false,
            message: sameEmail
                ? "Այս Email-ը արդեն օգտագործվում է"
                : "Username-ը արդեն օգտագործվում է",
        });
    }


    // ------------------------------------------
    // EMAIL IS UNIQUE
    // ------------------------------------------

    next();
};


// ==========================================
// EXPORT
// ==========================================

module.exports = checkUserExists;