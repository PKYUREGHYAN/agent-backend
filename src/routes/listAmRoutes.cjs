const express = require("express");
const { fetchListing } = require("../controllers/listAmController.cjs");

const router = express.Router();

router.post("/fetch", fetchListing);

module.exports = router;
