const { verifyAccessToken } = require("../utils/jwt.cjs");
const { isAppLocked, isSuperAdminUser, findUserById } = require("../services/appLock.cjs");

function userFromRequest(req) {
    const header = String(req.headers.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
        return null;
    }

    try {
        const decoded = verifyAccessToken(token);
        return findUserById(decoded.userId);
    } catch {
        return null;
    }
}

function lockMiddleware(req, res, next) {
    if (!isAppLocked()) {
        return next();
    }

    const user = userFromRequest(req);
    if (isSuperAdminUser(user)) {
        return next();
    }

    return res.status(423).json({
        success: false,
        locked: true,
        message: "Ծրագիրը արգելափակված է Super Admin-ի կողմից",
    });
}

module.exports = lockMiddleware;
