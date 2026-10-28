const path = require("path");
const Database = require("better-sqlite3");

// ==========================================
// SQLite database-ի ֆայլի ճանապարհը
// ==========================================

const dbPath = path.join(__dirname, "agent_1.sqlite");

// ==========================================
// Միացում SQLite database-ին
// ==========================================

const db = new Database(dbPath);

// ==========================================
// SQLite-ի անվտանգ կարգավորումներ
// ==========================================

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

const roleColumn = db.prepare("PRAGMA table_info(users)").all()
    .some((column) => column.name === "role");

if (!roleColumn) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
}

try {
    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS users_username_nocase
        ON users(username COLLATE NOCASE)
    `);
} catch (error) {
    console.error(
        "Username UNIQUE index-ը չստեղծվեց. հնարավոր է կրկնվող username կա։",
        error.message
    );
}

const userColumns = db.prepare("PRAGMA table_info(users)").all()
    .map((column) => column.name);

if (!userColumns.includes("telegram_id")) {
    db.exec("ALTER TABLE users ADD COLUMN telegram_id TEXT");
}

if (!userColumns.includes("telegram_username")) {
    db.exec("ALTER TABLE users ADD COLUMN telegram_username TEXT");
}

db.exec(`
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_reset_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    listing_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    telegram_message_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agency_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    first_id TEXT NOT NULL UNIQUE,
    second_id TEXT NOT NULL UNIQUE,
    remaining_listings INTEGER NOT NULL DEFAULT 0,
    active_package_id TEXT,
    active_package_name TEXT,
    paid_amount_amd INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agency_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    agent_email TEXT,
    payload_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS share_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    title TEXT,
    house_id TEXT,
    payload_json TEXT NOT NULL,
    agent_email TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

const shareColumns = db.prepare("PRAGMA table_info(share_links)").all()
    .map((column) => column.name);

if (!shareColumns.includes("house_id")) {
    db.exec("ALTER TABLE share_links ADD COLUMN house_id TEXT");
}

const agencyColumns = db.prepare("PRAGMA table_info(agency_agents)").all()
    .map((column) => column.name);

if (!agencyColumns.includes("telegram_id")) {
    db.exec("ALTER TABLE agency_agents ADD COLUMN telegram_id TEXT");
}

if (!agencyColumns.includes("telegram_username")) {
    db.exec("ALTER TABLE agency_agents ADD COLUMN telegram_username TEXT");
}

db.exec(`
CREATE TABLE IF NOT EXISTS agency_bot_jobs (
    id TEXT PRIMARY KEY,
    telegram_id TEXT NOT NULL,
    agent_id INTEGER,
    listing_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// ==========================================
// Export
// ==========================================

module.exports = db;