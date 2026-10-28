const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "../..");
const CLEAN_DIR = path.join(ROOT, "data", "cleaned");
const STRIP_SCRIPT = path.join(__dirname, "../tools/strip_listam_watermark.py");

function extractItemId(url) {
    const match = String(url || "").match(
        /list\.am\/(?:[a-z]{2}\/)?item\/(\d+)/i
    );
    return match ? match[1] : null;
}

function decodeHtml(value) {
    return String(value || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

function isHouseListing(html, title) {
    const text = `${title}\n${html.slice(0, 25000)}`;
    const houseHint =
        /\/category\/(54|56|57|58|59|60|61|62|63|64|199|200|201|202|222)\b/i.test(html) ||
        /բնակարան|առանձնատուն|հողամաս|կոմերցիոն|օֆիս|անշարժ գույք|квартир|дом|apartment|house|land|commercial|օրավարձ/i.test(
            text
        );

    const notHouse =
        /\/category\/(11|16|23|1472|4|22|29)\b/i.test(html) &&
        !/\/category\/54\b/i.test(html) &&
        !/բնակարան|առանձնատուն|հողամաս|անշարժ/i.test(title);

    return houseHint && !notHouse;
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function parsePhotos(html) {
    const urls = html.match(/\/\/img\.list\.am\/[fg]\/[^"'>\s]+/g) || [];
    const seen = new Set();
    const photos = [];

    for (const raw of urls) {
        const withProtocol = (raw.startsWith("//") ? `https:${raw}` : raw)
            .replace(/\/t\//, "/f/")
            .replace(/\.webp($|\?)/i, ".jpg$1");
        const key = withProtocol.replace(/\.(jpg|jpeg|png|webp)(\?.*)?$/i, "");
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        photos.push({
            id: photos.length + 1,
            src: withProtocol,
            title: `Նկար ${photos.length + 1}`,
        });
    }

    return photos;
}

function parsePrice(html) {
    const content = html.match(/itemprop="price"[^>]*content="(\d+)"/i);
    const visible = html.match(/class="price[^"]*"[^>]*>\s*([\d\s,]+)\s*֏/i);
    const usd = html.match(/\$[\d\s,]+/);
    const dramText = visible?.[1]
        ? `${visible[1].replace(/\s/g, "")} ֏`
        : content?.[1]
            ? `${Number(content[1]).toLocaleString("hy-AM")} ֏`
            : "";

    if (dramText && usd) {
        return `${usd[0].replace(/\s/g, "")} (${dramText})`;
    }

    return dramText || (usd ? usd[0].replace(/\s/g, "") : "");
}

function parseAddress(html, title) {
    const loc = html.match(/id="poi-map-anchor"[^>]*>([^<]+)</i)
        || html.match(/class="loc"[^>]*>[\s\S]*?>([^<]{8,80})</i);

    if (loc) {
        return decodeHtml(loc[1]);
    }

    return decodeHtml(title.split(",")[0] || "");
}

function parseAttrs(html) {
    const attrs = {};
    const rowRe = /attr-value[^>]*>([^<]+)<\/p>\s*<p[^>]*>([^<]+)<\/p>/gi;
    let match = rowRe.exec(html);
    while (match) {
        attrs[decodeHtml(match[2])] = decodeHtml(match[1]);
        match = rowRe.exec(html);
    }
    return attrs;
}

function mapAttrs(attrs) {
    const get = (...keys) => keys.map((key) => attrs[key]).find(Boolean) || "";
    return {
        area: get("Ընդհանուր մակերես", "Մակերես"),
        kitchenArea: get("Խոհանոցի մակերես"),
        floor: get("Հարկ"),
        floorsCount: get("Հարկերի քանակ"),
        ceiling: get("Առաստաղի բարձրություն"),
        rooms: get("Սենյակների քանակ"),
        bathroom: get("Սանհանգույցների քանակ", "Սանհանգույց"),
        buildingType: get("Շենքի տիպ"),
        furniture: get("Կահույք"),
        condition: get("Վիճակ"),
        balcony: get("Պատշգամբ"),
        parking: get("Ավտոկայանատեղի"),
    };
}

function parseDescription(html) {
    const block = html.match(/itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
    if (block) {
        return decodeHtml(block[1]);
    }

    const meta = html.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
    );
    return meta ? decodeHtml(meta[1]) : "";
}

function parseTitle(html) {
    const heading = html.match(/<h1[^>]*itemprop="name"[^>]*>([^<]+)<\/h1>/i)
        || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (heading) {
        return decodeHtml(heading[1]);
    }

    const raw = html.match(/<title>([^<]+)<\/title>/i);
    return decodeHtml(
        String(raw?.[1] || "")
            .replace(/\s*-\s*List\.am\s*$/i, "")
            .replace(/\s*-\s*Бизнес.*$/i, "")
    );
}

async function fetchHtml(url) {
    const readerUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(readerUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 Agent1",
            "X-Return-Format": "html",
            Accept: "text/html",
        },
    });

    if (!response.ok) {
        throw new Error("List.am հայտարարությունը չհաջողվեց բացել");
    }

    return response.text();
}

function findPython() {
    const candidates = [
        path.join(ROOT, "iopaint", ".venv", "Scripts", "python.exe"),
        path.join(ROOT, "python_ai", ".venv", "Scripts", "python.exe"),
        "python",
        "py",
    ];

    return candidates.find((candidate) => {
        if (candidate.endsWith(".exe")) {
            return fs.existsSync(candidate);
        }
        const probe = spawnSync(candidate, ["-c", "from PIL import Image"], {
            windowsHide: true,
        });
        return probe.status === 0;
    }) || null;
}

async function fetchPhotoBuffer(src) {
    const response = await fetch(src, {
        headers: {
            "User-Agent": "Mozilla/5.0 Agent1",
            Referer: "https://www.list.am/",
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
    });

    if (!response.ok) {
        throw new Error(`photo ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

async function cleanPhotos(itemId, photos) {
    const python = findPython();
    const outDir = path.join(CLEAN_DIR, String(itemId));
    fs.mkdirSync(outDir, { recursive: true });

    const cleaned = [];

    for (const photo of photos) {
        try {
            const buffer = await fetchPhotoBuffer(photo.src);
            const rawPath = path.join(outDir, `raw-${photo.id}.jpg`);
            const cleanPath = path.join(outDir, `${photo.id}.jpg`);
            fs.writeFileSync(rawPath, buffer);

            if (python) {
                const result = spawnSync(python, [STRIP_SCRIPT, rawPath, cleanPath], {
                    windowsHide: true,
                    timeout: 20000,
                });
                if (result.status !== 0 || !fs.existsSync(cleanPath)) {
                    fs.copyFileSync(rawPath, cleanPath);
                }
            } else {
                fs.copyFileSync(rawPath, cleanPath);
            }

            try {
                fs.unlinkSync(rawPath);
            } catch {
                // keep raw if locked
            }

            cleaned.push({
                ...photo,
                src: `/cleaned-photos/${itemId}/${photo.id}.jpg`,
                cleaned: Boolean(python),
            });
        } catch {
            cleaned.push(photo);
        }
    }

    return cleaned;
}

async function fetchListAmListing(rawUrl) {
    const itemId = extractItemId(rawUrl);

    if (!itemId) {
        const error = new Error("Միայն list.am-ի տան հղում");
        error.status = 400;
        throw error;
    }

    const pageUrl = `https://www.list.am/item/${itemId}`;
    const html = await fetchHtml(pageUrl);
    const title = parseTitle(html);

    if (!isHouseListing(html, title)) {
        const error = new Error("Այս հղումը տան հայտարարություն չէ");
        error.status = 400;
        throw error;
    }

    const photos = parsePhotos(html);

    if (!photos.length) {
        const error = new Error("Նկարները չհաջողվեց ստանալ այս հայտարարությունից");
        error.status = 422;
        throw error;
    }

    const attrs = parseAttrs(html);
    const mapped = mapAttrs(attrs);
    const cleanedPhotos = await cleanPhotos(itemId, photos);

    return {
        id: itemId,
        source: "list.am",
        sourceUrl: pageUrl,
        title: title || `List.am #${itemId}`,
        price: parsePrice(html),
        address: parseAddress(html, title),
        description: parseDescription(html),
        attrs,
        ...mapped,
        photos: cleanedPhotos,
        savedAt: new Date().toISOString(),
    };
}

module.exports = {
    extractItemId,
    fetchListAmListing,
    CLEAN_DIR,
};
