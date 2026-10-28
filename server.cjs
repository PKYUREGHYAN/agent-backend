require("dotenv").config();

const app = require("./src/app.cjs");
const { startTelegramBot } = require("./src/services/telegramBot.cjs");
const { startAgencyTelegramBot } = require("./src/services/agencyTelegramBot.cjs");
const { warmupChannelId } = require("./src/controllers/telegramController.cjs");

const PORT = Number(process.env.PORT || 5000);

app.listen(PORT, "0.0.0.0", () => {
    const { lanWebOrigin } = require("./src/utils/lanAddress.cjs");
    console.log(`Agent_1 server is running on http://0.0.0.0:${PORT}`);
    console.log(`Համակարգիչ՝ http://127.0.0.1:5173`);
    console.log(`Հեռախոս նույն Wi-Fi-ով՝ ${lanWebOrigin(5173)}`);
    startTelegramBot();
    startAgencyTelegramBot();
    warmupChannelId();
});
