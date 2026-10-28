const express = require("express");

const {
    register,
    login,
    refresh,
    logout,
    requestPasswordReset,
    confirmPasswordReset,
    sendAgencyKeys,
} = require("../controllers/authController.cjs");

const db = require("../../database/database.cjs");
const registerValidation = require("../middleware/registerValidation.cjs");
const checkUserExists = require("../middleware/checkUserExists.cjs");
const loginValidation = require("../middleware/loginValidation.cjs");
const authMiddleware = require("../middleware/authMiddleware.cjs");

const router = express.Router();


// ==========================================
// REGISTER
// ==========================================

router.post(
    "/register",
    registerValidation,
    checkUserExists,
    register
);


// ==========================================
// LOGIN
// ==========================================

router.post(
    "/login",
    loginValidation,
    login
);


// ==========================================
// REFRESH TOKEN
// ==========================================

router.post(
    "/refresh",
    refresh
);


// ==========================================
// LOGOUT
// ==========================================

router.post(
    "/logout",
    logout
);


router.post(
    "/forgot-password/request",
    requestPasswordReset
);

router.post(
    "/forgot-password/confirm",
    confirmPasswordReset
);

router.post(
    "/agency-keys/send",
    sendAgencyKeys
);


// ==========================================
// PROTECTED TEST ROUTE
// ==========================================

router.get(
    "/me",
    authMiddleware,
    (req, res) => {
        const { findUserById } = require("../services/appLock.cjs");
        const dbUser = findUserById(req.user?.userId);

        return res.status(200).json({
            success: true,
            message: "Access Token-ը վավեր է",
            user: dbUser
                ? {
                    id: dbUser.id,
                    username: dbUser.username,
                    email: dbUser.email,
                    role: dbUser.role,
                }
                : req.user,
        });
    }
);


// ==========================================
// EXPORT
// ==========================================

module.exports = router;