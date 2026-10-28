require("dotenv").config();

const jwt = require("jsonwebtoken");

const {
    createAccessToken,
    createRefreshToken,
    verifyRefreshToken,
} = require("../utils/jwt.cjs");

const {
    saveRefreshToken,
    findRefreshToken,
    deleteRefreshToken,
    deleteRefreshTokensByUserId,
} = require("../services/refreshTokenService.cjs");

const {
    validatePassword,
    validateConfirmPassword,
} = require("../middleware/validateAuth.cjs");

// ԱՎԵԼԱՑՈՒՄ․ Access Token-ի չեղարկման ծառայություն
const {
    revokeAccessToken,
} = require("../services/accessTokenService.cjs");

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const db = require("../../database/database.cjs");
const { hashToken } = require("../utils/tokenHash.cjs");
const { sendResetCodeEmail, sendAgencyKeysEmail, maskEmail } = require("../services/mailService.cjs");


// ==========================================
// GET USER ROLE BY EMAIL
// ==========================================

const getRoleByEmail = (email) => {

    const cleanEmail = email
        .trim()
        .toLowerCase();

    const { envAdminEmails, envSuperAdminEmails } = require("../utils/envEmails.cjs");

    if (envSuperAdminEmails().includes(cleanEmail)) {
        return "super_admin";
    }

    if (envAdminEmails().includes(cleanEmail)) {
        return "admin";
    }


    // ------------------------------------------
    // NORMAL USER
    // ------------------------------------------

    return "user";
};


const issueSession = (user) => {
    const accessToken = createAccessToken({
        id: user.id,
        username: user.username,
    });

    const refreshToken = createRefreshToken({
        id: user.id,
    });

    const refreshTokenExpiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    saveRefreshToken(
        user.id,
        refreshToken,
        refreshTokenExpiresAt
    );

    return {
        accessToken,
        refreshToken,
    };
};


// ==========================================
// REGISTER
// ==========================================

const register = async (req, res) => {

    try {

        const {
            username,
            email,
            password,
        } = req.body;


        // ------------------------------------------
        // CHECK FIELDS
        // ------------------------------------------

        if (
            !username ||
            !email ||
            !password
        ) {

            return res.status(400).json({
                success: false,
                message: "Բոլոր դաշտերը պարտադիր են",
            });

        }


        // ------------------------------------------
        // CLEAN DATA
        // ------------------------------------------

        const cleanUsername =
            username.trim();

        const cleanEmail =
            email.trim().toLowerCase();


        // ------------------------------------------
        // CHECK EXISTING USER
        // ------------------------------------------

        const existingUser = db
            .prepare(`
SELECT id
FROM users
WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
    `)
            .get(
                cleanUsername,
                cleanEmail
            );


        if (existingUser) {

            return res.status(409).json({
                success: false,
                message:
                    "Username-ը կամ Email-ը արդեն օգտագործվում է",
            });

        }


        // ------------------------------------------
        // DETERMINE USER ROLE
        // ------------------------------------------

        const role =
            getRoleByEmail(cleanEmail);


        // ------------------------------------------
        // HASH PASSWORD
        // ------------------------------------------

        const hashedPassword =
            await bcrypt.hash(
                password,
                10
            );


        // ------------------------------------------
        // CREATE USER
        // ------------------------------------------

        const result = db
            .prepare(`
    INSERT INTO users (
    username,
    email,
    password,
    role
)
VALUES (?, ?, ?, ?)
    `)
            .run(
                cleanUsername,
                cleanEmail,
                hashedPassword,
                role
            );

        const user = {
            id: Number(result.lastInsertRowid),
            username: cleanUsername,
            email: cleanEmail,
            role,
        };

        const session = issueSession(user);

        return res.status(201).json({
            success: true,
            message: "Գրանցումը հաջողությամբ կատարվեց",
            ...session,
            user,
        });

    } catch (error) {

        console.error(
            "Register error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Server-ի ներքին սխալ",
        });

    }
};


// ==========================================
// LOGIN
// ==========================================

const login = async (req, res) => {

    try {

        const {
            username,
            password,
        } = req.body;


        // ------------------------------------------
        // CHECK FIELDS
        // ------------------------------------------

        if (
            !username ||
            !password
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Username-ը և Password-ը պարտադիր են",
            });

        }


        // ------------------------------------------
        // CLEAN USERNAME / EMAIL
        // ------------------------------------------

        const cleanUsername =
            username.trim();


        // ------------------------------------------
        // FIND USER
        // ------------------------------------------

        const user = db
            .prepare(`
SELECT
id,
    username,
    email,
    password,
    role
FROM users
WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
    `)
            .get(
                cleanUsername,
                cleanUsername
            );


        if (!user) {

            return res.status(401).json({
                success: false,
                message:
                    "Սխալ username կամ password",
            });

        }


        // ------------------------------------------
        // CHECK PASSWORD
        // ------------------------------------------

        const passwordMatch =
            await bcrypt.compare(
                password,
                user.password
            );


        if (!passwordMatch) {

            return res.status(401).json({
                success: false,
                message:
                    "Սխալ username կամ password",
            });

        }

        const nextRole = getRoleByEmail(user.email);
        if (nextRole !== user.role) {
            db.prepare("UPDATE users SET role = ? WHERE id = ?").run(nextRole, user.id);
            user.role = nextRole;
        }

        const session = issueSession(user);

        return res.status(200).json({
            success: true,
            message: "Մուտքը հաջողությամբ կատարվեց",
            ...session,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
            },
        });

    } catch (error) {

        console.error(
            "Login error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Server-ի ներքին սխալ",
        });

    }
};


// ==========================================
// REFRESH TOKEN
// ==========================================

const refresh = async (req, res) => {

    try {

        const {
            refreshToken,
        } = req.body;


        // ------------------------------------------
        // CHECK REFRESH TOKEN
        // ------------------------------------------

        if (!refreshToken) {

            return res.status(401).json({
                success: false,
                message:
                    "Refresh Token-ը պարտադիր է",
            });

        }


        // ------------------------------------------
        // FIND TOKEN IN DATABASE
        // ------------------------------------------

        const storedToken =
            findRefreshToken(
                refreshToken
            );


        if (!storedToken) {

            return res.status(401).json({
                success: false,
                message:
                    "Refresh Token-ը վավեր չէ",
            });

        }


        // ------------------------------------------
        // VERIFY JWT
        // ------------------------------------------

        const decoded =
            verifyRefreshToken(
                refreshToken
            );


        // ------------------------------------------
        // CHECK USER ID
        // ------------------------------------------

        if (
            decoded.userId !==
            storedToken.user_id
        ) {

            return res.status(401).json({
                success: false,
                message:
                    "Refresh Token-ը վավեր չէ",
            });

        }


        // ------------------------------------------
        // CHECK TOKEN EXPIRATION
        // ------------------------------------------

        const expiresAt =
            new Date(
                storedToken.expires_at
            );


        if (
            expiresAt <= new Date()
        ) {

            return res.status(401).json({
                success: false,
                message:
                    "Refresh Token-ի ժամկետը լրացել է",
            });

        }


        // ------------------------------------------
        // GET USER
        // ------------------------------------------

        const user = db
            .prepare(`
    SELECT
id,
    username,
    email,
    role
FROM users
WHERE id = ?
    `)
            .get(
                decoded.userId
            );


        if (!user) {

            return res.status(401).json({
                success: false,
                message:
                    "Օգտատերը չի գտնվել",
            });

        }


        // ------------------------------------------
        // DELETE OLD REFRESH TOKEN
        // ------------------------------------------

        deleteRefreshToken(
            refreshToken
        );


        // ------------------------------------------
        // CREATE NEW ACCESS TOKEN
        // ------------------------------------------

        const accessToken =
            createAccessToken({
                id: user.id,
                username: user.username,
            });


        // ------------------------------------------
        // CREATE NEW REFRESH TOKEN
        // ------------------------------------------

        const newRefreshToken =
            createRefreshToken({
                id: user.id,
            });


        // ------------------------------------------
        // NEW REFRESH TOKEN EXPIRATION
        // ------------------------------------------

        const newRefreshTokenExpiresAt =
            new Date(
                Date.now() +
                7 * 24 * 60 * 60 * 1000
            ).toISOString();


        // ------------------------------------------
        // SAVE NEW REFRESH TOKEN
        // ------------------------------------------

        saveRefreshToken(
            user.id,
            newRefreshToken,
            newRefreshTokenExpiresAt
        );


        // ------------------------------------------
        // RESPONSE
        // ------------------------------------------

        return res.status(200).json({

            success: true,

            message:
                "Token-ները հաջողությամբ թարմացվեցին",

            accessToken,

            refreshToken:
                newRefreshToken,

            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
            },

        });

    } catch (error) {

        console.error(
            "Refresh token error:",
            error
        );

        return res.status(401).json({
            success: false,
            message:
                "Refresh Token-ը վավեր չէ",
        });

    }
};


// ==========================================
// LOGOUT
// ==========================================

const logout = async (req, res) => {
    try {
        const { refreshToken } = req.body || {};

        // A refresh token represents the persisted login session.  Requiring it
        // here prevents a client from only clearing its access token while the
        // refresh session remains usable in the database.
        if (typeof refreshToken !== "string" || !refreshToken.trim()) {
            return res.status(400).json({
                success: false,
                message: "Logout-ի համար Refresh Token-ը պարտադիր է",
            });
        }

        const cleanRefreshToken = refreshToken.trim();

        // ------------------------------------------
        // GET ACCESS TOKEN FROM HEADER
        // ------------------------------------------

        const authHeader = req.headers.authorization;
        const parts = authHeader ? authHeader.split(" ") : [];

        const accessToken =
            parts.length === 2 &&
            parts[0] === "Bearer" &&
            parts[1]
                ? parts[1]
                : null;

        // ------------------------------------------
        // VERIFY THE PERSISTED SESSION
        // ------------------------------------------

        let refreshPayload;

        try {
            refreshPayload = verifyRefreshToken(cleanRefreshToken);
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: "Refresh Token-ը վավեր չէ",
            });
        }

        const storedRefreshToken = findRefreshToken(cleanRefreshToken);

        // Logout is deliberately idempotent.  A second click (or a retried
        // network request) is still a successful signed-out state.
        if (!storedRefreshToken) {
            return res.status(200).json({
                success: true,
                message: "Դուք արդեն դուրս եք եկել համակարգից",
            });
        }

        if (refreshPayload.userId !== storedRefreshToken.user_id) {
            return res.status(401).json({
                success: false,
                message: "Refresh Token-ը վավեր չէ",
            });
        }

        let accessTokenExpiresAt = null;

        // ------------------------------------------
        // REVOKE ACCESS TOKEN
        // ------------------------------------------

        if (accessToken) {
            try {
                const decoded = jwt.verify(
                    accessToken,
                    process.env.JWT_SECRET
                );

                if (!decoded.exp || decoded.userId !== refreshPayload.userId) {
                    console.error(
                        "Access Token-ը չի պատկանում logout session-ին։"
                    );

                    return res.status(401).json({
                        success: false,
                        message: "Access Token-ը վավեր չէ",
                    });
                }

                accessTokenExpiresAt = decoded.exp;
            } catch (error) {
                console.error(
                    "Access Token revoke error:",
                    error.message
                );

                // Անվավեր կամ ժամկետանց Access Token-ի դեպքում
                // շարունակում ենք Refresh Token-ի չեղարկումը։
            }
        }

        // ------------------------------------------
        // DELETE REFRESH TOKEN AND REVOKE ACCESS TOKEN ATOMICALLY
        // ------------------------------------------

        const logoutTransaction = db.transaction(() => {
            deleteRefreshToken(cleanRefreshToken);

            if (accessTokenExpiresAt) {
                revokeAccessToken(accessToken, accessTokenExpiresAt);
            }
        });

        logoutTransaction();

        // ------------------------------------------
        // LOGOUT SUCCESS
        // ------------------------------------------

        return res.status(200).json({
            success: true,
            message: "Դուք հաջողությամբ դուրս եկաք համակարգից",
        });
    } catch (error) {
        console.error("Logout error:", error);

        return res.status(500).json({
            success: false,
            message: "Logout-ի ժամանակ սերվերի սխալ է առաջացել",
        });
    }
};



const findUserForReset = (username, email) => {
    const cleanUsername = username ? String(username).trim() : "";
    const cleanEmail = email ? String(email).trim().toLowerCase() : "";

    if (!cleanUsername || !cleanEmail) {
        return null;
    }

    return db
        .prepare(`
            SELECT id, username, email
            FROM users
            WHERE LOWER(username) = LOWER(?) AND LOWER(email) = LOWER(?)
        `)
        .get(cleanUsername, cleanEmail);
};

const requestPasswordReset = async (req, res) => {
    try {
        const user = findUserForReset(req.body?.username, req.body?.email);

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Username-ը և email-ը չեն համընկնում",
            });
        }

        const latest = db
            .prepare(`
                SELECT created_at
                FROM password_reset_codes
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT 1
            `)
            .get(user.id);

        if (latest && Date.now() - new Date(latest.created_at).getTime() < 60 * 1000) {
            return res.status(429).json({
                success: false,
                message: "Կոդը արդեն ուղարկվել է։ Սպասեք 1 րոպե։",
            });
        }

        const code = String(crypto.randomInt(100000, 1000000));
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        await sendResetCodeEmail(user.email, code);

        db.prepare(`
            DELETE FROM password_reset_codes
            WHERE user_id = ?
        `).run(user.id);

        db.prepare(`
            INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
            VALUES (?, ?, ?)
        `).run(user.id, hashToken(code), expiresAt);

        return res.status(200).json({
            success: true,
            message: `Կոդը ուղարկվեց ${maskEmail(user.email)} հասցեին։ Գրեք այն այստեղ, հետո նոր գաղտնաբառը։`,
        });
    } catch (error) {
        console.error("Password reset request error:", error);

        return res.status(500).json({
            success: false,
            message:
                error.message === "SMTP-ն կարգավորված չէ"
                    ? "Gmail-ով նամակ ուղարկելը դեռ կարգավորված չէ"
                    : "Կոդը չհաջողվեց ուղարկել Gmail",
        });
    }
};

const confirmPasswordReset = async (req, res) => {
    try {
        const { username, email, code, password, confirmPassword } = req.body || {};
        const user = findUserForReset(username, email);

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Username-ը և email-ը չեն համընկնում",
            });
        }

        const passwordError = validatePassword(password);

        if (passwordError) {
            return res.status(400).json({
                success: false,
                message: passwordError,
            });
        }

        const confirmError = validateConfirmPassword(password, confirmPassword);

        if (confirmError) {
            return res.status(400).json({
                success: false,
                message: confirmError,
            });
        }

        const cleanCode = code ? String(code).trim() : "";

        if (!/^\d{6}$/.test(cleanCode)) {
            return res.status(400).json({
                success: false,
                message: "Մուտքագրեք Gmail-ից եկած 6 նիշանոց կոդը",
            });
        }

        const row = db
            .prepare(`
                SELECT id, code_hash, expires_at
                FROM password_reset_codes
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT 1
            `)
            .get(user.id);

        if (
            !row ||
            row.code_hash !== hashToken(cleanCode) ||
            new Date(row.expires_at).getTime() < Date.now()
        ) {
            return res.status(400).json({
                success: false,
                message: "Կոդը սխալ է կամ ժամկետը լրացել է",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        db.prepare(`
            UPDATE users
            SET password = ?
            WHERE id = ?
        `).run(hashedPassword, user.id);

        db.prepare(`
            DELETE FROM password_reset_codes
            WHERE user_id = ?
        `).run(user.id);

        deleteRefreshTokensByUserId(user.id);

        return res.status(200).json({
            success: true,
            message: "Գաղտնաբառը փոխվեց։ Այժմ կարող եք մուտք գործել։",
        });
    } catch (error) {
        console.error("Password reset confirm error:", error);

        return res.status(500).json({
            success: false,
            message: "Գաղտնաբառը փոխելիս սերվերի սխալ է առաջացել",
        });
    }
};


const isGmailAddress = (email) => {
    return /^[^\s@]+@gmail\.com$/i.test(String(email || "").trim());
};

const sendAgencyKeys = async (req, res) => {
    try {
        const email = String(req.body?.email || "").trim().toLowerCase();
        const firstId = String(req.body?.firstId || "").trim().toUpperCase();
        const secondId = String(req.body?.secondId || "").trim().toUpperCase();

        if (!isGmailAddress(email)) {
            return res.status(400).json({
                success: false,
                message: "Գրեք ձեր անձնական Gmail հասցեն",
            });
        }

        if (!/^AG-1ST-\d{4}$/.test(firstId) || !/^AG-2ND-\d{4}$/.test(secondId)) {
            return res.status(400).json({
                success: false,
                message: "Կոդերը սխալ են",
            });
        }

        await sendAgencyKeysEmail(email, { firstId, secondId });

        return res.status(200).json({
            success: true,
            message: `Կոդերը ուղարկվեցին ${maskEmail(email)} հասցեին։ Բացեք Gmail-ը և 1-ին կոդը գրեք այստեղ։`,
        });
    } catch (error) {
        console.error("Agency keys email error:", error);

        return res.status(500).json({
            success: false,
            message:
                error.message === "SMTP-ն կարգավորված չէ"
                    ? "Gmail-ով նամակ ուղարկելը դեռ կարգավորված չէ"
                    : "Կոդը չհաջողվեց ուղարկել Gmail",
        });
    }
};


// ==========================================
// EXPORT
// ==========================================

module.exports = {
    register,
    login,
    refresh,
    logout,
    requestPasswordReset,
    confirmPasswordReset,
    sendAgencyKeys,
};
