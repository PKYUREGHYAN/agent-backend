const db = require("../../database/database.cjs");
const { isEnvAdminEmail } = require("../utils/envEmails.cjs");

const shareAdminMiddleware = (req, res, next) => {
    const user = db
        .prepare("SELECT id, role, email FROM users WHERE id = ?")
        .get(req.user?.userId);

    if (!user || !isEnvAdminEmail(user.email)) {
        return res.status(403).json({
            success: false,
            message: "Հղումների մենյուն միայն .env-ում գրանցված Gmail-ների համար է",
        });
    }

    req.shareAdmin = user;
    return next();
};

module.exports = shareAdminMiddleware;
