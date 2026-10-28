const express = require("express");
const multer = require("multer");
const authMiddleware = require("../middleware/authMiddleware.cjs");
const {
    status,
    link,
    sendListing,
} = require("../controllers/telegramController.cjs");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 8 * 1024 * 1024,
        files: 10,
    },
});

const router = express.Router();

router.get("/status", authMiddleware, status);
router.post("/link", authMiddleware, link);
router.post("/send", authMiddleware, upload.array("photos", 10), sendListing);

module.exports = router;
