const express = require("express");

const router = express.Router();

const AI_BASE_URL = process.env.PYTHON_AI_URL || "http://127.0.0.1:8000";

// CPU hosts may need several minutes for DINO/SAM2 + LaMa.
const AI_TIMEOUT_MS = Number(process.env.PYTHON_AI_TIMEOUT_MS || 600000);

async function forwardToPython(req, res) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    try {
        const options = {
            method: req.method,
            headers: {
                Accept: "application/json",
            },
            signal: controller.signal,
        };

        if (req.method !== "GET" && req.method !== "HEAD") {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(req.body ?? {});
        }

        const upstream = await fetch(
            `${AI_BASE_URL}/api/ai${req.path}`,
            options
        );

        const contentType = upstream.headers.get("content-type");

        res.status(upstream.status);

        if (contentType) {
            res.set("Content-Type", contentType);
        }

        const body = await upstream.text();
        return res.send(body);
    } catch (error) {
        console.error("Python AI proxy error:", error.message);

        if (error.name === "AbortError") {
            return res.status(504).json({
                success: false,
                message: "AI մշակումը չափազանց երկար տևեց։ Փորձեք կրկին։",
            });
        }

        return res.status(502).json({
            success: false,
            message: "Python AI ծառայությունն այս պահին հասանելի չէ։",
        });
    } finally {
        clearTimeout(timeout);
    }
}

router.get("/capabilities", forwardToPython);
router.post("/understand-command", forwardToPython);
router.post("/plan-custom-removal", forwardToPython);
router.post("/detect-objects", forwardToPython);
router.post("/process-image", forwardToPython);

module.exports = router;
