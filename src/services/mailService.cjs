require("dotenv").config();
const nodemailer = require("nodemailer");

function getMailTransport() {
    const user = String(process.env.SMTP_USER || process.env.SUPER_ADMIN_EMAIL || "").trim();
    const pass = String(process.env.SMTP_PASS || "").trim();
    const host = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
    const port = Number(process.env.SMTP_PORT || 587);

    if (!user || !pass) {
        throw new Error("SMTP-ն կարգավորված չէ");
    }

    // DigitalOcean often blocks outbound 587/465 — keep timeouts short so UI does not hang.
    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 5000),
        greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 5000),
        socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 10000),
        tls: {
            servername: host,
        },
    });
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
    const from = String(process.env.SMTP_USER || process.env.SUPER_ADMIN_EMAIL || "").trim();
    const transport = getMailTransport();

    await transport.sendMail({
        from: `Agent 1 <${from}>`,
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
    const from = String(process.env.SMTP_USER || process.env.SUPER_ADMIN_EMAIL || "").trim();
    const transport = getMailTransport();

    await transport.sendMail({
        from: `Agent 1 Houses <${from}>`,
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
