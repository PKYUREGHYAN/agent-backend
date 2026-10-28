const {
    listAgents,
    createAgent,
    requestKeys,
    loginWithFirstId,
    consumeSearch,
    activatePackage,
    cancelPackage,
    saveListing,
    createShareLink,
    getShareByToken,
    listShareLinks,
    renewShareLink,
} = require("../services/agencyService.cjs");
const { webShareUrl, appShareUrl } = require("../utils/lanAddress.cjs");
const { maskEmail } = require("../services/mailService.cjs");
const { getCatalog, setDiscountPercent, findPackage } = require("../services/packages.cjs");

function withShareUrls(share) {
    if (!share?.token) {
        return share;
    }

    return {
        ...share,
        url: webShareUrl(share.token),
        appUrl: share.appUrl || appShareUrl(share.token),
    };
}

const isGmailAddress = (email) => /^[^\s@]+@gmail\.com$/i.test(String(email || "").trim());

const requestAgencyKeys = async (req, res) => {
    try {
        const email = String(req.body?.email || "").trim().toLowerCase();
        if (!isGmailAddress(email)) {
            return res.status(400).json({
                success: false,
                message: "Գրեք ձեր անձնական Gmail հասցեն",
            });
        }

        await requestKeys(email);
        return res.status(200).json({
            success: true,
            message: `Կոդերը ուղարկվեցին ${maskEmail(email)} հասցեին։ Բացեք Gmail-ը և 1-ին կոդը գրեք այստեղ։`,
        });
    } catch (error) {
        console.error("Agency keys error:", error);
        return res.status(500).json({
            success: false,
            message: error.message === "SMTP-ն կարգավորված չէ"
                ? "Gmail-ով նամակ ուղարկելը դեռ կարգավորված չէ"
                : "Կոդը չհաջողվեց ուղարկել Gmail",
        });
    }
};

const loginAgency = (req, res) => {
    const agent = loginWithFirstId(req.body?.firstId);
    if (!agent) {
        return res.status(400).json({
            success: false,
            message: "1-ին ID-ն չի գտնվել։ Կոդը խնդրեք Gmail-ով։",
        });
    }

    return res.status(200).json({ success: true, agent });
};

const consumeAgency = (req, res) => {
    const result = consumeSearch(req.body?.firstId);
    if (!result.ok) {
        return res.status(400).json({
            success: false,
            remaining: 0,
            empty: true,
            message: "Փաթեթը սպառվել է",
        });
    }

    return res.status(200).json({ success: true, ...result });
};

const meAgency = (req, res) => {
    const agent = loginWithFirstId(req.query?.firstId);
    if (!agent) {
        return res.status(404).json({ success: false, message: "Գործակալը չի գտնվել" });
    }
    return res.status(200).json({ success: true, agent });
};

const listAgencyAgents = (req, res) => {
    return res.status(200).json({ success: true, users: listAgents() });
};

const addAgencyAgent = (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!isGmailAddress(email)) {
        return res.status(400).json({ success: false, message: "Gmail է պետք" });
    }

    const agent = createAgent({
        name: req.body?.name,
        email,
        packageInfo: req.body?.packageInfo || null,
    });

    return res.status(200).json({ success: true, user: agent });
};

const readAgencyCatalog = (_req, res) => {
    return res.status(200).json({ success: true, ...getCatalog() });
};

const saveAgencyDiscount = (req, res) => {
    const percent = setDiscountPercent(req.body?.percent);
    return res.status(200).json({ success: true, ...getCatalog(), discountPercent: percent });
};

const activateAgencyPackage = (req, res) => {
    const packageInfo = req.body?.packageInfo || findPackage(req.body?.packageId);
    if (!packageInfo?.id || !packageInfo?.listingsCount) {
        return res.status(400).json({ success: false, message: "Փաթեթը չի գտնվել" });
    }

    const agent = activatePackage(req.body?.userId, packageInfo);
    if (!agent) {
        return res.status(404).json({ success: false, message: "Գործակալը չի գտնվել" });
    }

    return res.status(200).json({ success: true, user: agent });
};

const cancelAgencyPackage = (req, res) => {
    const agent = cancelPackage(req.body?.userId);
    return res.status(200).json({ success: true, user: agent });
};

const saveAgencyListing = (req, res) => {
    const listing = req.body?.listing;
    if (!listing) {
        return res.status(400).json({ success: false, message: "Տվյալ չկա" });
    }

    saveListing(listing.id, req.body?.email, listing);
    return res.status(200).json({ success: true });
};

const createShare = (req, res) => {
    const listing = req.body?.listing;
    if (!listing) {
        return res.status(400).json({ success: false, message: "Քարտի տվյալ չկա" });
    }

    const share = createShareLink({
        kind: req.body?.kind,
        listing,
        agentEmail: req.body?.email,
    });
    return res.status(200).json({
        success: true,
        share: withShareUrls(share),
    });
};

const readShare = (req, res) => {
    const share = getShareByToken(req.params.token);
    if (!share) {
        return res.status(404).json({ success: false, message: "Հղումը չի գտնվել" });
    }
    if (share.expired) {
        return res.status(410).json({
            success: false,
            expired: true,
            message: "Այս հղումը 3 օր հետո փակվել է",
        });
    }

    return res.status(200).json({ success: true, share });
};

const adminShareList = (req, res) => {
    return res.status(200).json({
        success: true,
        links: listShareLinks().map(withShareUrls),
    });
};

const adminShareRenew = (req, res) => {
    const share = renewShareLink(req.params.id);
    if (!share) {
        return res.status(404).json({ success: false, message: "Հղումը չի գտնվել" });
    }
    return res.status(200).json({
        success: true,
        share: withShareUrls(share),
    });
};

const adminReadShare = (req, res) => {
    const share = getShareByToken(req.params.token, { allowExpired: true });
    if (!share || !share.listing) {
        return res.status(404).json({ success: false, message: "Հղումը չի գտնվել" });
    }

    return res.status(200).json({ success: true, share: withShareUrls(share) });
};

module.exports = {
    requestAgencyKeys,
    loginAgency,
    consumeAgency,
    meAgency,
    readAgencyCatalog,
    saveAgencyDiscount,
    listAgencyAgents,
    addAgencyAgent,
    activateAgencyPackage,
    cancelAgencyPackage,
    saveAgencyListing,
    createShare,
    readShare,
    adminShareList,
    adminShareRenew,
    adminReadShare,
};
