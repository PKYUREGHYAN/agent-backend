
const {
    verifyAccessToken,
} = require("../utils/jwt.cjs");

const {
    isAccessTokenRevoked,
} = require("../services/accessTokenService.cjs");

// ==========================================
// AUTH MIDDLEWARE
// ==========================================

const authMiddleware = (req, res, next) => {

    // ------------------------------------------
    // GET AUTHORIZATION HEADER
    // ------------------------------------------

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            success: false,
            message: "Access Token-ը պարտադիր է",
        });
    }

    // ------------------------------------------
    // CHECK BEARER FORMAT
    // ------------------------------------------

    const parts = authHeader.split(" ");

    if (
        parts.length !== 2 ||
        parts[0] !== "Bearer" ||
        !parts[1]
    ) {
        return res.status(401).json({
            success: false,
            message: "Authorization header-ի ձևաչափը սխալ է",
        });
    }

    const token = parts[1];

    // ------------------------------------------
    // VERIFY ACCESS TOKEN
    // ------------------------------------------

    try {
        const decoded = verifyAccessToken(token);

        // ------------------------------------------
        // CHECK TOKEN REVOCATION
        // ------------------------------------------

        if (isAccessTokenRevoked(token)) {
            return res.status(401).json({
                success: false,
                message:
                    "Access Token-ը չեղարկված է։ Խնդրում ենք կրկին մուտք գործել։",
            });
        }

        // ------------------------------------------
        // SAVE USER DATA IN REQUEST
        // ------------------------------------------

        req.user = decoded;

        // ------------------------------------------
        // CONTINUE
        // ------------------------------------------

        return next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message:
                "Access Token-ը վավեր չէ կամ ժամկետը լրացել է",
        });
    }
};

// ==========================================
// EXPORT
// ==========================================

module.exports = authMiddleware;