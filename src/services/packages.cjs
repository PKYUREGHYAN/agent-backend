const { getSetting, setSetting } = require("./appSettings.cjs");

const CATALOG_SETTING_KEY = "agency_package_catalog";
const DISCOUNT_SETTING_KEY = "agency_discount_percent";
const LEGACY_PRICE_SETTING_KEY = "agency_package_prices";

/** Seed once into SQLite; after that catalog lives only in DB. */
const DEFAULT_PACKAGES = [
    {
        id: "pkg_1",
        listingsCount: 1,
        priceAMD: 99,
        name: "1 հայտարարություն",
        nameRu: "1 объявление",
        priceDisplay: "99 դրամ",
        unitPrice: "99 ֏ / հատ",
        perItemRu: "99 ֏ за объявление",
        badgeClass: "badge-pkg-1",
        activeBtnClass: "active-1",
        popular: false,
        badgeRu: "1 объект",
        featuresRu: [
            "1 полное объявление",
            "Чистые фото в оригинальном качестве",
            "Скачивание в ZIP архиве",
            "Карточка для клиента",
        ],
    },
    {
        id: "pkg_10",
        listingsCount: 10,
        priceAMD: 750,
        name: "10 հայտարարություն",
        nameRu: "10 объявлений",
        priceDisplay: "750 դրամ",
        unitPrice: "75 ֏ / հատ (-24%)",
        perItemRu: "75 ֏ за объявление (-24%)",
        badgeClass: "badge-pkg-10",
        activeBtnClass: "active-10",
        popular: true,
        badgeRu: "ХИТ ПРОДАЖ",
        featuresRu: [
            "10 полных объявлений",
            "Приоритетная скорость ИИ",
            "Чистые фото в максимальном качестве",
            "Скачивание всех фото в 1 клик",
            "Отправка клиенту",
        ],
    },
    {
        id: "pkg_50",
        listingsCount: 50,
        priceAMD: 4200,
        name: "50 հայտարարություն",
        nameRu: "50 объявлений",
        priceDisplay: "4,200 դրամ",
        unitPrice: "84 ֏ / հատ (Մեծ փաթեթ)",
        perItemRu: "84 ֏ за объявление (Pro)",
        badgeClass: "badge-pkg-50",
        activeBtnClass: "active-50",
        popular: false,
        badgeRu: "Pro пакет",
        featuresRu: [
            "50 полных объявлений",
            "Высокая пропускная способность",
            "Все доступные форматы выгрузки",
            "Неограниченно фото в объекте",
        ],
    },
];

function formatPriceDisplay(priceAMD) {
    return `${Number(priceAMD).toLocaleString("hy-AM")} դրամ`;
}

function normalizePackage(pkg) {
    const listingsCount = Math.max(1, Number(pkg.listingsCount) || 1);
    const priceAMD = Math.max(0, Math.round(Number(pkg.priceAMD) || 0));
    const perItem = Math.round(priceAMD / listingsCount);

    return {
        ...pkg,
        listingsCount,
        priceAMD,
        priceDisplay: formatPriceDisplay(priceAMD),
        unitPrice: `${perItem} ֏ / հատ`,
        perItemRu: `${perItem} ֏ за объявление`,
    };
}

function getLegacyPriceOverrides() {
    try {
        const raw = getSetting(LEGACY_PRICE_SETTING_KEY);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function seedCatalogIntoDb() {
    const legacy = getLegacyPriceOverrides();
    const seeded = DEFAULT_PACKAGES.map((pkg) => {
        const override = Number(legacy[pkg.id]);
        const withPrice = Number.isFinite(override) && override >= 0
            ? { ...pkg, priceAMD: Math.round(override) }
            : pkg;
        return normalizePackage(withPrice);
    });

    setSetting(CATALOG_SETTING_KEY, JSON.stringify(seeded));
    return seeded;
}

function readCatalogRows() {
    const raw = getSetting(CATALOG_SETTING_KEY);
    if (!raw) {
        return seedCatalogIntoDb();
    }

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || !parsed.length) {
            return seedCatalogIntoDb();
        }
        return parsed.map(normalizePackage);
    } catch {
        return seedCatalogIntoDb();
    }
}

function writeCatalogRows(rows) {
    const normalized = rows.map(normalizePackage);
    setSetting(CATALOG_SETTING_KEY, JSON.stringify(normalized));
    return normalized;
}

function getDiscountPercent() {
    const parsed = Number(getSetting(DISCOUNT_SETTING_KEY) || 0);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return Math.max(0, Math.min(90, Math.round(parsed)));
}

function setDiscountPercent(value) {
    const percent = Math.max(0, Math.min(90, Math.round(Number(value) || 0)));
    setSetting(DISCOUNT_SETTING_KEY, String(percent));
    return percent;
}

function setPackagePrices(prices) {
    const next = readCatalogRows().map((pkg) => {
        const raw = prices?.[pkg.id];
        if (raw == null || raw === "") {
            return pkg;
        }
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) {
            return pkg;
        }
        return normalizePackage({ ...pkg, priceAMD: Math.round(value) });
    });

    writeCatalogRows(next);
    // Keep legacy key in sync for older readers / migrations
    const legacyMap = Object.fromEntries(next.map((pkg) => [pkg.id, pkg.priceAMD]));
    setSetting(LEGACY_PRICE_SETTING_KEY, JSON.stringify(legacyMap));
    return getCatalog();
}

function getCatalog() {
    const discountPercent = getDiscountPercent();
    const packages = readCatalogRows();

    return {
        discountPercent,
        packages: packages.map((pkg) => ({
            ...pkg,
            finalPriceAMD: discountPercent > 0
                ? Math.round(pkg.priceAMD * (1 - discountPercent / 100))
                : pkg.priceAMD,
        })),
    };
}

function findPackage(id) {
    return readCatalogRows().find((item) => item.id === id) || null;
}

module.exports = {
    PACKAGES: DEFAULT_PACKAGES,
    getDiscountPercent,
    setDiscountPercent,
    setPackagePrices,
    getCatalog,
    findPackage,
};
