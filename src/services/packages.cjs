const { getSetting, setSetting } = require("./appSettings.cjs");

const PACKAGES = [
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

function getDiscountPercent() {
    const parsed = Number(getSetting("agency_discount_percent") || 0);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return Math.max(0, Math.min(90, Math.round(parsed)));
}

function setDiscountPercent(value) {
    const percent = Math.max(0, Math.min(90, Math.round(Number(value) || 0)));
    setSetting("agency_discount_percent", String(percent));
    return percent;
}

function getCatalog() {
    const discountPercent = getDiscountPercent();
    return {
        discountPercent,
        packages: PACKAGES.map((pkg) => ({
            ...pkg,
            finalPriceAMD: discountPercent > 0
                ? Math.round(pkg.priceAMD * (1 - discountPercent / 100))
                : pkg.priceAMD,
        })),
    };
}

function findPackage(id) {
    return PACKAGES.find((pkg) => pkg.id === id) || null;
}

module.exports = {
    PACKAGES,
    getDiscountPercent,
    setDiscountPercent,
    getCatalog,
    findPackage,
};
