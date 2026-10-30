const express = require("express");
const authMiddleware = require("../middleware/authMiddleware.cjs");
const adminMiddleware = require("../middleware/adminMiddleware.cjs");
const shareAdminMiddleware = require("../middleware/shareAdminMiddleware.cjs");
const {
    requestAgencyKeys,
    loginAgency,
    consumeAgency,
    meAgency,
    readAgencyCatalog,
    saveAgencyDiscount,
    saveAgencyPrices,
    listAgencyAgents,
    addAgencyAgent,
    deleteAgencyAgent,
    activateAgencyPackage,
    cancelAgencyPackage,
    saveAgencyListing,
    readAgencyListing,
    createShare,
    readShare,
    adminShareList,
    adminShareRenew,
    adminReadShare,
} = require("../controllers/agencyController.cjs");

const router = express.Router();

router.post("/keys/request", requestAgencyKeys);
router.post("/login", loginAgency);
router.post("/consume", consumeAgency);
router.get("/me", meAgency);
router.get("/catalog", readAgencyCatalog);
router.put("/discount", authMiddleware, adminMiddleware, saveAgencyDiscount);
router.put("/prices", authMiddleware, adminMiddleware, saveAgencyPrices);
router.post("/listings", saveAgencyListing);
router.get("/listings/:itemId", readAgencyListing);
router.post("/share", createShare);
router.get("/share/:token", readShare);

router.get("/agents", authMiddleware, adminMiddleware, listAgencyAgents);
router.post("/agents", authMiddleware, adminMiddleware, addAgencyAgent);
router.post("/agents/delete", authMiddleware, adminMiddleware, deleteAgencyAgent);
router.post("/agents/activate", authMiddleware, adminMiddleware, activateAgencyPackage);
router.post("/agents/cancel", authMiddleware, adminMiddleware, cancelAgencyPackage);
router.get("/share-admin", authMiddleware, shareAdminMiddleware, adminShareList);
router.get("/share-admin/by-token/:token", authMiddleware, shareAdminMiddleware, adminReadShare);
router.post("/share-admin/:id/renew", authMiddleware, shareAdminMiddleware, adminShareRenew);

module.exports = router;
