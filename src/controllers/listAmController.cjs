const { fetchListAmListing } = require("../services/listAmService.cjs");

const fetchListing = async (req, res) => {
    try {
        const listing = await fetchListAmListing(req.body?.url);

        return res.status(200).json({
            success: true,
            listing,
        });
    } catch (error) {
        console.error("List.am fetch error:", error.message);

        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "List.am-ից տվյալները չհաջողվեց ստանալ",
        });
    }
};

module.exports = { fetchListing };
