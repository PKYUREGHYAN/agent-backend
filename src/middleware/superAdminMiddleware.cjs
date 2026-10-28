const { isSuperAdminUser, findUserById } = require("../services/appLock.cjs");

function superAdminMiddleware(req, res, next) {
    const user = findUserById(req.user?.userId);

    if (!isSuperAdminUser(user)) {
        return res.status(403).json({
            success: false,
            message: "Միայն Super Admin-ը կարող է այս գործողությունը անել",
        });
    }

    req.superAdmin = user;
    return next();
}

module.exports = superAdminMiddleware;
