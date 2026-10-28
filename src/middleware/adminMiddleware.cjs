const db = require("../../database/database.cjs");

const adminMiddleware = (req, res, next) => {
    const user = db
        .prepare("SELECT id, role FROM users WHERE id = ?")
        .get(req.user?.userId);

    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
        return res.status(403).json({
            success: false,
            message: "Միայն ադմինը կարող է այս գործողությունը անել",
        });
    }

    req.adminUser = user;
    return next();
};

module.exports = adminMiddleware;
