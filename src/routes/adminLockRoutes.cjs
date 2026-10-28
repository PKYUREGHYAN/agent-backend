const express = require("express");
const authMiddleware = require("../middleware/authMiddleware.cjs");
const superAdminMiddleware = require("../middleware/superAdminMiddleware.cjs");
const { isAppLocked, setAppLocked } = require("../services/appLock.cjs");

const router = express.Router();

router.get("/lock", authMiddleware, superAdminMiddleware, (req, res) => {
    res.json({ success: true, locked: isAppLocked() });
});

router.put("/lock", authMiddleware, superAdminMiddleware, (req, res) => {
    const locked = setAppLocked(Boolean(req.body?.locked));
    res.json({
        success: true,
        locked,
        message: locked ? "Ծրագիրը արգելափակված է" : "Ծրագիրը բաց է",
    });
});

module.exports = router;
