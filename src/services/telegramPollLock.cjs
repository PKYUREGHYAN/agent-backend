const fs = require("fs");
const os = require("os");
const path = require("path");

function lockFile(botKey) {
    return path.join(os.tmpdir(), `agent1-telegram-${botKey}.lock`);
}

function pidAlive(pid) {
    if (!pid) {
        return false;
    }

    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function acquireTelegramPollLock(botKey) {
    const file = lockFile(botKey);

    if (fs.existsSync(file)) {
        const pid = Number(String(fs.readFileSync(file, "utf8")).trim());
        if (pid && pid !== process.pid && pidAlive(pid)) {
            console.log(`Telegram poll skip ${botKey}: already running pid ${pid}`);
            return false;
        }
    }

    fs.writeFileSync(file, String(process.pid));

    const release = () => {
        try {
            if (!fs.existsSync(file)) {
                return;
            }
            if (String(fs.readFileSync(file, "utf8")).trim() === String(process.pid)) {
                fs.unlinkSync(file);
            }
        } catch {
            // ignore
        }
    };

    process.once("exit", release);
    return true;
}

module.exports = {
    acquireTelegramPollLock,
};
