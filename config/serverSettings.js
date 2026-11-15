const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'server_settings.json');

const DEFAULT_SETTINGS = {
    theme: 'noel' // 'noel' | 'default'
};

let cachedSettings = null;

function loadSettings() {
    if (cachedSettings) return cachedSettings;
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
            cachedSettings = Object.assign({}, DEFAULT_SETTINGS, raw || {});
        } else {
            cachedSettings = Object.assign({}, DEFAULT_SETTINGS);
        }
    } catch (e) {
        console.error('[-] Failed to load server_settings.json:', e.message);
        cachedSettings = Object.assign({}, DEFAULT_SETTINGS);
    }
    return cachedSettings;
}

function saveSettings() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(loadSettings(), null, 2), 'utf-8');
    } catch (e) {
        console.error('[-] Failed to save server_settings.json:', e.message);
    }
}

function getServerSettings() {
    return loadSettings();
}

function setServerTheme(theme) {
    const normalized = (String(theme || '').toLowerCase() === 'default') ? 'default' : 'noel';
    const settings = loadSettings();
    settings.theme = normalized;
    saveSettings();
    return settings;
}

module.exports = {
    getServerSettings,
    setServerTheme
};
