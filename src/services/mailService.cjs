require("dotenv").config();
const nodemailer = require("nodemailer");

function mailAccount() {
    const user = String(process.env.SMTP_USER || process.env.SUPER_ADMIN_EMAIL || "").trim();
    const pass = String(process.env.SMTP_PASS || "").trim().replace(/^["']|["']$/g, "");
    const host = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();

    if (!user || !pass) {
        throw new Error("SMTP-ն կարգավորված չէ");
    }

    return { user, pass, host };
}

function smtpPorts() {
    const preferred = Number(process.env.SMTP_PORT || 587);
    return [...new Set([preferred, 587, 465].filter((port) => port > 0))];
}

async function sendMail(message) {
    const { user, pass, host } = mailAccount();
    let lastError;

    for (const port of smtpPorts()) {
        const transport = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass },
            connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 15000),
            greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 15000),
            socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20000),
            tls: {
                servername: host,
            },
        });

        try {
            await transport.sendMail({
                ...message,
                from: message.from || `Agent 1 <${user}>`,
            });
            return;
        } catch (error) {
            lastError = error;
            console.error(`SMTP ${host}:${port} failed:`, error.message);
        }
    }

    throw lastError || new Error("Gmail-ով նամակ ուղարկելը չհաջողվեց");
}

function maskEmail(email) {
    const value = String(email || "");
    const [name, domain] = value.split("@");

    if (!name || !domain) {
        return value;
    }

    const visible = name.slice(0, 1);
    return `${visible}***@${domain}`;
}

async function sendAgencyKeysEmail(to, { firstId, secondId }) {
    await sendMail({
        to,
        subject: "Agent 1 — ձեր մուտքի կոդերը",
        text:
            `Agent 1\n\n` +
            `1-ին կոդ (գրանցում / մուտք)՝ ${firstId}\n` +
            `2-րդ կոդ (ադմին, փաթեթ ակտիվացնել)՝ ${secondId}\n\n` +
            `1-ին կոդը գրեք կայքում՝ «ВВЕСТИ КЛЮЧ».\n` +
            `2-րդ կոդը պետք է ադմինին՝ փաթեթ ակտիվացնելու համար։\n\n` +
            `Եթե դուք չեք խնդրել, անտեսեք այս նամակը։`,
        html:
            `<p><b>Agent 1</b></p>` +
            `<p>1-ին կոդ (գրանցում / մուտք)՝ <b style="font-size:18px">${firstId}</b></p>` +
            `<p>2-րդ կոդ (ադմին, փաթեթ ակտիվացնել)՝ <b style="font-size:18px">${secondId}</b></p>` +
            `<p>1-ին կոդը գրեք կայքում՝ «ВВЕСТИ КЛЮЧ»։</p>` +
            `<p>2-րդ կոդը տվեք ադմինին՝ փաթեթ ակտիվացնելու համար։</p>` +
            `<p>Եթե դուք չեք խնդրել, անտեսեք այս նամակը։</p>`,
    });
}

async function sendResetCodeEmail(to, code) {
    const { user } = mailAccount();

    await sendMail({
        from: `Agent 1 Houses <${user}>`,
        to,
        subject: "Գաղտնաբառի փոփոխման կոդ",
        text:
            `Agent 1 Houses\n\n` +
            `Գաղտնաբառը փոխելու կոդը՝ ${code}\n\n` +
            `Եթե դուք չեք խնդրել, անտեսեք այս նամակը։ Կոդը գործում է 10 րոպե։`,
        html:
            `<p><b>Agent 1 Houses</b></p>` +
            `<p>Գաղտնաբառը փոխելու կոդը՝ <b style="font-size:20px">${code}</b></p>` +
            `<p>Եթե դուք չեք խնդրել, անտեսեք այս նամակը։ Կոդը գործում է 10 րոպե։</p>`,
    });
}

module.exports = {
    sendResetCodeEmail,
    sendAgencyKeysEmail,
    maskEmail,
};
