// Global SVRCMD proxy so SVRCMD.<Command> resolves to command string
if (typeof global !== 'undefined') {
    global.SVRCMD = new Proxy({}, { get: (t, p) => p });
}
if (typeof SVRCMD === 'undefined') {
    var SVRCMD = new Proxy({}, { get: (t, p) => p });
}

/**
 * Ninja Rebirth (Ninja Đại Chiến) Standalone Online Server (Node.js)
 * Supports multiple players, chat broadcast, persistence to disk, and all game commands.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8088;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'players.json');

// Read from Environment Variables (set in Render Dashboard)
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Global in-memory player database
let playerDb = {};
if (fs.existsSync(DATA_FILE)) {
    try {
        playerDb = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        console.log(`[+] Loaded ${Object.keys(playerDb).length} players from local cache ${DATA_FILE}`);
    } catch (e) {
        console.error('[-] Error reading players.json, starting fresh:', e.message);
    }
}

function saveLocalDb() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(playerDb, null, 2), 'utf-8');
    } catch (e) {
        console.error('[-] Error saving local database:', e.message);
    }
}

// Helper: HTTP request to Supabase PostgREST API
function supabaseRequest(apiPath, method, body, callback) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        if (callback) callback(new Error("Supabase credentials not configured in process.env"));
        return;
    }
    try {
        const urlObj = new URL(SUPABASE_URL + apiPath);
        const reqData = body ? JSON.stringify(body) : null;
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname + urlObj.search,
            method: method || 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            }
        };
        if (reqData) {
            options.headers['Content-Length'] = Buffer.byteLength(reqData);
        }
        const req = https.request(options, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                if (callback) {
                    try {
                        const json = resData ? JSON.parse(resData) : null;
                        callback(null, json, res.statusCode);
                    } catch (e) {
                        callback(null, resData, res.statusCode);
                    }
                }
            });
        });
        req.on('error', err => {
            console.error('[-] Supabase error:', err.message);
            if (callback) callback(err);
        });
        if (reqData) req.write(reqData);
        req.end();
    } catch (e) {
        console.error('[-] Supabase request exception:', e.message);
        if (callback) callback(e);
    }
}

// Load all players on startup from Supabase if configured
function loadDbFromSupabase() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.log('[*] SUPABASE_URL / SUPABASE_KEY not provided. Running in local storage mode.');
        return;
    }
    console.log('[*] Connecting to Supabase at ' + SUPABASE_URL + ' ...');
    supabaseRequest('/rest/v1/players?select=player_id,data', 'GET', null, (err, rows, status) => {
        if (!err && Array.isArray(rows)) {
            let count = 0;
            for (const row of rows) {
                if (row.player_id && row.data) {
                    playerDb[String(row.player_id)] = row.data;
                    count++;
                }
            }
            console.log(`[+] Successfully synchronized ${count} players from Supabase!`);
            saveLocalDb();
        } else {
            console.error('[-] Could not load from Supabase (status ' + status + '):', err ? err.message : rows);
        }
    });
}
loadDbFromSupabase();

const dirtyPlayers = new Set();
function markDirty(playerId) {
    if (playerId) dirtyPlayers.add(String(playerId));
}

function flushDirtyToSupabase() {
    if (!SUPABASE_URL || !SUPABASE_KEY || dirtyPlayers.size === 0) return;
    const batch = [];
    for (const pid of dirtyPlayers) {
        if (playerDb[pid]) {
            batch.push({
                player_id: String(pid),
                data: playerDb[pid],
                updated_at: new Date().toISOString()
            });
        }
    }
    dirtyPlayers.clear();
    if (batch.length === 0) return;

    supabaseRequest('/rest/v1/players', 'POST', batch, (err, res, status) => {
        if (!err && (status === 201 || status === 200 || status === 204)) {
            console.log(`[+] Synced ${batch.length} player save(s) to Supabase Cloud.`);
        } else {
            console.error(`[-] Failed to sync to Supabase (status ${status}):`, err ? err.message : res);
            for (const item of batch) dirtyPlayers.add(item.player_id);
        }
    });
}

function saveDb() {
    saveLocalDb();
    flushDirtyToSupabase();
}

// Periodic auto-save every 10 seconds
setInterval(saveDb, 10000);

// Active WebSocket connections
const connectedSockets = new Set();

var OfflineServer = {
    enabled: false,
    saveKey: "SHINOBI_OFFLINE_SAVE_V10",
    onlineEvents: [[{"id":260130782,"title":"","content":"Accumulated $30","types":1,"kind":1810,"conditions":"30","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10140,20-1,10210,20-1,10050,200-2,40204,1-2,40104,1-2,40304,1","create_time":0,"sort":1810,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260112838,"title":"","content":"Accumulated $300","types":1,"kind":1840,"conditions":"300","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,21060,100-4,0,150000-3,0,150000000-1,10140,150-1,10210,150-1,10050,1500-2,30107,6-1,60040,150-1,10030,150","create_time":0,"sort":1840,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260112837,"title":"","content":"Accumulated $200","types":1,"kind":1840,"conditions":"200","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,21060,67-4,0,100000-3,0,100000000-1,10140,100-1,10210,100-1,10050,1000-2,30107,4-1,60040,100-1,10030,100","create_time":0,"sort":1840,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260130790,"title":"","content":"Accumulated $2800","types":1,"kind":1810,"conditions":"2800","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10140,700-1,10210,700-1,10050,7000-2,40208,3-2,40108,3-2,40308,3","create_time":0,"sort":1810,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260120943,"title":"","content":"Accumulated $120","types":1,"kind":1820,"conditions":"120","platforms":"","daily":1,"enable":1,"from_time":1793462401,"to_time":1793721599,"items":"1,10140,60-1,10210,60-1,10050,600-5,0,1200-1,31401,12-1,31402,12-1,31403,12-1,31404,12-1,31405,12","create_time":0,"sort":1820,"date_type":1,"is_global":0,"recurrence_seconds":259200},{"id":260112832,"title":"","content":"Accumulated $5","types":1,"kind":1840,"conditions":"5","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,21060,2-4,0,4000-3,0,4000000-1,10140,4-1,10210,4-1,10050,40-5,0,400","create_time":0,"sort":1840,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260112834,"title":"","content":"Accumulated $20","types":1,"kind":1840,"conditions":"20","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,21060,7-4,0,10000-3,0,10000000-1,10140,10-1,10210,10-1,10050,100-2,30106,2-1,60040,10-1,10030,10","create_time":0,"sort":1840,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260130785,"title":"","content":"Accumulated $300","types":1,"kind":1810,"conditions":"300","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10140,200-1,10210,200-1,10050,2000-2,40207,1-2,40107,1-2,40307,1","create_time":0,"sort":1810,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260130791,"title":"","content":"Accumulated $3600","types":1,"kind":1810,"conditions":"3600","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10140,800-1,10210,800-1,10050,8000-2,40209,1-2,40109,1-2,40309,1","create_time":0,"sort":1810,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260120946,"title":"","content":"Accumulated $500","types":1,"kind":1820,"conditions":"500","platforms":"","daily":1,"enable":1,"from_time":1793462401,"to_time":1793721599,"items":"1,10140,250-1,10210,250-1,10050,2500-5,0,5000-1,31401,50-1,31402,50-1,31403,50-1,31404,50-1,31405,50","create_time":0,"sort":1820,"date_type":1,"is_global":0,"recurrence_seconds":259200},{"id":260112840,"title":"","content":"Accumulated $800","types":1,"kind":1840,"conditions":"800","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,21060,267-4,0,400000-3,0,400000000-1,10140,400-1,10210,400-1,10050,4000-2,30107,10-1,60040,400-1,10030,400-1,306,1","create_time":0,"sort":1840,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260130788,"title":"","content":"Accumulated $1500","types":1,"kind":1810,"conditions":"1500","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10140,500-1,10210,500-1,10050,5000-2,40208,1-2,40108,1-2,40308,1","create_time":0,"sort":1810,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260120949,"title":"","content":"Accumulated $1800","types":1,"kind":1820,"conditions":"1800","platforms":"","daily":1,"enable":1,"from_time":1793462401,"to_time":1793721599,"items":"1,10140,900-1,10210,900-1,10050,9000-5,0,18000-1,31401,180-1,31402,180-1,31403,180-1,31404,180-1,31405,180","create_time":0,"sort":1820,"date_type":1,"is_global":0,"recurrence_seconds":259200},{"id":260112839,"title":"","content":"Accumulated $500","types":1,"kind":1840,"conditions":"500","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,21060,167-4,0,250000-3,0,250000000-1,10140,250-1,10210,250-1,10050,2500-2,30107,8-1,60040,250-1,10030,250","create_time":0,"sort":1840,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260112833,"title":"","content":"Accumulated $10","types":1,"kind":1840,"conditions":"10","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,21060,3-4,0,5000-3,0,5000000-1,10140,5-1,10210,5-1,10050,50-5,0,500","create_time":0,"sort":1840,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260130786,"title":"","content":"Accumulated $600","types":1,"kind":1810,"conditions":"600","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10140,300-1,10210,300-1,10050,3000-2,40207,2-2,40107,2-2,40307,2","create_time":0,"sort":1810,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260130787,"title":"","content":"Accumulated $1000","types":1,"kind":1810,"conditions":"1000","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10140,400-1,10210,400-1,10050,4000-2,40207,3-2,40107,3-2,40307,3","create_time":0,"sort":1810,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260112831,"title":"Daily Recharge;Get Powerful Ninja","content":"Accumulated $1","types":1,"kind":1840,"conditions":"1","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,21060,1-4,0,1000-3,0,1000000-1,10140,1-1,10210,1-1,10050,10-5,0,100","create_time":0,"sort":1840,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260130789,"title":"","content":"Accumulated $2100","types":1,"kind":1810,"conditions":"2100","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10140,600-1,10210,600-1,10050,6000-2,40208,2-2,40108,2-2,40308,2","create_time":0,"sort":1810,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260120944,"title":"","content":"Accumulated $200","types":1,"kind":1820,"conditions":"200","platforms":"","daily":1,"enable":1,"from_time":1793462401,"to_time":1793721599,"items":"1,10140,100-1,10210,100-1,10050,1000-5,0,2000-1,31401,20-1,31402,20-1,31403,20-1,31404,20-1,31405,20","create_time":0,"sort":1820,"date_type":1,"is_global":0,"recurrence_seconds":259200},{"id":260120945,"title":"","content":"Accumulated $300","types":1,"kind":1820,"conditions":"300","platforms":"","daily":1,"enable":1,"from_time":1793462401,"to_time":1793721599,"items":"1,10140,150-1,10210,150-1,10050,1500-5,0,3000-1,31401,30-1,31402,30-1,31403,30-1,31404,30-1,31405,30","create_time":0,"sort":1820,"date_type":1,"is_global":0,"recurrence_seconds":259200},{"id":260130783,"title":"","content":"Accumulated $60","types":1,"kind":1810,"conditions":"60","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10140,30-1,10210,30-1,10050,300-2,40205,1-2,40105,1-2,40305,1","create_time":0,"sort":1810,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260130793,"title":"","content":"Accumulated $5500","types":1,"kind":1810,"conditions":"5500","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10140,1000-1,10210,1000-1,10050,10000-2,40209,3-2,40109,3-2,40309,3","create_time":0,"sort":1810,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260130792,"title":"","content":"Accumulated $4500","types":1,"kind":1810,"conditions":"4500","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10140,900-1,10210,900-1,10050,9000-2,40209,2-2,40109,2-2,40309,2","create_time":0,"sort":1810,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260120942,"title":"","content":"Accumulated $60","types":1,"kind":1820,"conditions":"60","platforms":"","daily":1,"enable":1,"from_time":1793462401,"to_time":1793721599,"items":"1,10140,30-1,10210,30-1,10050,300-5,0,600-1,31401,6-1,31402,6-1,31403,6-1,31404,6-1,31405,6","create_time":0,"sort":1820,"date_type":1,"is_global":0,"recurrence_seconds":259200},{"id":260120948,"title":"","content":"Accumulated $1200","types":1,"kind":1820,"conditions":"1200","platforms":"","daily":1,"enable":1,"from_time":1793462401,"to_time":1793721599,"items":"1,10140,600-1,10210,600-1,10050,6000-5,0,12000-1,31401,120-1,31402,120-1,31403,120-1,31404,120-1,31405,120","create_time":0,"sort":1820,"date_type":1,"is_global":0,"recurrence_seconds":259200},{"id":260120947,"title":"","content":"Accumulated $800","types":1,"kind":1820,"conditions":"800","platforms":"","daily":1,"enable":1,"from_time":1793462401,"to_time":1793721599,"items":"1,10140,400-1,10210,400-1,10050,4000-5,0,8000-1,31401,80-1,31402,80-1,31403,80-1,31404,80-1,31405,80","create_time":0,"sort":1820,"date_type":1,"is_global":0,"recurrence_seconds":259200},{"id":260112836,"title":"","content":"Accumulated $120","types":1,"kind":1840,"conditions":"120","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,21060,40-4,0,60000-3,0,60000000-1,10140,60-1,10210,60-1,10050,600-2,30107,3-1,60040,60-1,10030,60","create_time":0,"sort":1840,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260130784,"title":"","content":"Accumulated $100","types":1,"kind":1810,"conditions":"100","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10140,40-1,10210,40-1,10050,400-2,40206,1-2,40106,1-2,40306,1","create_time":0,"sort":1810,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260130781,"title":"Weekly Recharge;Get Huge Resource","content":"Accumulated $10","types":1,"kind":1810,"conditions":"10","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10140,10-1,10210,10-1,10050,100-2,40203,1-2,40103,1-2,40303,1","create_time":0,"sort":1810,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260112835,"title":"","content":"Accumulated $60","types":1,"kind":1840,"conditions":"60","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,21060,20-4,0,30000-3,0,30000000-1,10140,30-1,10210,30-1,10050,300-2,30107,1-1,60040,30-1,10030,30","create_time":0,"sort":1840,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260120941,"title":"3 Days Recharge","content":"Accumulated $20","types":1,"kind":1820,"conditions":"20","platforms":"","daily":1,"enable":1,"from_time":1793462401,"to_time":1793721599,"items":"1,10140,10-1,10210,10-1,10050,100-5,0,200-1,31401,2-1,31402,2-1,31403,2-1,31404,2-1,31405,2","create_time":0,"sort":1820,"date_type":1,"is_global":0,"recurrence_seconds":259200}],[{"id":260301983,"title":"","content":"$4.99 Diamond Pack","types":3,"kind":1830,"conditions":"1,4.99","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"4,0,500-3,0,500000-2,40102,1-2,40202,1-2,40302,1-1,11021,1","create_time":0,"sort":1830,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260301984,"title":"","content":"$9.99 Diamond Pack","types":3,"kind":1830,"conditions":"1,9.99","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"4,0,1000-3,0,1000000-2,40103,1-2,40203,1-2,40303,1-1,11021,1","create_time":0,"sort":1830,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260301985,"title":"","content":"$19.99 Diamond Pack","types":3,"kind":1830,"conditions":"1,19.99","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"4,0,2000-3,0,2000000-2,40104,1-2,40204,1-2,40304,1-1,11021,2","create_time":0,"sort":1830,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260301986,"title":"","content":"$49.99 Diamond Pack","types":3,"kind":1830,"conditions":"1,49.99","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"4,0,5000-3,0,5000000-2,40105,1-2,40205,1-2,40305,1-1,11021,3","create_time":0,"sort":1830,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260301988,"title":"","content":"$149.99 Diamond Pack","types":3,"kind":1830,"conditions":"1,149.99","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"4,0,15000-3,0,15000000-2,40107,1-2,40207,1-2,40307,1-1,11021,7","create_time":0,"sort":1830,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260301987,"title":"","content":"$99.99 Diamond Pack","types":3,"kind":1830,"conditions":"1,99.99","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"4,0,10000-3,0,1000000-2,40106,1-2,40206,1-2,40306,1-1,11021,5","create_time":0,"sort":1830,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260301982,"title":"Single Recharge;Bonus Gems， Diamond and Gold","content":"$0.99 Diamond Pack","types":3,"kind":1830,"conditions":"1,0.99","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"4,0,100-3,0,100000-2,40101,1-2,40201,1-2,40301,1-1,11021,1","create_time":0,"sort":1830,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":91001830,"title":"Single Recharge;Bonus Gems， Diamond and Gold","content":"$299 Diamond Pack","types":3,"kind":1830,"conditions":"1,299","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,11021,10","create_time":0,"sort":1830,"date_type":1,"is_global":0,"recurrence_seconds":86400}],[{"id":260502833,"title":"","content":"Accumulate 12,000 Diamond Spent","types":5,"kind":1060,"conditions":"12000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10140,6-1,10220,30-2,30105,6-1,10050,60","create_time":0,"sort":1060,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260502831,"title":"Diamond Spent; Spend & Get Pumpkin","content":"Accumulate 2,000 Diamond Spent","types":5,"kind":1060,"conditions":"2000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10140,1-1,10220,5-2,30105,1-1,10050,10","create_time":0,"sort":1060,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260502835,"title":"","content":"Accumulate 30,000 Diamond Spent","types":5,"kind":1060,"conditions":"30000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10430,1-1,10140,15-1,10220,75-2,30105,15-1,10050,150","create_time":0,"sort":1060,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260502836,"title":"","content":"Accumulate 50,000 Diamond Spent","types":5,"kind":1060,"conditions":"50000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10430,3-1,10140,25-1,10220,125-2,30105,25-1,10050,250","create_time":0,"sort":1060,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260502834,"title":"","content":"Accumulate 20,000 Diamond Spent","types":5,"kind":1060,"conditions":"20000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10430,1-1,10140,10-1,10220,50-2,30105,10-1,10050,100","create_time":0,"sort":1060,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260502837,"title":"","content":"Accumulate 100,000 Diamond Spent","types":5,"kind":1060,"conditions":"100000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10430,10-2,40104,1-2,40204,1-2,40304,1","create_time":0,"sort":1060,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260502832,"title":"","content":"Accumulate 6,000 Diamond Spent","types":5,"kind":1060,"conditions":"6000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10140,3-1,10220,15-2,30105,3-1,10050,30","create_time":0,"sort":1060,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":91005001,"title":"Diamond Spent; Spend & Get Pumpkin","content":"Tích lũy tiêu 200,000 KC","types":5,"kind":1060,"conditions":"200000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10430,12-2,40104,1-2,40204,1-2,40304,1","create_time":0,"sort":1060,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":91005002,"title":"Diamond Spent; Spend & Get Pumpkin","content":"Tích lũy tiêu 300,000 KC","types":5,"kind":1060,"conditions":"300000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10430,16-2,40104,1-2,40204,1-2,40304,1","create_time":0,"sort":1060,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":91005003,"title":"Diamond Spent; Spend & Get Pumpkin","content":"Tích lũy tiêu 400,000 KC","types":5,"kind":1060,"conditions":"400000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10430,20-2,40104,1-2,40204,1-2,40304,1","create_time":0,"sort":1060,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":91005004,"title":"Diamond Spent; Spend & Get Pumpkin","content":"Tích lũy tiêu 500,000 KC","types":5,"kind":1060,"conditions":"500000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10430,25-2,40104,1-2,40204,1-2,40304,1","create_time":0,"sort":1060,"date_type":1,"is_global":0,"recurrence_seconds":86400}],[{"id":260602834,"title":"","content":"Accumulate 20,000,000 Gold Spent","types":6,"kind":1070,"conditions":"20000000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10210,10-1,10230,50-1,10050,100-1,60040,10","create_time":0,"sort":1070,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260602831,"title":"Gold Spent; Spend & Get Candy","content":"Accumulate 2,000,000 Gold Spent","types":6,"kind":1070,"conditions":"2000000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10210,1-1,10230,5-1,10050,10-1,60040,1","create_time":0,"sort":1070,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260602833,"title":"","content":"Accumulate 12,000,000 Gold Spent","types":6,"kind":1070,"conditions":"12000000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10210,6-1,10230,30-1,10050,60-1,60040,6","create_time":0,"sort":1070,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260602836,"title":"","content":"Accumulate 50,000,000 Gold Spent","types":6,"kind":1070,"conditions":"50000000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10210,25-1,10230,125-1,10050,250-1,60040,25","create_time":0,"sort":1070,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260602832,"title":"","content":"Accumulate 6,000,000 Gold Spent","types":6,"kind":1070,"conditions":"6000000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10210,3-1,10230,15-1,10050,30-1,60040,3","create_time":0,"sort":1070,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":260602835,"title":"","content":"Accumulate 30,000,000 Gold Spent","types":6,"kind":1070,"conditions":"30000000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10210,15-1,10230,75-1,10050,150-1,60040,15","create_time":0,"sort":1070,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":91006001,"title":"Gold Spent; Spend & Get Candy","content":"Tích lũy tiêu 100,000,000 vàng","types":6,"kind":1070,"conditions":"100000000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10210,32-1,10230,162-1,10050,325-1,60040,32","create_time":0,"sort":1070,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":91006002,"title":"Gold Spent; Spend & Get Candy","content":"Tích lũy tiêu 200,000,000 vàng","types":6,"kind":1070,"conditions":"200000000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10210,40-1,10230,200-1,10050,400-1,60040,40","create_time":0,"sort":1070,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":91006003,"title":"Gold Spent; Spend & Get Candy","content":"Tích lũy tiêu 300,000,000 vàng","types":6,"kind":1070,"conditions":"300000000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10210,47-1,10230,237-1,10050,475-1,60040,47","create_time":0,"sort":1070,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":91006004,"title":"Gold Spent; Spend & Get Candy","content":"Tích lũy tiêu 400,000,000 vàng","types":6,"kind":1070,"conditions":"400000000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10210,55-1,10230,275-1,10050,550-1,60040,55","create_time":0,"sort":1070,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":91006005,"title":"Gold Spent; Spend & Get Candy","content":"Tích lũy tiêu 500,000,000 vàng","types":6,"kind":1070,"conditions":"500000000","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10210,62-1,10230,312-1,10050,625-1,60040,62","create_time":0,"sort":1070,"date_type":1,"is_global":0,"recurrence_seconds":86400}],[{"id":260070395,"title":"","content":"Day 5","types":7,"kind":1080,"conditions":"5,1","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10050,200-1,20810,1","create_time":0,"sort":1080,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260070393,"title":"","content":"Day 3","types":7,"kind":1080,"conditions":"3,1","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10230,20-1,20810,1","create_time":0,"sort":1080,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260070396,"title":"","content":"Day 6","types":7,"kind":1080,"conditions":"6,1","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10210,20-1,20810,2","create_time":0,"sort":1080,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260070391,"title":"2026 - 7D Login;Get Free Resource","content":"Day 1","types":7,"kind":1080,"conditions":"1,1","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"4,0,200-1,20810,1","create_time":0,"sort":1080,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260070392,"title":"","content":"Day 2","types":7,"kind":1080,"conditions":"2,1","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"3,0,200000-1,20810,1","create_time":0,"sort":1080,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260070394,"title":"","content":"Day 4","types":7,"kind":1080,"conditions":"4,1","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10220,20-1,20810,1","create_time":0,"sort":1080,"date_type":1,"is_global":0,"recurrence_seconds":604800},{"id":260070397,"title":"","content":"Day 7","types":7,"kind":1080,"conditions":"7,1","platforms":"","daily":1,"enable":1,"from_time":1793548801,"to_time":1794153599,"items":"1,10140,20-1,20810,3","create_time":0,"sort":1080,"date_type":1,"is_global":0,"recurrence_seconds":604800}],[{"id":261202835,"title":"","content":"Challenge 10 times","types":12,"kind":1050,"conditions":"10","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,10-1,10020,10-3,0,100000","create_time":0,"sort":1050,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261202833,"title":"","content":"Challenge 6 times","types":12,"kind":1050,"conditions":"6","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,6-1,10020,6-3,0,60000","create_time":0,"sort":1050,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261202831,"title":"Arena Battle","content":"Challenge 2 times","types":12,"kind":1050,"conditions":"2","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,2-1,10020,2-3,0,20000","create_time":0,"sort":1050,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261202834,"title":"","content":"Challenge 8 times","types":12,"kind":1050,"conditions":"8","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,8-1,10020,8-3,0,80000","create_time":0,"sort":1050,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261202832,"title":"","content":"Challenge 4 times","types":12,"kind":1050,"conditions":"4","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,4-1,10020,4-3,0,40000","create_time":0,"sort":1050,"date_type":1,"is_global":0,"recurrence_seconds":86400}],[{"id":10016,"title":"","content":"VIP 17(Svip 2)","types":13,"kind":2040,"conditions":"1,17","platforms":"","daily":1,"enable":1,"from_time":1790265600,"to_time":2105625600,"items":"1,22,1-1,10430,200-1,10140,1000","create_time":0,"sort":2040,"date_type":2,"is_global":0},{"id":10010,"title":"","content":"VIP 11","types":13,"kind":2040,"conditions":"1,11","platforms":"","daily":1,"enable":1,"from_time":1790265600,"to_time":2105625600,"items":"1,20120,40-1,60030,40-1,50040,40-1,11021,5","create_time":0,"sort":2040,"date_type":2,"is_global":0},{"id":10012,"title":"","content":"VIP 13","types":13,"kind":2040,"conditions":"1,13","platforms":"","daily":1,"enable":1,"from_time":1790265600,"to_time":2105625600,"items":"1,20120,80-1,60030,80-1,50040,80-1,11021,7","create_time":0,"sort":2040,"date_type":2,"is_global":0},{"id":10013,"title":"","content":"VIP 14","types":13,"kind":2040,"conditions":"1,14","platforms":"","daily":1,"enable":1,"from_time":1790265600,"to_time":2105625600,"items":"1,20120,100-1,60030,100-1,50040,100-1,11021,8","create_time":0,"sort":2040,"date_type":2,"is_global":0},{"id":10014,"title":"","content":"VIP 15","types":13,"kind":2040,"conditions":"1,15","platforms":"","daily":1,"enable":1,"from_time":1790265600,"to_time":2105625600,"items":"1,20120,120-1,60030,120-1,50040,120-1,240,1-1,11021,9","create_time":0,"sort":2040,"date_type":2,"is_global":0},{"id":10015,"title":"","content":"VIP 16(Svip 1)","types":13,"kind":2040,"conditions":"1,16","platforms":"","daily":1,"enable":1,"from_time":1790265600,"to_time":2105625600,"items":"1,21,1-1,10430,100-1,10140,500","create_time":0,"sort":2040,"date_type":2,"is_global":0},{"id":10017,"title":"","content":"VIP 18(Svip 3)","types":13,"kind":2040,"conditions":"1,18","platforms":"","daily":1,"enable":1,"from_time":1790265600,"to_time":2105625600,"items":"1,23,1-1,10430,300-1,10140,1500","create_time":0,"sort":2040,"date_type":2,"is_global":0},{"id":10018,"title":"","content":"VIP 19(Svip 4)","types":13,"kind":2040,"conditions":"1,19","platforms":"","daily":1,"enable":1,"from_time":1790265600,"to_time":2105625600,"items":"1,24,1-1,10430,400-1,10140,2000","create_time":0,"sort":2040,"date_type":2,"is_global":0},{"id":10019,"title":"","content":"VIP 20(Svip 5)","types":13,"kind":2040,"conditions":"1,20","platforms":"","daily":1,"enable":1,"from_time":1790265600,"to_time":2105625600,"items":"1,25,1-1,10430,500-1,10140,2500","create_time":0,"sort":2040,"date_type":2,"is_global":0},{"id":10008,"title":"VIP Pack;VIP Pack","content":"VIP 9","types":13,"kind":2040,"conditions":"1,9","platforms":"","daily":1,"enable":1,"from_time":1790265600,"to_time":2105625600,"items":"1,20120,10-1,60030,10-1,50040,10","create_time":0,"sort":2040,"date_type":2,"is_global":0},{"id":10009,"title":"","content":"VIP 10","types":13,"kind":2040,"conditions":"1,10","platforms":"","daily":1,"enable":1,"from_time":1790265600,"to_time":2105625600,"items":"1,20120,20-1,60030,20-1,50040,20","create_time":0,"sort":2040,"date_type":2,"is_global":0},{"id":10011,"title":"","content":"VIP 12","types":13,"kind":2040,"conditions":"1,12","platforms":"","daily":1,"enable":1,"from_time":1790265600,"to_time":2105625600,"items":"1,20120,60-1,60030,60-1,50040,60-1,11021,6","create_time":0,"sort":2040,"date_type":2,"is_global":0}],[{"id":15064992,"title":"","content":"500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20410,50","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15074999,"title":"","content":"50 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20550,50","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15104987,"title":"","content":"100 Mugen Tsukuyomi (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31605,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31404,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15104992,"title":"","content":"100 Akatsuki Crest (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31603,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31404,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15124998,"title":"","content":"20000 Diamonds","types":15,"kind":220,"conditions":"99999;0;4,0,20000","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,30107,1","create_time":0,"sort":220,"date_type":1,"is_global":0},{"id":15134997,"title":"Equip  Exchange","content":"100 Golden Key","types":15,"kind":230,"conditions":"99999;0;1,10430,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,11020,10","create_time":0,"sort":230,"date_type":1,"is_global":0},{"id":15044980,"title":"","content":"100 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,30106,1","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15084980,"title":"","content":"75 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20750,50","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15094999,"title":"","content":"10 Silver Key","types":15,"kind":190,"conditions":"99999;0;1,10420,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,1","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15114965,"title":"","content":"10 Hanabi (Soul)","types":15,"kind":210,"conditions":"99999;0;1,20950,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15034987,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20080,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15044984,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20340,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15044993,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20470,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15054981,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,280,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15105000,"title":"","content":"100 Chojo Kebutsu (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31601,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31401,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15114978,"title":"","content":"50 Uzumaki Menma (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20890,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15024990,"title":"","content":"10 Kinkaku(Soul)","types":15,"kind":120,"conditions":"99999;0;1,20770,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,10","create_time":0,"sort":120,"date_type":1,"is_global":0},{"id":15054983,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,260,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15054986,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,220,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15064987,"title":"","content":"500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20550,50","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15074977,"title":"","content":"15 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20720,10","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15084975,"title":"","content":"15 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20790,10","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15084996,"title":"","content":"50 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20570,50","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15014988,"title":"","content":"100 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31705,150","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15054980,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,290,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15094940,"title":"","content":"50 Baryon Naruto (Souls)","types":15,"kind":190,"conditions":"99999;0;1,21060,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,75","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094972,"title":"","content":"50 Kaguya (Souls)","types":15,"kind":190,"conditions":"99999;0;1,20900,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15114971,"title":"","content":"10 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20920,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15114992,"title":"","content":"500 Uzumaki Crest (shard)","types":15,"kind":210,"conditions":"99999;0;1,31602,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,5","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15034980,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20290,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15044992,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20060,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15064994,"title":"","content":"500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20370,50","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15074997,"title":"","content":"50 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20600,50","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15074998,"title":"","content":"50 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20590,50","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15094958,"title":"","content":"50 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20960,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094968,"title":"","content":"50 Otsutsuki Momoshiki (Souls)","types":15,"kind":190,"conditions":"99999;0;1,20930,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15114998,"title":"","content":"1000 Candy","types":15,"kind":210,"conditions":"99999;0;1,10210,1000","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,20","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15024988,"title":"","content":"10 Young Tsunade(Soul)","types":15,"kind":120,"conditions":"99999;0;1,20790,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,10","create_time":0,"sort":120,"date_type":1,"is_global":0},{"id":15074978,"title":"","content":"15 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20690,10","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15094941,"title":"","content":"10 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,21040,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094957,"title":"","content":"10 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20960,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094980,"title":"","content":"50 Indra (Souls)","types":15,"kind":190,"conditions":"99999;0;1,20860,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15114967,"title":"","content":"10 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20950,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15124997,"title":"Diamond Exchange","content":"100000 Diamonds","types":15,"kind":220,"conditions":"99999;0;4,0,100000","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,30107,5","create_time":0,"sort":220,"date_type":1,"is_global":0},{"id":15044990,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20280,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15074981,"title":"","content":"15 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20650,10","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15094986,"title":"","content":"50 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20830,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15104979,"title":"","content":"100 Choodama Rasengan (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31604,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31402,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15114948,"title":"","content":"50 Jigen (Souls))","types":15,"kind":210,"conditions":"99999;0;1,21050,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15114949,"title":"","content":"10 Urashiki (Souls)","types":15,"kind":210,"conditions":"99999;0;1,21030,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15114973,"title":"","content":"10 Adult Konohamaru(Souls)","types":15,"kind":210,"conditions":"99999;0;1,20910,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15114982,"title":"","content":"50 Byakugo Sakura (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20870,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15044997,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20050,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15074989,"title":"","content":"75 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20720,50","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15094961,"title":"","content":"10 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20940,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15104980,"title":"","content":"100 Choodama Rasengan (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31604,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31401,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15114983,"title":"","content":"10 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20870,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15044999,"title":"","content":"100 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20130,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15094981,"title":"","content":"10 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20840,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15104986,"title":"","content":"100 Mugen Tsukuyomi (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31605,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31405,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15114956,"title":"","content":"50 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,21010,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15114962,"title":"","content":"50 Mitsuki (Soul)","types":15,"kind":210,"conditions":"99999;0;1,20980,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15114996,"title":"","content":"1000 Pumpkin","types":15,"kind":210,"conditions":"99999;0;1,10140,1000","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15065000,"title":"","content":"500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,30106,5","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15074983,"title":"","content":"15 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20640,10","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15094948,"title":"","content":"50 Hagoromo (Souls)","types":15,"kind":190,"conditions":"99999;0;1,21020,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15054993,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,150,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15084991,"title":"","content":"75 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20710,50","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15094998,"title":"","content":"50 Sage Minato (Soul)","types":15,"kind":190,"conditions":"99999;0;1,20820,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15104989,"title":"","content":"100 Mugen Tsukuyomi (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31605,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31402,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15064988,"title":"","content":"500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10220,50","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15024993,"title":"","content":"10 Sage Jiraiya(Soul)","types":15,"kind":120,"conditions":"99999;0;1,20740,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,10","create_time":0,"sort":120,"date_type":1,"is_global":0},{"id":15054982,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,270,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15055000,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,80,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15084971,"title":"","content":"15 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20800,10","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15094967,"title":"","content":"10 Otsutsuki Momoshiki (Souls)","types":15,"kind":190,"conditions":"99999;0;1,20930,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094987,"title":"","content":"10 Rinnegan Sasuke (Soul)","types":15,"kind":190,"conditions":"99999;0;1,20830,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15104977,"title":"","content":"100 Choodama Rasengan (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31604,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31404,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15014993,"title":"","content":"100 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,30608,1","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15114958,"title":"","content":"10 Delta (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20990,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15104981,"title":"","content":"100 Uzumaki Crest (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31602,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31405,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15084986,"title":"","content":"15 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20660,10","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15084993,"title":"","content":"75 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20660,50","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15024991,"title":"","content":"10 Shimon Gai(Soul)","types":15,"kind":120,"conditions":"99999;0;1,20760,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,10","create_time":0,"sort":120,"date_type":1,"is_global":0},{"id":15074987,"title":"","content":"10 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20550,10","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15084992,"title":"","content":"75 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20700,50","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15094943,"title":"","content":"10 Isshiki (Souls)","types":15,"kind":190,"conditions":"99999;0;1,21040,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15114986,"title":"","content":"5 Uzumaki Crest","types":15,"kind":210,"conditions":"99999;0;2,21602,5","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,5","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15014994,"title":"","content":"100 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,30607,1","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15104985,"title":"","content":"100 Uzumaki Crest (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31602,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31401,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15084988,"title":"","content":"15 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20610,10","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15054977,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,320,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15054999,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,90,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15064983,"title":"Medal Exchange","content":"2500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,2500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,40305,1","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15064995,"title":"","content":"500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20380,50","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15114980,"title":"","content":"50 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20890,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15015000,"title":"","content":"100 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,30601,1","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15094951,"title":"","content":"10 Boruto (souls)","types":15,"kind":190,"conditions":"99999;0;1,21000,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15074986,"title":"","content":"10 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20590,10","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15044985,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20350,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15104998,"title":"","content":"100 Chojo Kebutsu (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31601,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31403,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15104999,"title":"","content":"100 Chojo Kebutsu (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31601,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31402,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15114964,"title":"","content":"50 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20980,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15034993,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20390,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15084982,"title":"","content":"75 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20740,50","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15114960,"title":"","content":"50 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20990,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15114969,"title":"","content":"10 Uchiha Shin (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20920,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15034986,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20270,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15084972,"title":"","content":"75 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20760,50","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15114963,"title":"","content":"10 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20980,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15114966,"title":"","content":"50 Hanabi (Soul)","types":15,"kind":210,"conditions":"99999;0;1,20950,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15035000,"title":"","content":"100 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20010,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15084981,"title":"","content":"15 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20750,10","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15084997,"title":"","content":"50 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20540,50","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15094982,"title":"","content":"50 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20840,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15074984,"title":"","content":"15 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20560,10","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15064997,"title":"","content":"500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20460,50","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15084994,"title":"","content":"50 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20630,50","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15114985,"title":"","content":"5 Choodama Rasengan","types":15,"kind":210,"conditions":"99999;0;2,21604,5","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,5","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15044986,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20520,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15094956,"title":"","content":"50 Kashin Koji (Soul)","types":15,"kind":190,"conditions":"99999;0;1,20970,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094984,"title":"","content":"50 Asura(Soul)","types":15,"kind":190,"conditions":"99999;0;1,20840,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15115000,"title":"","content":"1000 Stamp","types":15,"kind":210,"conditions":"99999;0;1,10230,1000","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10210,20","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15084976,"title":"","content":"75 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20780,50","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15024998,"title":"","content":"10 Shisui(Soul)","types":15,"kind":120,"conditions":"99999;0;1,20610,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,10","create_time":0,"sort":120,"date_type":1,"is_global":0},{"id":15074988,"title":"","content":"75 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20730,50","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15094976,"title":"","content":"50 Sage Hashirama (Souls)","types":15,"kind":190,"conditions":"99999;0;1,20880,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15134998,"title":"","content":"10 Golden Key","types":15,"kind":230,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,11020,1","create_time":0,"sort":230,"date_type":1,"is_global":0},{"id":15024994,"title":"","content":"10 Darui(Soul)","types":15,"kind":120,"conditions":"99999;0;1,20630,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,10","create_time":0,"sort":120,"date_type":1,"is_global":0},{"id":15104994,"title":"","content":"100 Akatsuki Crest (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31603,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31402,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15114953,"title":"","content":"10 Adult Kankuro (Souls)","types":15,"kind":210,"conditions":"99999;0;1,21010,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15014985,"title":"Scroll Exchange","content":"200 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,200","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,30613,1","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15054984,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,250,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15064998,"title":"","content":"500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10030,25","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15084973,"title":"","content":"75 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20770,50","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15114999,"title":"","content":"1000 Doll","types":15,"kind":210,"conditions":"99999;0;1,10220,1000","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10210,20","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15124999,"title":"","content":"100000 Diamonds","types":15,"kind":220,"conditions":"99999;0;4,0,100000","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,25","create_time":0,"sort":220,"date_type":1,"is_global":0},{"id":15134999,"title":"","content":"10000 Diamonds","types":15,"kind":230,"conditions":"99999;0;4,0,10000","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,11010,10","create_time":0,"sort":230,"date_type":1,"is_global":0},{"id":15034984,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20260,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15054998,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,100,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15084989,"title":"","content":"10 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20570,10","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15094997,"title":"","content":"10 Sage Minato (Soul)","types":15,"kind":190,"conditions":"99999;0;1,20820,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15034982,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20160,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15064991,"title":"","content":"500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20430,50","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15074993,"title":"","content":"75 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20650,50","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15025000,"title":"","content":"10 Hashirama(Soul)","types":15,"kind":120,"conditions":"99999;0;1,20540,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,10","create_time":0,"sort":120,"date_type":1,"is_global":0},{"id":15074976,"title":"","content":"15 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20730,10","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15084985,"title":"","content":"15 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20700,10","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15085000,"title":"","content":"10 Rose Exchange","types":15,"kind":180,"conditions":"99999;0;1,10120,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,2","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15094990,"title":"","content":"50 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20820,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15104993,"title":"","content":"100 Akatsuki Crest (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31603,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31403,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15024989,"title":"","content":"10 Susanoo Itachi(Soul)","types":15,"kind":120,"conditions":"99999;0;1,20780,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,10","create_time":0,"sort":120,"date_type":1,"is_global":0},{"id":15114988,"title":"","content":"5 Akatsuki Crest","types":15,"kind":210,"conditions":"99999;0;2,21603,5","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,5","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15044995,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20180,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15054995,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,130,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15054996,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,120,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15094969,"title":"","content":"10 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20900,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15114989,"title":"","content":"5 Chojo Kebutsu","types":15,"kind":210,"conditions":"99999;0;2,21601,5","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,5","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15044991,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20190,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15054989,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,190,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15064996,"title":"","content":"500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20120,50","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15084978,"title":"","content":"15 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20770,10","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15114952,"title":"","content":"50 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,21030,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15044998,"title":"","content":"100 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20110,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15034991,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20220,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15054978,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,310,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15094962,"title":"","content":"50 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20940,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094971,"title":"","content":"10 Kaguya (Souls)","types":15,"kind":190,"conditions":"99999;0;1,20900,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094983,"title":"","content":"10 Asura(Soul)","types":15,"kind":190,"conditions":"99999;0;1,20840,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15114950,"title":"","content":"50 Urashiki (Souls)","types":15,"kind":210,"conditions":"99999;0;1,21030,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15014999,"title":"","content":"100 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,30602,1","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15044979,"title":"Doll Exchange","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,40010,10","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15044994,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20420,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15094977,"title":"","content":"10 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20860,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15014991,"title":"","content":"100 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31702,150","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15114954,"title":"","content":"50 Adult Kankuro (Souls)","types":15,"kind":210,"conditions":"99999;0;1,21010,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15034979,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20310,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15044982,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20510,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15084987,"title":"","content":"10 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20630,10","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15094953,"title":"","content":"10 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20970,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15104983,"title":"","content":"100 Uzumaki Crest (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31602,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31403,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15114972,"title":"","content":"50 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20920,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15024999,"title":"","content":"10 6P-Obito(Soul)","types":15,"kind":120,"conditions":"99999;0;1,20570,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,10","create_time":0,"sort":120,"date_type":1,"is_global":0},{"id":15034999,"title":"","content":"100 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20490,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15044981,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20530,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15064999,"title":"","content":"500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,60040,25","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15014989,"title":"","content":"100 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31704,150","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15074982,"title":"","content":"15 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20620,10","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15094966,"title":"","content":"50 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20930,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15054979,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,300,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15094954,"title":"","content":"50 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20970,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15114994,"title":"","content":"500 Akatsuki Crest (shard)","types":15,"kind":210,"conditions":"99999;0;1,31603,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,5","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15054987,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,210,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15064993,"title":"","content":"500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20440,50","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15074995,"title":"","content":"75 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20640,50","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15114975,"title":"","content":"10 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20910,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15044996,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20400,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15034998,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20020,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15104978,"title":"","content":"100 Choodama Rasengan (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31604,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31403,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15014998,"title":"","content":"100 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,30603,1","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15014996,"title":"","content":"100 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,30605,1","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15054997,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,110,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15064986,"title":"","content":"500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20590,50","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15074990,"title":"","content":"75 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20690,50","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15084983,"title":"","content":"15 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20740,10","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15094944,"title":"","content":"50 Isshiki (Souls)","types":15,"kind":190,"conditions":"99999;0;1,21040,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094946,"title":"","content":"50 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,21020,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15014987,"title":"","content":"200 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,200","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,30611,1","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15114976,"title":"","content":"50 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20910,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15114981,"title":"","content":"10 Byakugo Sakura (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20870,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15114947,"title":"Spin Exchange","content":"10 Jigen (Souls))","types":15,"kind":210,"conditions":"99999;0;1,21050,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15094964,"title":"","content":"50 Lone Wolf Sasuke (Souls)","types":15,"kind":190,"conditions":"99999;0;1,20940,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094993,"title":"","content":"10 6P Naruto (Souls)","types":15,"kind":190,"conditions":"99999;0;1,20810,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15014990,"title":"","content":"100 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31703,150","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15064985,"title":"","content":"2500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,2500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,40205,1","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15084995,"title":"","content":"75 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20610,50","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15114955,"title":"","content":"10 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,21010,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15114997,"title":"","content":"10000 Medal","types":15,"kind":210,"conditions":"99999;0;1,10050,10000","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,20","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15014997,"title":"","content":"100 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,30604,1","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15034997,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20040,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15104997,"title":"","content":"100 Chojo Kebutsu (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31601,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31404,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15114977,"title":"","content":"10 Uzumaki Menma (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20890,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15135000,"title":"","content":"1000 Diamonds","types":15,"kind":230,"conditions":"99999;0;4,0,1000","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,11010,1","create_time":0,"sort":230,"date_type":1,"is_global":0},{"id":15024997,"title":"","content":"10 Nagato(Soul)","types":15,"kind":120,"conditions":"99999;0;1,20660,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,10","create_time":0,"sort":120,"date_type":1,"is_global":0},{"id":15074979,"title":"","content":"15 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20680,10","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15074985,"title":"","content":"10 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20600,10","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15074991,"title":"","content":"75 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20680,50","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15084974,"title":"","content":"75 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20790,50","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15094959,"title":"","content":"10 Hokage Naruto (Soul)","types":15,"kind":190,"conditions":"99999;0;1,20960,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15064990,"title":"","content":"500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20450,50","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15024996,"title":"","content":"10 6P-Madara(Soul)","types":15,"kind":120,"conditions":"99999;0;1,20700,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,10","create_time":0,"sort":120,"date_type":1,"is_global":0},{"id":15034981,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20360,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15034983,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20240,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15034994,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20200,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15084970,"title":"Pumpkin Exchange","content":"75 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20800,50","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15094985,"title":"","content":"10 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20830,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094988,"title":"","content":"50 Rinnegan Sasuke (Soul)","types":15,"kind":190,"conditions":"99999;0;1,20830,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15024987,"title":"Soul Exchange","content":"10 Young Orochimaru(Soul)","types":15,"kind":120,"conditions":"99999;0;1,20800,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,10","create_time":0,"sort":120,"date_type":1,"is_global":0},{"id":15114991,"title":"","content":"500 Choodama Rasengan (shard)","types":15,"kind":210,"conditions":"99999;0;1,31604,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,5","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15094989,"title":"","content":"10 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20820,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15074992,"title":"","content":"75 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20670,50","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15094975,"title":"","content":"10 Sage Hashirama (Souls)","types":15,"kind":190,"conditions":"99999;0;1,20880,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094992,"title":"","content":"50 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,75","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15064984,"title":"","content":"2500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,2500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,40105,1","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15094942,"title":"","content":"50 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,21040,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094963,"title":"","content":"10 Lone Wolf Sasuke (Souls)","types":15,"kind":190,"conditions":"99999;0;1,20940,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15104996,"title":"","content":"100 Chojo Kebutsu (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31601,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31405,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15125000,"title":"","content":"20000 Diamonds","types":15,"kind":220,"conditions":"99999;0;4,0,20000","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,5","create_time":0,"sort":220,"date_type":1,"is_global":0},{"id":15054994,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,140,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15104990,"title":"","content":"100 Mugen Tsukuyomi (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31605,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31401,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15094979,"title":"","content":"10 Indra (Souls)","types":15,"kind":190,"conditions":"99999;0;1,20860,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15104991,"title":"","content":"100 Akatsuki Crest (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31603,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31405,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15114990,"title":"","content":"100 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,5","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15054976,"title":"","content":"100 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,86101,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15034974,"title":"Stamp Exchange","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,40010,10","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15054990,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,180,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15094965,"title":"","content":"10 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20930,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094994,"title":"","content":"50 6P Naruto (Souls)","types":15,"kind":190,"conditions":"99999;0;1,20810,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15114974,"title":"","content":"50 Adult Konohamaru(Souls)","types":15,"kind":210,"conditions":"99999;0;1,20910,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15024992,"title":"","content":"10 Hokage Kakashi(Soul)","types":15,"kind":120,"conditions":"99999;0;1,20750,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,10","create_time":0,"sort":120,"date_type":1,"is_global":0},{"id":15074994,"title":"","content":"75 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20620,50","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15114959,"title":"","content":"10 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20990,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15034976,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20330,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15024995,"title":"","content":"10 Toneri(Soul)","types":15,"kind":120,"conditions":"99999;0;1,20710,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,10","create_time":0,"sort":120,"date_type":1,"is_global":0},{"id":15034995,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20300,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15044988,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20480,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15054985,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,230,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15074975,"title":"Candy Exchange","content":"50 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10050,500","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15074980,"title":"","content":"15 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20670,10","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15094945,"title":"","content":"10 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,21020,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15014992,"title":"","content":"100 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31701,150","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15104984,"title":"","content":"100 Uzumaki Crest (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31602,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31402,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15114979,"title":"","content":"10 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20890,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15094947,"title":"","content":"10 Hagoromo (Souls)","types":15,"kind":190,"conditions":"99999;0;1,21020,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15054988,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,200,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15084984,"title":"","content":"15 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20710,10","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15094950,"title":"","content":"50 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,21000,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094970,"title":"","content":"50 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20900,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15114961,"title":"","content":"10 Mitsuki (Soul)","types":15,"kind":210,"conditions":"99999;0;1,20980,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15034992,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20210,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15044983,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20500,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15045000,"title":"","content":"100 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20100,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15034996,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20030,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15084990,"title":"","content":"10 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20540,10","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15094949,"title":"","content":"10 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,21000,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094952,"title":"","content":"50 Boruto (souls)","types":15,"kind":190,"conditions":"99999;0;1,21000,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094974,"title":"","content":"50 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20880,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094995,"title":"","content":"10 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20810,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15104988,"title":"","content":"100 Mugen Tsukuyomi (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31605,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31403,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15114987,"title":"","content":"5 Mugen Tsukuyomi","types":15,"kind":210,"conditions":"99999;0;2,21605,5","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,5","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15075000,"title":"","content":"10 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10050,100","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15054992,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,160,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15064989,"title":"","content":"500 Medal Exchange","types":15,"kind":160,"conditions":"99999;0;1,10050,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10230,50","create_time":0,"sort":160,"date_type":1,"is_global":0},{"id":15074996,"title":"","content":"75 Candy Exchange","types":15,"kind":170,"conditions":"99999;0;1,10210,75","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20560,50","create_time":0,"sort":170,"date_type":1,"is_global":0},{"id":15094955,"title":"","content":"10 Kashin Koji (Soul)","types":15,"kind":190,"conditions":"99999;0;1,20970,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094991,"title":"","content":"10 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,15","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15034978,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20150,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15034989,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20070,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15084979,"title":"","content":"15 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20760,10","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15084998,"title":"","content":"10 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10210,20","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15084999,"title":"","content":"50 Rose Exchange","types":15,"kind":180,"conditions":"99999;0;1,10120,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10140,10","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15094996,"title":"","content":"50 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20810,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15095000,"title":"","content":"100 Silver Key","types":15,"kind":190,"conditions":"99999;0;1,10420,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15104982,"title":"","content":"100 Uzumaki Crest (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31602,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31404,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15034975,"title":"","content":"100 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,60040,5","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15054975,"title":"Avatar Exchange","content":"100 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,86201,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15054991,"title":"","content":"50 Candy Exchange","types":15,"kind":150,"conditions":"1;0;1,10210,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,170,1","create_time":0,"sort":150,"date_type":1,"is_global":0},{"id":15084977,"title":"","content":"15 Pumpkin Exchange","types":15,"kind":180,"conditions":"99999;0;1,10140,15","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20780,10","create_time":0,"sort":180,"date_type":1,"is_global":0},{"id":15094960,"title":"","content":"50 Hokage Naruto (Soul)","types":15,"kind":190,"conditions":"99999;0;1,20960,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15114951,"title":"","content":"10 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,21030,10","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15114957,"title":"","content":"50 Delta (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20990,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15114993,"title":"","content":"500 Mugen Tsukuyomi (shard)","types":15,"kind":210,"conditions":"99999;0;1,31605,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,5","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15034977,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20320,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15044987,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20170,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15094939,"title":"Key Exchange","content":"10 Baryon Naruto (Souls)","types":15,"kind":190,"conditions":"99999;0;1,21060,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,15","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15104976,"title":"Armlet(S) Exchange","content":"100 Choodama Rasengan (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31604,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31405,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15114970,"title":"","content":"50 Uchiha Shin (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20920,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20850,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15034985,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20090,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15014995,"title":"","content":"100 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,30606,1","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15034988,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20230,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15034990,"title":"","content":"50 Stamp Exchange","types":15,"kind":130,"conditions":"99999;0;1,10230,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20250,50","create_time":0,"sort":130,"date_type":1,"is_global":0},{"id":15044989,"title":"","content":"50 Doll Exchange","types":15,"kind":140,"conditions":"99999;0;1,10220,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20140,50","create_time":0,"sort":140,"date_type":1,"is_global":0},{"id":15094973,"title":"","content":"10 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,10","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20880,10","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15094978,"title":"","content":"50 Golden Key","types":15,"kind":190,"conditions":"99999;0;1,10430,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20860,50","create_time":0,"sort":190,"date_type":1,"is_global":0},{"id":15104995,"title":"","content":"100 Akatsuki Crest (Shard)","types":15,"kind":200,"conditions":"99999;0;1,31603,100","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,31401,10","create_time":0,"sort":200,"date_type":1,"is_global":0},{"id":15014986,"title":"","content":"200 Golden Key","types":15,"kind":110,"conditions":"99999;0;1,10430,200","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"2,30612,1","create_time":0,"sort":110,"date_type":1,"is_global":0},{"id":15114984,"title":"","content":"50 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20870,50","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15114995,"title":"","content":"500 Chojo Kebutsu (shard)","types":15,"kind":210,"conditions":"99999;0;1,31601,500","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,10430,5","create_time":0,"sort":210,"date_type":1,"is_global":0},{"id":15114968,"title":"","content":"50 Shukaku Gaara (Souls)","types":15,"kind":210,"conditions":"99999;0;1,20850,50","platforms":"","daily":1,"enable":1,"from_time":1704038401,"to_time":1924963199,"items":"1,20950,50","create_time":0,"sort":210,"date_type":1,"is_global":0}],[{"id":261602831,"title":"Free Stamina","content":"Purchased 1 time Stamina","types":16,"kind":1010,"conditions":"1","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,2-5,0,10","create_time":0,"sort":1010,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261602835,"title":"","content":"Purchased 5 times Stamina","types":16,"kind":1010,"conditions":"5","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,10-5,0,50","create_time":0,"sort":1010,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261602834,"title":"","content":"Purchased 4 times Stamina","types":16,"kind":1010,"conditions":"4","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,8-5,0,40","create_time":0,"sort":1010,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261602833,"title":"","content":"Purchased 3 times Stamina","types":16,"kind":1010,"conditions":"3","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,6-5,0,30","create_time":0,"sort":1010,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261602832,"title":"","content":"Purchased 2 times Stamina","types":16,"kind":1010,"conditions":"2","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,4-5,0,20","create_time":0,"sort":1010,"date_type":1,"is_global":0,"recurrence_seconds":86400}],[{"id":261702832,"title":"","content":"Purchased 2 times Gold","types":17,"kind":1020,"conditions":"2","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,4-3,0,40000","create_time":0,"sort":1020,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261702834,"title":"","content":"Purchased 4 times Gold","types":17,"kind":1020,"conditions":"4","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,8-3,0,80000","create_time":0,"sort":1020,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261702833,"title":"","content":"Purchased 3 times Gold","types":17,"kind":1020,"conditions":"3","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,6-3,0,60000","create_time":0,"sort":1020,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261702831,"title":"Free Gold","content":"Purchased 1 time Gold","types":17,"kind":1020,"conditions":"1","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,2-3,0,20000","create_time":0,"sort":1020,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261702835,"title":"","content":"Purchased 5 times Gold","types":17,"kind":1020,"conditions":"5","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,10-3,0,100000","create_time":0,"sort":1020,"date_type":1,"is_global":0,"recurrence_seconds":86400}],[{"id":261802833,"title":"","content":"Challenge 6 times","types":18,"kind":1030,"conditions":"6","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,6-1,60030,6-3,0,60000","create_time":0,"sort":1030,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261802834,"title":"","content":"Challenge 8 times","types":18,"kind":1030,"conditions":"8","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,8-1,60030,8-3,0,80000","create_time":0,"sort":1030,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261802835,"title":"","content":"Challenge 10 times","types":18,"kind":1030,"conditions":"10","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,10-1,60030,10-3,0,100000","create_time":0,"sort":1030,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261802832,"title":"","content":"Challenge 4 times","types":18,"kind":1030,"conditions":"4","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,4-1,60030,4-3,0,40000","create_time":0,"sort":1030,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261802831,"title":"Shadow Arena","content":"Challenge 2 times","types":18,"kind":1030,"conditions":"2","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,2-1,60030,2-3,0,20000","create_time":0,"sort":1030,"date_type":1,"is_global":0,"recurrence_seconds":86400}],[{"id":261902832,"title":"","content":"Spin 5 Roulette","types":19,"kind":1000,"conditions":"5","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,50","create_time":0,"sort":1000,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261902833,"title":"","content":"Spin 10 Roulette","types":19,"kind":1000,"conditions":"10","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,100","create_time":0,"sort":1000,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261902834,"title":"","content":"Spin 20 Roulette","types":19,"kind":1000,"conditions":"20","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,200","create_time":0,"sort":1000,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261902831,"title":"Daily;Roulette Extra Reward","content":"Spin 2 Roulette","types":19,"kind":1000,"conditions":"2","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,20","create_time":0,"sort":1000,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":261902835,"title":"","content":"Spin 50 Roulette","types":19,"kind":1000,"conditions":"50","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,500","create_time":0,"sort":1000,"date_type":1,"is_global":0,"recurrence_seconds":86400}],[{"id":262102832,"title":"","content":"Ninjutsu Training 20 times","types":21,"kind":1040,"conditions":"20","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,4-2,30104,4-3,0,40000","create_time":0,"sort":1040,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":262102835,"title":"","content":"Ninjutsu Training 50 times","types":21,"kind":1040,"conditions":"50","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,10-2,30104,10-3,0,100000","create_time":0,"sort":1040,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":262102834,"title":"","content":"Ninjutsu Training 40 times","types":21,"kind":1040,"conditions":"40","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,8-2,30104,8-3,0,80000","create_time":0,"sort":1040,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":262102833,"title":"","content":"Ninjutsu Training 30 times","types":21,"kind":1040,"conditions":"30","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,6-2,30104,6-3,0,60000","create_time":0,"sort":1040,"date_type":1,"is_global":0,"recurrence_seconds":86400},{"id":262102831,"title":"Ninjutsu Training","content":"Ninjutsu Training 10 times","types":21,"kind":1040,"conditions":"10","platforms":"","daily":1,"enable":1,"from_time":1793635201,"to_time":1793721599,"items":"1,10050,2-2,30104,2-3,0,20000","create_time":0,"sort":1040,"date_type":1,"is_global":0,"recurrence_seconds":86400}],[{"id":11011208,"title":"Gold Roulette","content":"Each roulette will cost Medal x99. ;<>Activity rules: ;%1.Each roulette will cost Medal x99; ;2.There is no limit of participation in roulette; ;3.All collected reward can be found in the inventory.Each roulette will cost Gold x999999. ;<>Activity rules: ;%1.Each roulette will cost Gold x999999; ;2.There is no limit of participation in roulette; ;3.All collected reward can be found in the inventory.","types":101,"kind":2,"conditions":"","platforms":"","daily":0,"enable":0,"from_time":1672502401,"to_time":1798646401,"items":"","create_time":0,"sort":100,"date_type":1,"is_global":0},{"id":11011209,"title":"Diamond Roulette","content":"Each roulette will cost Diamond x999. ;<>Activity rules: ;%1.Each roulette will cost Diamond x999; ;2.There is no limit of participation in roulette; ;3.All collected reward can be found in the inventory.","types":101,"kind":3,"conditions":"","platforms":"","daily":0,"enable":0,"from_time":1672502401,"to_time":1798646401,"items":"","create_time":0,"sort":100,"date_type":1,"is_global":0},{"id":11011210,"title":"Medal Roulette","content":"Each roulette will cost Medal x99. ;<>Activity rules: ;%1.Each roulette will cost Medal x99; ;2.There is no limit of participation in roulette; ;3.All collected reward can be found in the inventory.","types":101,"kind":4,"conditions":"","platforms":"","daily":0,"enable":0,"from_time":1672502401,"to_time":1798646401,"items":"","create_time":0,"sort":100,"date_type":1,"is_global":0}],[{"id":984001,"kind":9840,"types":15,"from_time":1577836800,"to_time":2000000000,"sort":110,"title":"Táo Đấu Trường;Đổi Key Vàng","is_global":0,"content":"100 Táo đổi 1 Key Vàng.<>Táo tích lũy từ thưởng BXH Arena Limited mỗi ngày, cần đấu ít nhất 3 trận để nhận thưởng.","conditions":"999999;0;1,10150,100","items":"1,10430,1"}]],
    onlineLucky: {"luckys":{"11011208":{"id":11011208,"name":"Gold Roulette","descble":"Each roulette will cost Medal x99. ;<>Activity rules: ;%1.Each roulette will cost Medal x99; ;2.There is no limit of participation in roulette; ;3.All collected reward can be found in the inventory.Each roulette will cost Gold x999999. ;<>Activity rules: ;%1.Each roulette will cost Gold x999999; ;2.There is no limit of participation in roulette; ;3.All collected reward can be found in the inventory.","gold_enable":1,"gold_cost":999999,"gold_limit":99999,"stone_enable":0,"stone_cost":0,"stone_limit":0,"item_enable":0,"item_id":0,"item_amount":0,"item_limit":0,"from_time":1672502401,"to_time":1798646401,"enable":1,"lucky_type":1,"lucky_10_cost_rate":90},"11011209":{"id":11011209,"name":"Diamond Roulette","descble":"Each roulette will cost Diamond x999. ;<>Activity rules: ;%1.Each roulette will cost Diamond x999; ;2.There is no limit of participation in roulette; ;3.All collected reward can be found in the inventory.","gold_enable":0,"gold_cost":0,"gold_limit":0,"stone_enable":1,"stone_cost":999,"stone_limit":99999,"item_enable":0,"item_id":0,"item_amount":0,"item_limit":0,"from_time":1672502401,"to_time":1798646401,"enable":1,"lucky_type":1,"lucky_10_cost_rate":90},"11011210":{"id":11011210,"name":"Medal Roulette","descble":"Each roulette will cost Medal x99. ;<>Activity rules: ;%1.Each roulette will cost Medal x99; ;2.There is no limit of participation in roulette; ;3.All collected reward can be found in the inventory.","gold_enable":0,"gold_cost":0,"gold_limit":0,"stone_enable":0,"stone_cost":0,"stone_limit":0,"item_enable":1,"item_id":10050,"item_amount":99,"item_limit":99999,"from_time":1672502401,"to_time":1798646401,"enable":1,"lucky_type":1,"lucky_10_cost_rate":90}},"items":{"11011208":[{"lucky_id":11011208,"seq":1,"lucky_type":1,"item_type":1,"item_id":10140,"item_amount":5,"limit_amount":-1,"weight":200,"next_seq":0,"need_latern":1,"id":1101120801},{"lucky_id":11011208,"seq":2,"lucky_type":1,"item_type":1,"item_id":10230,"item_amount":20,"limit_amount":-1,"weight":1300,"next_seq":0,"need_latern":0,"id":1101120802},{"lucky_id":11011208,"seq":3,"lucky_type":1,"item_type":1,"item_id":10210,"item_amount":10,"limit_amount":-1,"weight":600,"next_seq":0,"need_latern":1,"id":1101120803},{"lucky_id":11011208,"seq":4,"lucky_type":1,"item_type":1,"item_id":60040,"item_amount":2,"limit_amount":-1,"weight":1300,"next_seq":0,"need_latern":0,"id":1101120804},{"lucky_id":11011208,"seq":5,"lucky_type":1,"item_type":1,"item_id":10220,"item_amount":50,"limit_amount":-1,"weight":600,"next_seq":0,"need_latern":1,"id":1101120805},{"lucky_id":11011208,"seq":6,"lucky_type":1,"item_type":2,"item_id":30105,"item_amount":2,"limit_amount":-1,"weight":1300,"next_seq":0,"need_latern":0,"id":1101120806},{"lucky_id":11011208,"seq":7,"lucky_type":1,"item_type":1,"item_id":10140,"item_amount":2,"limit_amount":-1,"weight":300,"next_seq":0,"need_latern":0,"id":1101120807},{"lucky_id":11011208,"seq":8,"lucky_type":1,"item_type":1,"item_id":10230,"item_amount":50,"limit_amount":-1,"weight":600,"next_seq":0,"need_latern":1,"id":1101120808},{"lucky_id":11011208,"seq":9,"lucky_type":1,"item_type":1,"item_id":10210,"item_amount":5,"limit_amount":-1,"weight":1300,"next_seq":0,"need_latern":0,"id":1101120809},{"lucky_id":11011208,"seq":10,"lucky_type":1,"item_type":1,"item_id":60040,"item_amount":5,"limit_amount":-1,"weight":600,"next_seq":0,"need_latern":1,"id":1101120810},{"lucky_id":11011208,"seq":11,"lucky_type":1,"item_type":1,"item_id":10220,"item_amount":20,"limit_amount":-1,"weight":1500,"next_seq":0,"need_latern":0,"id":1101120811},{"lucky_id":11011208,"seq":12,"lucky_type":1,"item_type":2,"item_id":30105,"item_amount":5,"limit_amount":-1,"weight":300,"next_seq":0,"need_latern":1,"id":1101120812}],"11011209":[{"lucky_id":11011209,"seq":1,"lucky_type":2,"item_type":1,"item_id":31601,"item_amount":10,"limit_amount":-1,"weight":1400,"next_seq":0,"need_latern":0,"id":1101120901},{"lucky_id":11011209,"seq":2,"lucky_type":2,"item_type":1,"item_id":21050,"item_amount":10,"limit_amount":-1,"weight":400,"next_seq":0,"need_latern":1,"id":1101120902},{"lucky_id":11011209,"seq":3,"lucky_type":2,"item_type":1,"item_id":31603,"item_amount":10,"limit_amount":-1,"weight":1400,"next_seq":0,"need_latern":0,"id":1101120903},{"lucky_id":11011209,"seq":4,"lucky_type":2,"item_type":1,"item_id":21050,"item_amount":10,"limit_amount":-1,"weight":400,"next_seq":0,"need_latern":1,"id":1101120904},{"lucky_id":11011209,"seq":5,"lucky_type":2,"item_type":1,"item_id":31605,"item_amount":10,"limit_amount":-1,"weight":1400,"next_seq":0,"need_latern":0,"id":1101120905},{"lucky_id":11011209,"seq":6,"lucky_type":2,"item_type":1,"item_id":10430,"item_amount":2,"limit_amount":-1,"weight":200,"next_seq":0,"need_latern":1,"id":1101120906},{"lucky_id":11011209,"seq":7,"lucky_type":2,"item_type":1,"item_id":21050,"item_amount":10,"limit_amount":-1,"weight":400,"next_seq":0,"need_latern":1,"id":1101120907},{"lucky_id":11011209,"seq":8,"lucky_type":2,"item_type":1,"item_id":31602,"item_amount":10,"limit_amount":-1,"weight":1400,"next_seq":0,"need_latern":0,"id":1101120908},{"lucky_id":11011209,"seq":9,"lucky_type":2,"item_type":1,"item_id":21050,"item_amount":10,"limit_amount":-1,"weight":400,"next_seq":0,"need_latern":1,"id":1101120909},{"lucky_id":11011209,"seq":10,"lucky_type":2,"item_type":1,"item_id":31604,"item_amount":10,"limit_amount":-1,"weight":1400,"next_seq":0,"need_latern":0,"id":1101120910},{"lucky_id":11011209,"seq":11,"lucky_type":2,"item_type":1,"item_id":21050,"item_amount":10,"limit_amount":-1,"weight":400,"next_seq":0,"need_latern":1,"id":1101120911},{"lucky_id":11011209,"seq":12,"lucky_type":2,"item_type":1,"item_id":10430,"item_amount":1,"limit_amount":-1,"weight":800,"next_seq":0,"need_latern":0,"id":1101120912}],"11011210":[{"lucky_id":11011210,"seq":1,"lucky_type":3,"item_type":1,"item_id":10140,"item_amount":5,"limit_amount":-1,"weight":200,"next_seq":0,"need_latern":1,"id":1101121001},{"lucky_id":11011210,"seq":2,"lucky_type":3,"item_type":1,"item_id":10230,"item_amount":20,"limit_amount":-1,"weight":1300,"next_seq":0,"need_latern":0,"id":1101121002},{"lucky_id":11011210,"seq":3,"lucky_type":3,"item_type":1,"item_id":10210,"item_amount":10,"limit_amount":-1,"weight":600,"next_seq":0,"need_latern":1,"id":1101121003},{"lucky_id":11011210,"seq":4,"lucky_type":3,"item_type":1,"item_id":60040,"item_amount":2,"limit_amount":-1,"weight":1300,"next_seq":0,"need_latern":0,"id":1101121004},{"lucky_id":11011210,"seq":5,"lucky_type":3,"item_type":1,"item_id":10220,"item_amount":50,"limit_amount":-1,"weight":600,"next_seq":0,"need_latern":1,"id":1101121005},{"lucky_id":11011210,"seq":6,"lucky_type":3,"item_type":2,"item_id":30105,"item_amount":2,"limit_amount":-1,"weight":1300,"next_seq":0,"need_latern":0,"id":1101121006},{"lucky_id":11011210,"seq":7,"lucky_type":3,"item_type":1,"item_id":10140,"item_amount":2,"limit_amount":-1,"weight":300,"next_seq":0,"need_latern":0,"id":1101121007},{"lucky_id":11011210,"seq":8,"lucky_type":3,"item_type":1,"item_id":10230,"item_amount":50,"limit_amount":-1,"weight":600,"next_seq":0,"need_latern":1,"id":1101121008},{"lucky_id":11011210,"seq":9,"lucky_type":3,"item_type":1,"item_id":10210,"item_amount":5,"limit_amount":-1,"weight":1300,"next_seq":0,"need_latern":0,"id":1101121009},{"lucky_id":11011210,"seq":10,"lucky_type":3,"item_type":1,"item_id":60040,"item_amount":5,"limit_amount":-1,"weight":600,"next_seq":0,"need_latern":1,"id":1101121010},{"lucky_id":11011210,"seq":11,"lucky_type":3,"item_type":1,"item_id":10220,"item_amount":20,"limit_amount":-1,"weight":1300,"next_seq":0,"need_latern":0,"id":1101121011},{"lucky_id":11011210,"seq":12,"lucky_type":3,"item_type":2,"item_id":30105,"item_amount":5,"limit_amount":-1,"weight":600,"next_seq":0,"need_latern":1,"id":1101121012}]}},
    data: null,

    // === V14 SAFE DEDUCTION HELPERS ===
    canDeductGold: function(cost) {
        return Number(this.data.gold || 0) >= Number(cost || 0);
    },
    deductGold: function(cost, queuePush) {
        if (!this.canDeductGold(cost)) return false;
        this.data.gold = Number(this.data.gold || 0) - Number(cost || 0);
        if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        return true;
    },
    canDeductStone: function(cost) {
        return Number(this.data.stone || 0) >= Number(cost || 0);
    },
    deductStone: function(cost, queuePush) {
        if (!this.canDeductStone(cost)) return false;
        this.data.stone = Number(this.data.stone || 0) - Number(cost || 0);
        if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        return true;
    },
    canDeductItem: function(itemId, amount) {
        var entry = this.data.items && this.data.items[itemId];
        var cur = (entry && typeof entry === "object") ? Number(entry.amount || 0) : Number(entry || 0);
        return cur >= Number(amount || 0);
    },
    deductItem: function(itemId, amount, queuePush) {
        if (!this.canDeductItem(itemId, amount)) return false;
        this.changeItemAmount(itemId, -Number(amount || 0), queuePush);
        return true;
    },
    canDeductEquip: function(equipId, amount) {
        var entry = this.data.equip && this.data.equip[equipId];
        var cur = (entry && typeof entry === "object") ? Number(entry.amount || 0) : Number(entry || 0);
        return cur >= Number(amount || 0);
    },
    deductEquip: function(equipId, amount, queuePush) {
        if (!this.canDeductEquip(equipId, amount)) return false;
        this.changeEquipAmount(equipId, -Number(amount || 0), queuePush);
        return true;
    },
    canDeductSp: function(cost) {
        return Number(this.data.sp || 0) >= Number(cost || 0);
    },
    deductSp: function(cost, queuePush) {
        if (!this.canDeductSp(cost)) return false;
        this.data.sp = Number(this.data.sp || 0) - Number(cost || 0);
        if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        return true;
    },
    logPacket: function(tag, cmd, payload) {
        // Disabled verbose payload JSON.stringify in production to eliminate UI lag
    },

    scheduleLater: function(fn, delaySec) {
        var d = (delaySec !== undefined) ? delaySec : 0.01;
        try {
            if (typeof cc !== "undefined" && cc.director && cc.director.getScheduler) {
                var dummy = { _id: Math.random() };
                cc.director.getScheduler().scheduleCallbackForTarget(dummy, function() {
                    fn();
                }, 0, 0, d, false);
                return;
            }
        } catch(e) {}
        fn();
    },

    startOffline: function() {
        this.enabled = true;
        this.loadSave();
        Cache.accountInfo.userId = 1;
        Cache.accountInfo.sessionKey = "OFFLINE_SESSION";
        Cache.accountInfo.account = "offline_user";
        Cache.currentPlayerId = 1;
        var nowSec = Math.floor(Date.now() / 1000);
        Cache.setServerTime({ time: nowSec, offset: 25200 });
        Game.lastHeartBeat = Cache.getServerTime();
        Netty.shared()._isconnected = true;
        LoginLogic.enableSendPackage = true;
        Loading.remove();

        var step = (this.data && this.data.guide_step !== undefined) ? this.data.guide_step : 0;
        GameGuideStep = step;
        if (step === 0) {
            Loading.loadRes(res_newChapter, function() {
                isInGuildMode = true;
                cc.director.runScene(new NewChapter());
            }, null, false, 2);
        } else {
            LoginLogic.initPlayerStart();
        }
    },

    loadSave: function() {
        if (!this.data) {
            if (typeof cc !== "undefined" && cc.sys && cc.sys.localStorage) {
                var str = cc.sys.localStorage.getItem(this.saveKey);
                if (str) {
                    try {
                        this.data = JSON.parse(str);
                    } catch(e) {
                        this.data = null;
                    }
                }
            }
        }
        if (!this.data) {
            this.initDefaultData();
        }
        this.ensureDataFields();
    },

    ensureDataFields: function() {
        if (!this.data) return;
        if (!this.data.items) this.data.items = {};
        if (!this.data.equip) this.data.equip = {};
        if (!this.data.ninja_tools) this.data.ninja_tools = {};
        if (!this.data.heros) this.data.heros = {};
        if (!this.data.beasts) this.data.beasts = {};
        if (!this.data.chapters) {
            this.data.chapters = { "1": [{ chapter_id: 50011, star: 0 }], "2": [], "3": [], "16": [] };
        }
        if (!this.data.chapters["1"] || this.data.chapters["1"].length === 0) {
            this.data.chapters["1"] = [{ chapter_id: 50011, star: 0 }];
        }
        if (!this.data.secrets) this.data.secrets = [];
        if (!this.data.guide_vars) this.data.guide_vars = { releaseSkill: 1, callHero: 1 };
        if (!this.data.daily_counts) this.data.daily_counts = {};
        if (!this.data.sign_days) this.data.sign_days = [];
        if (!this.data.lv_rewards) this.data.lv_rewards = [];
        if (!this.data.event_claims) this.data.event_claims = {};
        if (!this.data.event_process) this.data.event_process = {};
        if (!this.data.achievements) this.data.achievements = {};
        if (!this.data.treasures) this.data.treasures = [];
        if (!this.data.shops) this.data.shops = {};
        if (!this.data.awake_task_progress) this.data.awake_task_progress = {};
        if (!this.data.expedition_wave) this.data.expedition_wave = 1;
        if (!this.data.expedition_diff) this.data.expedition_diff = 1;
        if (!this.data.expedition_picked) this.data.expedition_picked = {};
        if (!this.data.guild_skills) this.data.guild_skills = { hp: 0, atk: 0, def: 0 };
        if (this.data.group_id === undefined) this.data.group_id = 1;
        if (!this.data.group_name) this.data.group_name = "Làng Lá";
        if (!this.data.group_level) this.data.group_level = 1;
        if (!this.data.group_role) this.data.group_role = 1;
        if (!this.data.tower_cur_layer) this.data.tower_cur_layer = 1;
        if (!this.data.tower_layers) this.data.tower_layers = {};
        if (!this.data.tower_heros) this.data.tower_heros = {};
        if (!this.data.noend_towers) this.data.noend_towers = {};
        if (!this.data.next_secret_id) this.data.next_secret_id = 1;
    },

    _saveTimer: null,
    _dirty: false,
    save: function(immediate) {
        this._dirty = true;
        if (immediate) {
            this._flushSave();
            return;
        }
        if (this._saveTimer) return;
        var self = this;
        this._saveTimer = setTimeout(function() {
            self._saveTimer = null;
            self._flushSave();
        }, 1500);
    },
    _flushSave: function() {
        if (!this._dirty || !this.data) return;
        this._dirty = false;
        try {
            if (typeof cc !== "undefined" && cc.sys && cc.sys.localStorage) {
                cc.sys.localStorage.setItem(this.saveKey, JSON.stringify(this.data));
            }
        } catch(e) {}
    },

    initDefaultData: function() {
        this.data = {
            gold: 50000,
            stone: 500,
            sp: 120,
            team_lv: 1,
            team_exp: 0,
            vip_lv: 0,
            vip_exp: 0,
            team_name: "Nhẫn Giả",
            icon: 10010,
            guide_step: 9999,
            guide_vars: { releaseSkill: 1, callHero: 1 },
            heros: {
                10010: this.createDefaultHeroRecord(10010)
            },
            items: {},
            equip: {},
            ninja_tools: {},
            secrets: [],
            next_secret_id: 1,
            beasts: {},
            chapters: {
                "1": [{ chapter_id: 50011, star: 0 }],
                "2": [],
                "3": [],
                "16": []
            },
            daily_counts: {},
            sign_days: [],
            lv_rewards: [],
            event_claims: {},
            event_process: {},
            achievements: {},
            treasures: [],
            expedition_wave: 1,
            expedition_diff: 1,
            expedition_picked: {},
            expedition_hero_info: "",
            group_id: 1,
            group_name: "Làng Lá",
            group_level: 1,
            group_exp: 0,
            group_role: 1,
            group_contribution: 0,
            group_fund: 0,
            group_resource: 10000,
            group_icon: 20806,
            group_capacity: 30,
            group_size: 5,
            group_join_type: 1,
            group_min_lv: 30,
            guild_skills: { hp: 0, atk: 0, def: 0 },
            guild_donate_gold: 0,
            guild_donate_gem: 0,
            tower_cur_layer: 1,
            tower_layers: {},
            tower_heros: {},
            noend_towers: {},
            shops: {},
            awake_task_progress: {}
        };
        this.save();
    },

    createDefaultHeroRecord: function(hid) {
        hid = Number(hid);
        var star = 1;
        if (typeof Config !== "undefined" && Config.hero && Config.hero[hid] && Config.hero[hid].star) {
            star = Config.hero[hid].star;
        }
        return {
            id: hid,
            hero_id: hid,
            lv: 1,
            level: 1,
            exp: 0,
            quality: 1,
            star: star,
            status: 0,
            has_awake: 0,
            bagate_level: 0,
            equip_1: 0,
            equip_2: 0,
            equip_3: 0,
            equip_4: 0,
            equip_5: 0,
            equip_6: 0,
            ninja_tool_1: 0,
            ninja_tool_2: 0,
            ninja_tool_3: 0,
            ninja_tool_4: 0,
            ninja_tool_5: 0,
            ninja_tool_6: 0,
            skill_1_lv: 1,
            skill_2_lv: 0,
            skill_3_lv: 0,
            skill_4_lv: 0,
            skill_5_lv: 0,
            skill_6_lv: 0,
            skill_7_lv: 0,
            skill_8_lv: 0,
            skill_9_lv: 0,
            skill_10_lv: 0,
            skill_11_lv: 1,
            skill_12_lv: 1,
            sel_tf_skill: 0
        };
    },

    computeHeroPayload: function(hid) {
        hid = Number(hid);
        if (!this.data.heros[hid]) {
            this.data.heros[hid] = this.createDefaultHeroRecord(hid);
        }
        var h = this.data.heros[hid];
        var lv = Number(h.lv || h.level || 1);
        var qVal = Number(h.quality || 1);
        var qty = null;
        if (typeof Config !== "undefined" && Config.heroQuality) {
            for (var q = qVal; q >= 1; q--) {
                if (Config.heroQuality[q] && Config.heroQuality[q][hid]) {
                    qVal = q;
                    qty = Config.heroQuality[q][hid];
                    break;
                }
            }
        }
        h.lv = lv;
        h.level = lv;
        h.quality = qVal;

        if (qVal >= 2 && (!h.skill_2_lv || h.skill_2_lv < 1)) h.skill_2_lv = 1;
        if (qVal >= 4 && (!h.skill_3_lv || h.skill_3_lv < 1)) h.skill_3_lv = 1;
        if (qVal >= 7 && (!h.skill_4_lv || h.skill_4_lv < 1)) h.skill_4_lv = 1;
        if ((qVal >= 12 || h.has_awake) && (!h.skill_5_lv || h.skill_5_lv < 1)) h.skill_5_lv = 1;
        if (!h.skill_1_lv || h.skill_1_lv < 1) h.skill_1_lv = 1;
        if (!h.skill_11_lv || h.skill_11_lv < 1) h.skill_11_lv = 1;
        if (!h.skill_12_lv || h.skill_12_lv < 1) h.skill_12_lv = 1;

        if (typeof Config !== "undefined" && Config.hero_quality_up) {
            for (var k in Config.hero_quality_up) {
                var qUp = Config.hero_quality_up[k];
                if (qUp && qUp.is_open == 1 && qUp.new_skill > 0 && Number(k) < qVal) {
                    var oldSkLv = h["skill_" + qUp.del_skill + "_lv"] || 1;
                    if (!h["skill_" + qUp.new_skill + "_lv"] || h["skill_" + qUp.new_skill + "_lv"] < oldSkLv) {
                        h["skill_" + qUp.new_skill + "_lv"] = oldSkLv;
                    }
                }
            }
        }

        var hp = 150, atk = 20, def = 5, mp = 15, mp_def = 5, cri = 5, mp_cri = 5;
        if (qty) {
            hp = Number(qty.hp || 0) + (lv - 1) * Number(qty.hp_inc || 0);
            atk = Number(qty.atk || 0) + (lv - 1) * Number(qty.atk_inc || 0);
            def = Number(qty.def || 0) + (lv - 1) * Number(qty.def_inc || 0);
            mp = Number(qty.mp || 0) + (lv - 1) * Number(qty.mp_inc || 0);
            mp_def = Number(qty.mpdef || 0) + (lv - 1) * Number(qty.mpdef_inc || 0);
            cri = Number(qty.cri || 0);
            mp_cri = Number(qty.mp_cri || 0);
        }

        // Equipped items stats
        for (var s = 1; s <= 6; s++) {
            var eqStatus = Number(h["equip_" + s] || 0);
            if (eqStatus > 0 && typeof Config !== "undefined" && Config.equip) {
                var eqId = (qty && qty["equip_" + s]) ? qty["equip_" + s] : eqStatus;
                var eqCfg = Config.equip[eqId];
                if (eqCfg) {
                    hp += Number(eqCfg.hp || 0);
                    atk += Number(eqCfg.atk || 0);
                    def += Number(eqCfg.def || 0);
                    mp += Number(eqCfg.mp || 0);
                    mp_def += Number(eqCfg.mpdef || 0);
                    cri += Number(eqCfg.cri || 0);
                    mp_cri += Number(eqCfg.mp_cri || 0);
                }
            }
        }

        //Unlocked Tailed Beasts stats
        var heroBeasts = (this.data.beasts && this.data.beasts[hid]) ? this.data.beasts[hid] : [];
        if (heroBeasts.length > 0 && typeof Config !== "undefined" && Config.beast) {
            for (var bIdx = 0; bIdx < heroBeasts.length; bIdx++) {
                var bObj = heroBeasts[bIdx];
                var bLv = Number(bObj.lv || 1);
                var bCfg = Config.beast[bObj.beast_id] && Config.beast[bObj.beast_id][bLv];
                if (bCfg) {
                    hp += Number(bCfg.hp || 0);
                    atk += Number(bCfg.atk || 0);
                    def += Number(bCfg.def || 0);
                    mp += Number(bCfg.mp || 0);
                    mp_def += Number(bCfg.mp_def || bCfg.mpdef || 0);
                    cri += Number(bCfg.cri || 0);
                    mp_cri += Number(bCfg.mp_cri || 0);
                }
            }
        }

        // Eight Gates (BaMen) stats
        var bgLv = Number(h.bagate_level || 0);
        if (bgLv > 0 && typeof Config !== "undefined" && Config.bamen) {
            for (var g = 1; g <= bgLv; g++) {
                var gCfg = Config.bamen[g];
                if (gCfg) {
                    hp += Number(gCfg.hp || 0);
                    atk += Number(gCfg.atk || 0);
                    def += Number(gCfg.def || 0);
                    mp += Number(gCfg.chak || 0);
                    mp_def += Number(gCfg.chadef || 0);
                }
            }
        }

        // Equipped secrets (gems pos 101..106 & tactic scrolls pos 1..6) on this hero
        var secMap = {};
        if (this.data.secrets) {
            for (var si = 0; si < this.data.secrets.length; si++) {
                var sec = this.data.secrets[si];
                if (Number(sec.hero_id) === hid && Number(sec.status) === 1) {
                    var sPos = Number(sec.pos || 0);
                    if (sPos >= 1 && sPos <= 6) {
                        secMap[sPos] = sec;
                    }
                    if (typeof Config !== "undefined" && Config.equip && Config.equip[sec.equip_id]) {
                        var sCfg = Config.equip[sec.equip_id];
                        var sLv = Math.max(1, Number(sec.lv || 1));
                        hp += Number(sCfg.hp || 0) + (sLv - 1) * Number(sCfg.hp_inc || 0);
                        atk += Number(sCfg.atk || 0) + (sLv - 1) * Number(sCfg.atk_inc || 0);
                        def += Number(sCfg.def || 0) + (sLv - 1) * Number(sCfg.def_inc || 0);
                        mp += Number(sCfg.mp || 0) + (sLv - 1) * Number(sCfg.mp_inc || 0);
                        mp_def += Number(sCfg.mpdef || 0) + (sLv - 1) * Number(sCfg.mpdef_inc || 0);
                        cri += Number(sCfg.cri || 0);
                        mp_cri += Number(sCfg.mp_cri || 0);
                    }
                }
            }
        }

        return {
            id: hid,
            hero_id: hid,
            lv: lv,
            level: lv,
            exp: Number(h.exp || 0),
            quality: qVal,
            star: Number(h.star || 1),
            status: 0,
            beast: heroBeasts.length,
            has_awake: Number(h.has_awake || 0),
            bagate_level: bgLv,
            hp: Math.floor(hp),
            atk: Math.floor(atk),
            def: Math.floor(def),
            mp: Math.floor(mp),
            mp_def: Math.floor(mp_def),
            cri: Number(cri.toFixed(2)),
            mp_cri: Number(mp_cri.toFixed(2)),
            equip_1: Number(h.equip_1 || 0),
            equip_2: Number(h.equip_2 || 0),
            equip_3: Number(h.equip_3 || 0),
            equip_4: Number(h.equip_4 || 0),
            equip_5: Number(h.equip_5 || 0),
            equip_6: Number(h.equip_6 || 0),
            ninja_tool_1: Number(h.ninja_tool_1 || 0),
            ninja_tool_2: Number(h.ninja_tool_2 || 0),
            ninja_tool_3: Number(h.ninja_tool_3 || 0),
            ninja_tool_4: Number(h.ninja_tool_4 || 0),
            ninja_tool_5: Number(h.ninja_tool_5 || 0),
            ninja_tool_6: Number(h.ninja_tool_6 || 0),
            secret_1_id: secMap[1] ? Number(secMap[1].equip_id) : 0,
            secret_1_lv: secMap[1] ? Number(secMap[1].lv || 1) : 0,
            secret_2_id: secMap[2] ? Number(secMap[2].equip_id) : 0,
            secret_2_lv: secMap[2] ? Number(secMap[2].lv || 1) : 0,
            secret_3_id: secMap[3] ? Number(secMap[3].equip_id) : 0,
            secret_3_lv: secMap[3] ? Number(secMap[3].lv || 1) : 0,
            secret_4_id: secMap[4] ? Number(secMap[4].equip_id) : 0,
            secret_4_lv: secMap[4] ? Number(secMap[4].lv || 1) : 0,
            secret_5_id: secMap[5] ? Number(secMap[5].equip_id) : 0,
            secret_5_lv: secMap[5] ? Number(secMap[5].lv || 1) : 0,
            secret_6_id: secMap[6] ? Number(secMap[6].equip_id) : 0,
            secret_6_lv: secMap[6] ? Number(secMap[6].lv || 1) : 0,
            skill_1_lv: Number(h.skill_1_lv || 1),
            skill_2_lv: Number(h.skill_2_lv || 0),
            skill_3_lv: Number(h.skill_3_lv || 0),
            skill_4_lv: Number(h.skill_4_lv || 0),
            skill_5_lv: Number(h.skill_5_lv || 0),
            skill_6_lv: Number(h.skill_6_lv || 0),
            skill_7_lv: Number(h.skill_7_lv || 0),
            skill_8_lv: Number(h.skill_8_lv || 0),
            skill_9_lv: Number(h.skill_9_lv || 0),
            skill_10_lv: Number(h.skill_10_lv || 0),
            skill_11_lv: Number(h.skill_11_lv || 1),
            skill_12_lv: Number(h.skill_12_lv || 1),
            sel_tf_skill: Number(h.sel_tf_skill || 0)
        };
    },

    buildPlayerAttrPayload: function() {
        return {
            team_name: this.data.team_name || "Nhẫn Giả 1154",
            team_lv: Number(this.data.team_lv || 1),
            team_exp: Number(this.data.team_exp || 0),
            vip_lv: Number(this.data.vip_lv || 0),
            vip_exp: Number(this.data.vip_exp || 0),
            gold: Number(this.data.gold !== undefined ? this.data.gold : 50000),
            stone: Number(this.data.stone !== undefined ? this.data.stone : 500),
            sp: Number(this.data.sp !== undefined ? this.data.sp : 120),
            arena_point: Number(this.data.arena_point || 0),
            group_point: Number(this.data.group_point || 0),
            cs_group_point: Number(this.data.cs_group_point || 0),
            dark_arena_point: Number(this.data.dark_arena_point || 0),
            cs_dark_arena_point: Number(this.data.cs_dark_arena_point || 0),
            ninja_point: Number(this.data.ninja_point || 0),
            had_recharge_gift: Number(this.data.had_recharge_gift !== undefined ? this.data.had_recharge_gift : 1),
            had_vip5_gift: Number(this.data.had_vip5_gift || 0),
            had_vip9_gift: Number(this.data.had_vip9_gift || 0),
            had_vip11_gift: Number(this.data.had_vip11_gift || 0),
            had_vip13_gift: Number(this.data.had_vip13_gift || 0),
            icon: Number(this.data.icon || 80110070),
            avatar_frame_ids: [801, 802, 803, 804, 805, 806, 807, 808, 809, 810, 811]
        };
    },

    addTeamExp: function(expAdd) {
        expAdd = Number(expAdd || 0);
        if (expAdd <= 0) return;
        var lv = Number(this.data.team_lv || 1);
        var exp = Number(this.data.team_exp || 0) + expAdd;
        if (typeof Config !== "undefined" && Config.level) {
            while (Config.level[lv] && Config.level[lv].upg_exp > 0 && exp >= Config.level[lv].upg_exp) {
                exp -= Config.level[lv].upg_exp;
                lv++;
                this.data.sp = (Number(this.data.sp || 0)) + Number(Config.level[lv] ? (Config.level[lv].Present_sp || 20) : 20);
            }
        }
        this.data.team_lv = lv;
        this.data.team_exp = exp;
    },

    addHeroExp: function(hid, expAdd) {
        hid = Number(hid);
        expAdd = Number(expAdd || 0);
        if (!this.data.heros[hid] || expAdd <= 0) return;
        var h = this.data.heros[hid];
        var maxLv = Math.max(Number(this.data.team_lv || 1), 1);
        var lv = Number(h.lv || 1);
        var exp = Number(h.exp || 0) + expAdd;
        if (typeof Config !== "undefined" && Config.heroLevel) {
            while (Config.heroLevel[lv] && Config.heroLevel[lv].upg_exp > 0 && exp >= Config.heroLevel[lv].upg_exp) {
                if (lv >= maxLv) {
                    exp = Config.heroLevel[lv].upg_exp;
                    break;
                }
                exp -= Config.heroLevel[lv].upg_exp;
                lv++;
            }
        }
        h.lv = lv;
        h.level = lv;
        h.exp = exp;
    },

    changeItemAmount: function(itemId, delta, queuePush) {
        itemId = Number(itemId);
        delta = Number(delta || 0);
        if (!this.data.items) this.data.items = {};
        var cur = (this.data.items[itemId] && Number(this.data.items[itemId].amount)) || 0;
        var next = Math.max(0, cur + delta);
        if (next > 0) {
            this.data.items[itemId] = { item_id: itemId, amount: next };
        } else {
            delete this.data.items[itemId];
        }
        if (queuePush) {
            queuePush(SVRCMD.Item, { item: { item_id: itemId, amount: next } });
        }
        return next;
    },

    changeEquipAmount: function(equipId, delta, queuePush) {
        equipId = Number(equipId);
        delta = Number(delta || 0);
        if (!this.data.equip) this.data.equip = {};
        var cur = (this.data.equip[equipId] && Number(this.data.equip[equipId].amount)) || 0;
        var next = Math.max(0, cur + delta);
        if (next > 0) {
            this.data.equip[equipId] = { equip_id: equipId, amount: next };
        } else {
            delete this.data.equip[equipId];
        }
        if (queuePush) {
            queuePush(SVRCMD.Equip, { equip: { equip_id: equipId, amount: next } });
        }
        if (typeof Config !== "undefined" && Config.equip && Config.equip[equipId] && Number(Config.equip[equipId].type) === 3) {
            this.syncGemsAndSecrets(queuePush);
        }
        return next;
    },

    changeNinjaToolAmount: function(toolId, delta, queuePush) {
        toolId = Number(toolId);
        delta = Number(delta || 0);
        if (!this.data.ninja_tools) this.data.ninja_tools = {};
        var curObj = this.data.ninja_tools[toolId];
        var cur = (curObj && Number(curObj.amount !== undefined ? curObj.amount : (curObj.count || 0))) || 0;
        var next = Math.max(0, cur + delta);
        if (next > 0) {
            this.data.ninja_tools[toolId] = { ninja_tool_id: toolId, amount: next };
        } else {
            delete this.data.ninja_tools[toolId];
        }
        if (queuePush) {
            queuePush(SVRCMD.NinjaTool, { ninja_tool: { ninja_tool_id: toolId, amount: next } });
        }
        return next;
    },

    findSoulItemId: function(heroId) {
        heroId = Number(heroId);
        if (typeof gamePlayer !== "undefined" && gamePlayer.findSoulID) {
            var sid = gamePlayer.findSoulID(heroId);
            if (sid) return Number(sid);
        }
        if (typeof Config !== "undefined" && Config.item) {
            for (var k in Config.item) {
                if (Number(Config.item[k].item_type) === 2 && Number(Config.item[k].merge_id) === heroId) {
                    return Number(k);
                }
            }
        }
        return 20000 + (heroId - 10000);
    },

    syncGemsAndSecrets: function(queuePush) {
        if (!this.data.secrets) this.data.secrets = [];
        if (!this.data.equip) this.data.equip = {};
        if (typeof Config === "undefined" || !Config.equip) return;
        for (var eqId in this.data.equip) {
            var eqNum = Number(eqId);
            var eqCfg = Config.equip[eqNum];
            if (eqCfg && Number(eqCfg.type) === 3) {
                var targetAmount = Number((this.data.equip[eqNum] && this.data.equip[eqNum].amount) || 0);
                var existing = [];
                for (var si = 0; si < this.data.secrets.length; si++) {
                    if (Number(this.data.secrets[si].equip_id) === eqNum && Number(this.data.secrets[si].status) === 0) {
                        existing.push(this.data.secrets[si]);
                    }
                }
                var diff = targetAmount - existing.length;
                if (diff > 0) {
                    for (var a = 0; a < diff; a++) {
                        var nId = (this.data.next_secret_id || 100) + 1;
                        this.data.next_secret_id = nId;
                        var secObj = { id: nId, lv: 1, exp: 0, pos: 0, status: 0, hero_id: 0, equip_id: eqNum };
                        this.data.secrets.push(secObj);
                        if (queuePush) queuePush(SVRCMD.Secret, { secret: secObj });
                    }
                } else if (diff < 0) {
                    var toRemove = -diff;
                    for (var r = this.data.secrets.length - 1; r >= 0 && toRemove > 0; r--) {
                        if (Number(this.data.secrets[r].equip_id) === eqNum && Number(this.data.secrets[r].status) === 0) {
                            var rem = this.data.secrets.splice(r, 1)[0];
                            toRemove--;
                            if (queuePush) queuePush(SVRCMD.DeleteSecret, { secret: rem.id });
                        }
                    }
                }
            }
        }
    },

    addSecretEquip: function(equipId, count, queuePush) {
        equipId = Number(equipId);
        count = Math.max(1, Number(count || 1));
        if (!this.data.secrets) this.data.secrets = [];
        for (var i = 0; i < count; i++) {
            var nId = (this.data.next_secret_id || 100) + 1;
            this.data.next_secret_id = nId;
            var secObj = {
                id: nId,
                lv: 1,
                exp: 0,
                pos: 0,
                status: 0,
                hero_id: 0,
                equip_id: equipId
            };
            this.data.secrets.push(secObj);
            if (queuePush) {
                queuePush(SVRCMD.Secret, { secret: secObj });
            }
        }
    },

    generateShopData: function(shopType) {
        shopType = Number(shopType || 1);
        var infoObj = {};
        var discObj = {};
        if (typeof Config !== "undefined" && Config.shop && Config.box_drop) {
            var matched = [];
            for (var sid in Config.shop) {
                var sCfg = Config.shop[sid];
                if (Number(sCfg.shop_type || sCfg.type) === shopType) {
                    matched.push(sCfg);
                }
            }
            matched.sort(function(a, b) { return Number(a.id) - Number(b.id); });
            if (matched.length === 0) {
                for (var sid2 in Config.shop) {
                    matched.push(Config.shop[sid2]);
                    if (matched.length >= 12) break;
                }
            }
            for (var mi = 0; mi < matched.length; mi++) {
                var sc = matched[mi];
                var grp = Config.box_drop[sc.box_id];
                if (grp) {
                    var bKeys = Object.keys(grp);
                    if (bKeys.length > 0) {
                        var pickKey = bKeys[Math.floor(Math.random() * bKeys.length)];
                        var keyStr = sc.id + "_" + pickKey;
                        infoObj[keyStr] = 1;
                        discObj[keyStr] = 10;
                    }
                }
            }
        }
        return { info: infoObj, discount_info: discObj };
    },

    addOrConvertHero: function(hid, queuePush) {
        hid = Number(hid);
        if (!this.data.heros) this.data.heros = {};
        if (this.data.heros[hid]) {
            var soulId = this.findSoulItemId(hid);
            var soulNum = 18;
            if (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.HERO2SOUL) {
                soulNum = Number(ConfigGlobalVar.HERO2SOUL) || 18;
            }
            this.changeItemAmount(soulId, soulNum, queuePush);
            if (queuePush) {
                queuePush(SVRCMD.Hero2Soul, { heroId: hid });
            }
            return false;
        } else {
            this.data.heros[hid] = this.createDefaultHeroRecord(hid);
            var payload = this.computeHeroPayload(hid);
            if (queuePush) {
                queuePush(SVRCMD.Hero, { hero: payload });
            }
            return true;
        }
    },

    rollBoxDrops: function(groupId, count) {
        var results = [];
        var pool = [];
        if (typeof Config !== "undefined" && Config.box_drop && Config.box_drop[groupId]) {
            var grp = Config.box_drop[groupId];
            for (var k in grp) {
                pool.push(grp[k]);
            }
        }
        if (pool.length === 0 && typeof Config !== "undefined" && Config.item) {
            for (var id in Config.item) {
                var it = Config.item[id];
                if (it.item_type == 3 || it.item_type == 4) {
                    pool.push({ type: (it.item_type == 3 ? 6 : 7), item_id: Number(id), amount: 2 });
                }
            }
        }
        for (var i = 0; i < count; i++) {
            if (pool.length > 0) {
                var pick = pool[Math.floor(Math.random() * pool.length)];
                var dType = Number(pick.type || 1);
                // Prefer soulstones/chips/items/equips over whole heroes in normal draws (unless 5% lucky roll)
                if (dType === 3 && Math.random() > 0.08) {
                    var soulId = this.findSoulItemId(pick.item_id);
                    results.push({ type: 6, item_id: soulId, amount: 3 });
                } else {
                    results.push({
                        type: dType,
                        item_id: Number(pick.item_id),
                        amount: Number(pick.amount || 1)
                    });
                }
            } else {
                results.push({ type: 6, item_id: 30002, amount: 2 });
            }
        }
        return results;
    },

    handle: function(cmd, params, extRespond, extQueuePush) {
        var self = this;
        this.loadSave();
        this.logPacket("OFFLINE_REQ", cmd, params);
        var pendingPushes = [];
        var queuePush = function(pCmd, pData) {
            var pPkg = {
                "func_name": pCmd,
                "data": pData !== undefined ? pData : {},
                "error": null
            };
            self.logPacket("OFFLINE_PUSH", pCmd, pPkg.data);
            pendingPushes.push({
                cmd: pCmd,
                pkg: pPkg
            });
        };
        var respond = function(data, err) {
            self.save();
            var pkg = {
                "func_name": cmd,
                "data": data !== undefined ? data : {},
                "error": err || null
            };
            self.logPacket("OFFLINE_RES", cmd, pkg.data);

            if (typeof extRespond === "function") {
                if (typeof extQueuePush === "function") {
                    for (var i = 0; i < pendingPushes.length; i++) {
                        extQueuePush(pendingPushes[i].cmd, pendingPushes[i].pkg.data);
                    }
                }
                extRespond(data, err);
                return;
            }

            if (cmd === SVRCMD.Time) {
                if (typeof Cache !== "undefined" && Cache.setServerTime) {
                    Cache.setServerTime(pkg.data);
                }
                if (typeof Game !== "undefined" && typeof Cache !== "undefined" && Cache.getServerTime) {
                    Game.lastHeartBeat = Cache.getServerTime();
                }
            }
            if (typeof EventDispatcher !== "undefined" && EventDispatcher.shared) {
                self.scheduleLater(function() {
                    for (var i = 0; i < pendingPushes.length; i++) {
                        EventDispatcher.shared().dispatchEvent(pendingPushes[i].cmd, pendingPushes[i].pkg);
                    }
                    EventDispatcher.shared().dispatchEvent(cmd, pkg);
                }, 0.01);
            }
        };

        // 1. Server Time & Login
        if (cmd === SVRCMD.Time) {
            var nowSec = Math.floor(Date.now() / 1000);
            respond({ time: nowSec, offset: 25200 });
            return true;
        }
        if (cmd === SVRCMD.Login) {
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.CreateRole) {
            var newName = (params && params[0]) || "Nhẫn Giả";
            this.data.team_name = newName;
            if (typeof gamePlayer !== "undefined") gamePlayer.team_name = newName;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.PlayerInfo) {
            var nowSec = Math.floor(Date.now() / 1000);
            var pIdNum = parseInt(this.data.player_id, 10) || 1;
            respond({
                player: {
                    id: pIdNum,
                    user_id: pIdNum,
                    user_name: this.data.team_name || "Nhẫn Giả",
                    platform: "ninja",
                    create_time: this.data.create_time || (nowSec - 86400),
                    last_signin_time: nowSec,
                    last_signin_ip: "127.0.0.1",
                    avatar_frame_ids: [801, 802, 803, 804, 805, 806, 807, 808, 809, 810, 811]
                },
                player_attr: this.buildPlayerAttrPayload()
            });
            return true;
        }
        if (cmd === SVRCMD.BagInfo) {
            this.syncGemsAndSecrets(queuePush);
            respond({
                items: this.data.items || {},
                equip: this.data.equip || {},
                ninja_tools: this.data.ninja_tools || {}
            });
            return true;
        }
        if (cmd === SVRCMD.GetSecrets) {
            this.syncGemsAndSecrets(queuePush);
            respond({ secrets: this.data.secrets || [] });
            return true;
        }
        if (cmd === SVRCMD.ChapterInfo) {
            respond({ chapters: this.data.chapters });
            return true;
        }
        if (cmd === SVRCMD.GetHeros) {
            var outHeros = {};
            for (var hid in (this.data.heros || {})) {
                outHeros[hid] = this.computeHeroPayload(hid);
            }
            respond({ heros: outHeros });
            return true;
        }

        // 2. Tutorial & Guide State
        if (cmd === SVRCMD.GetLastGuide) {
            respond({ lastGuideId: (this.data.guide_step !== undefined) ? this.data.guide_step : 0 });
            return true;
        }
        if (cmd === SVRCMD.SetLastGuide) {
            if (params && params.length) {
                var newStep = Number(params[0]);
                this.data.guide_step = newStep;
                if (newStep >= 1 && !this.data.heros[10070]) {
                    this.data.heros[10070] = this.createDefaultHeroRecord(10070);
                    var leePayload = this.computeHeroPayload(10070);
                    queuePush(SVRCMD.Hero, { hero: leePayload });
                }
            }
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.GetLastDialog) {
            respond({ lastDialogId: 999999 });
            return true;
        }
        if (cmd === SVRCMD.SetLastDialog) {
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.Get) {
            var key = (params && params[0]) || "";
            var v = (this.data.guide_vars && this.data.guide_vars[key] !== undefined) ? this.data.guide_vars[key] : (key === "releaseSkill" ? 1 : 0);
            respond({ value: v });
            return true;
        }
        if (cmd === SVRCMD.Set) {
            var key = (params && params[0]);
            var v = (params && params[1]);
            this.data.guide_vars[key] = v;
            respond({ status: 1 });
            return true;
        }

        // 3. TreasureBoxView ("Shop Bí Kíp"), DailyInfo & ServerInfo
        if (cmd === SVRCMD.DailyInfo) {
            var nowSec = Math.floor(Date.now() / 1000);
            var dc = {
                "BRONZE_BOX_TODAY_BUT_COUNT": Number(this.data.bronze_count || 0),
                "BRONZE_BOX_LAST_BUT_TIME": Number(this.data.bronze_time || 0),
                "GOLD_BOX_COUNT": Number(this.data.gold_box_count || 0),
                "GOLD_BOX_LAST_BUY_TIME": Number(this.data.gold_box_time || 0),
                "PLAYER_CARD_EXPIRE_TIME": nowSec + 86400 * 30,
                "MONTH_CARD_FOREVER": 1,
                "PLAYER_GOLD_CARD_EXPIRE_TIME": nowSec + 86400 * 30,
                "PLAYER_WHITE_GOLD_EXPIRE_TIME": nowSec + 86400 * 30,
                "PLAYER_WEEK_CARD_EXPIRE_TIME": nowSec + 86400 * 30,
                "PLAYER_PLATINUM_WEEK_CARD_EXPIRE_TIME": nowSec + 86400 * 30,
                "DUG_COUNT": 0,
                "PLUNDER_COUNT": 0
            };
            if (typeof Config !== "undefined" && Config.daily_task) {
                for (var dtId in Config.daily_task) {
                    dc["PLAYER_DIALY_TASK_" + dtId] = 99;
                }
            }
            if (this.data.daily_counts) {
                for (var dk in this.data.daily_counts) {
                    dc[dk] = this.data.daily_counts[dk];
                }
            }
            respond({ dailyCount: dc });
            return true;
        }
        if (cmd === SVRCMD.ServerInfo) {
            var nowSec = Math.floor(Date.now() / 1000);
            var pInfo = {
                "GOLD_BOX_BUY_COUNT": 0,
                "GOLD_BOX_COUNT": Number(this.data.gold_box_count || 0),
                "GOLD_BOX_LAST_BUY_TIME": Number(this.data.gold_box_time || 0),
                "BRONZE_BOX_TODAY_BUT_COUNT": Number(this.data.bronze_count || 0),
                "BRONZE_BOX_LAST_BUT_TIME": Number(this.data.bronze_time || 0),
                "FIRST_BUY_NONE_FREE_BRONZE_BOX": Number(this.data.first_bronze_paid || 0),
                "FIRST_BUY_NONE_FREE_GOLD_BOX": Number(this.data.first_gold_paid || 0),
                "PLAYER_CARD_EXPIRE_TIME": nowSec + 86400 * 30,
                "MONTH_CARD_FOREVER": 1,
                "PLAYER_GOLD_CARD_EXPIRE_TIME": nowSec + 86400 * 30,
                "PLAYER_WHITE_GOLD_EXPIRE_TIME": nowSec + 86400 * 30,
                "PLAYER_WEEK_CARD_EXPIRE_TIME": nowSec + 86400 * 30,
                "PLAYER_PLATINUM_WEEK_CARD_EXPIRE_TIME": nowSec + 86400 * 30
            };
            if (this.data.achievements) {
                for (var ak in this.data.achievements) {
                    pInfo[ak] = this.data.achievements[ak];
                }
            }
            if (this.data.daily_counts) {
                for (var dk2 in this.data.daily_counts) {
                    pInfo[dk2] = this.data.daily_counts[dk2];
                }
            }
            respond({ playerInfo: pInfo });
            return true;
        }
        if (cmd === SVRCMD.BuyBox) {
            var boxTag = Number((params && params[0]) || 1);
            var count = Number((params && params[1]) || 1);
            var nowSec = Math.floor(Date.now() / 1000);
            var items = [];

            if (boxTag === 1) {
                // Bronze Box
                var isTutorialFirstBronze = (!this.data.heros[10020] && (this.data.bronze_count === 0 || this.data.guide_step <= 3));
                var isFreeBronze = (this.data.bronze_count < 5 && (nowSec - Number(this.data.bronze_time || 0) >= 600));
                if (count === 1 && isFreeBronze) {
                    this.data.bronze_count = Number(this.data.bronze_count || 0) + 1;
                    this.data.bronze_time = nowSec;
                } else {
                    var price = 10000;
                    if (typeof Config !== "undefined" && Config.box && Config.box[1]) price = Number(Config.box[1].open_price || 10000);
                    var totalGold = (count === 10) ? Math.floor(price * 10 * 0.9) : price;
                    this.data.gold = Math.max(0, Number(this.data.gold || 0) - totalGold);
                    this.data.first_bronze_paid = 1;
                }
                // Bonus EXP item 10010
                this.changeItemAmount(10010, count, queuePush);
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

                if (count === 1 && isTutorialFirstBronze) {
                    this.addOrConvertHero(10020, queuePush); // Naruto
                    items.push({ type: 3, item_id: 10020, amount: 1 });
                } else {
                    var grpId = (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.NORMAL_BRONZE_ID) ? ConfigGlobalVar.NORMAL_BRONZE_ID : 101;
                    items = this.rollBoxDrops(grpId, count);
                    for (var i = 0; i < items.length; i++) {
                        var d = items[i];
                        if (d.type === 3) {
                            this.addOrConvertHero(d.item_id, queuePush);
                        } else if (d.type === 2) {
                            this.changeEquipAmount(d.item_id, d.amount, queuePush);
                        } else {
                            this.changeItemAmount(d.item_id, d.amount, queuePush);
                        }
                    }
                }
            } else if (boxTag === 2) {
                // Gold Box
                var isTutorialFirstGold = (!this.data.heros[10040] && (this.data.gold_box_count === 0 || this.data.guide_step <= 4));
                var isFreeGold = (nowSec - Number(this.data.gold_box_time || 0) >= 86400);
                if (count === 1 && isFreeGold) {
                    this.data.gold_box_count = Number(this.data.gold_box_count || 0) + 1;
                    this.data.gold_box_time = nowSec;
                } else {
                    var price = 288;
                    if (typeof Config !== "undefined" && Config.box && Config.box[2]) price = Number(Config.box[2].open_price || 288);
                    var totalStone = (count === 10) ? Math.floor(price * 10 * 0.9) : price;
                    this.data.stone = Math.max(0, Number(this.data.stone || 0) - totalStone);
                    this.data.first_gold_paid = 1;
                }
                // Bonus EXP item 10020
                this.changeItemAmount(10020, count, queuePush);
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

                if (count === 1 && isTutorialFirstGold) {
                    this.addOrConvertHero(10040, queuePush); // Sakura
                    items.push({ type: 3, item_id: 10040, amount: 1 });
                } else {
                    var grpId = (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.NORMAL_GOLD_ID) ? ConfigGlobalVar.NORMAL_GOLD_ID : 201;
                    items = this.rollBoxDrops(grpId, count);
                    for (var i = 0; i < items.length; i++) {
                        var d = items[i];
                        if (d.type === 3) {
                            this.addOrConvertHero(d.item_id, queuePush);
                        } else if (d.type === 2) {
                            this.changeEquipAmount(d.item_id, d.amount, queuePush);
                        } else {
                            this.changeItemAmount(d.item_id, d.amount, queuePush);
                        }
                    }
                }
            } else {
                // Mystery Box
                var price = 400;
                if (typeof Config !== "undefined" && Config.box && Config.box[3]) price = Number(Config.box[3].open_price || 400);
                var totalStone = (count === 10) ? 3000 : price;
                this.data.stone = Math.max(0, Number(this.data.stone || 0) - totalStone);
                this.changeItemAmount(10030, count, queuePush);
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

                var grpId = 301;
                if (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.MYSTER_BOX_IDS) {
                    var arr = String(ConfigGlobalVar.MYSTER_BOX_IDS).split(",");
                    grpId = Number(arr[new Date().getDay()] || arr[0] || 301);
                }
                items = this.rollBoxDrops(grpId, count);
                for (var i = 0; i < items.length; i++) {
                    var d = items[i];
                    if (d.type === 3) {
                        this.addOrConvertHero(d.item_id, queuePush);
                    } else if (d.type === 2) {
                        this.changeEquipAmount(d.item_id, d.amount, queuePush);
                    } else {
                        this.changeItemAmount(d.item_id, d.amount, queuePush);
                    }
                }
            }
            respond({ items: items });
            return true;
        }
        if (cmd === SVRCMD.Hero2Soul) {
            respond({ status: 1, heroId: (params && params[0]) || 0 });
            return true;
        }

        // 4. Battles & Chapter Progression
        if (cmd === SVRCMD.BeforeNoEndTowerFight) {
            var diff = Number((params && params[1]) || 10);
            this.data.last_noend_diff = diff;
            respond({ sign: "NOEND_" + diff, seed: 123456789, difficulty: diff });
            return true;
        }
        if (cmd === SVRCMD.BeforeFight || cmd === SVRCMD.BeforeTowerFight || cmd === SVRCMD.BeforeTaskFight || cmd === SVRCMD.BeforeSchoolFight || cmd === SVRCMD.BeforeSpecialFight) {
            var cid = Number((params && params[0]) || 50011);
            if (!isNaN(cid) && cid >= 50000) {
                this.data.last_fight_cid = cid;
            }
            if (params && params[2]) {
                this.data.last_fight_heros = String(params[2]).split(",");
            }
            var dropItems = [];
            if (typeof Config !== "undefined" && Config.chapter && Config.chapter[cid]) {
                var chCfg = Config.chapter[cid];
                for (var di = 1; di <= 3; di++) {
                    var dropId = chCfg["drop_id_" + di];
                    if (dropId && Config.equip && Config.equip[dropId]) {
                        dropItems.push({ type: 2, item_id: Number(dropId), amount: 1 });
                    } else if (dropId && Config.item && Config.item[dropId]) {
                        dropItems.push({ type: 1, item_id: Number(dropId), amount: 1 });
                    }
                }
            }
            respond({ sign: String(cid || "OFFLINE_SIGN"), items: dropItems });
            return true;
        }
        if (cmd === SVRCMD.AfterFight) {
            var cid = Number((params && params[0]) || this.data.last_fight_cid || 50011);
            var star = Number((params && params[1]) || 3);
            if (!this.data.chapters[cid]) {
                this.data.chapters[cid] = { id: cid, star: star };
            } else if (star > (this.data.chapters[cid].star || 0)) {
                this.data.chapters[cid].star = star;
            }
            if (!this.data.chapter_counts) this.data.chapter_counts = {};
            var cInfo = this.data.chapter_counts[cid] || { todayCount: 0, resetCount: 0 };
            cInfo.todayCount = Number(cInfo.todayCount || 0) + 1;
            this.data.chapter_counts[cid] = cInfo;

            var chCfg = (typeof Config !== "undefined" && Config.chapter && Config.chapter[cid]) ? Config.chapter[cid] : null;
            var goldReward = chCfg ? Number(chCfg.gold || 500) : 500;
            var expReward = chCfg ? Number(chCfg.exp || 6) : 6;
            var spCost = chCfg ? Number(chCfg.sp_cost || 6) : 6;
            this.data.sp = Math.max(0, Number(this.data.sp || 120) - spCost);
            this.data.gold = Number(this.data.gold || 0) + goldReward;
            this.addTeamExp(expReward);
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

            var dropItems = [];
            if (chCfg) {
                for (var di = 1; di <= 3; di++) {
                    var dropId = chCfg["drop_id_" + di];
                    if (dropId) {
                        if (Config.equip && Config.equip[dropId]) {
                            this.changeEquipAmount(dropId, 1, queuePush);
                            dropItems.push({ type: 2, item_id: Number(dropId), amount: 1 });
                        } else if (Config.item && Config.item[dropId]) {
                            this.changeItemAmount(dropId, 1, queuePush);
                            dropItems.push({ type: 1, item_id: Number(dropId), amount: 1 });
                        }
                    }
                }
            }
            respond({ isFirst3Star: true, gold: goldReward, exp: expReward, items: dropItems });
            return true;
        }
        if (cmd === SVRCMD.Sweep) {
            var cid = Number((params && params[0]) || 50011);
            var diff = Number((params && params[1]) || 1);
            var times = Number((params && params[2]) || 1);

            var chCfg = (typeof Config !== "undefined" && Config.chapter && Config.chapter[cid]) ? Config.chapter[cid] : null;
            var goldPer = chCfg ? Number(chCfg.gold || 500) : (diff === 2 ? 1100 : 500);
            var expPer = chCfg ? Number(chCfg.exp || 6) : (diff === 2 ? 10 : 6);
            var spPer = chCfg ? Number(chCfg.sp_cost || 6) : (diff === 2 ? 12 : 6);

            // 1. Chapter daily battle limit
            if (!this.data.chapter_counts) this.data.chapter_counts = {};
            var cInfo = this.data.chapter_counts[cid] || { todayCount: 0, resetCount: 0 };
            cInfo.todayCount = Number(cInfo.todayCount || 0) + times;
            this.data.chapter_counts[cid] = cInfo;

            // 2. Stamina cost
            var totalSpCost = spPer * times;
            this.data.sp = Math.max(0, Number(this.data.sp || 120) - totalSpCost);

            // 3. Sweep tickets (40010) or Diamond sweep (5 diamonds/run)
            var curTickets = Number(this.data.items[40010] || 0);
            if (curTickets >= times) {
                this.changeItemAmount(40010, -times, queuePush);
            } else {
                if (curTickets > 0) {
                    this.changeItemAmount(40010, -curTickets, queuePush);
                }
                var remainDiamondRuns = times - Math.max(0, curTickets);
                var diamondCost = remainDiamondRuns * 5;
                this.data.stone = Math.max(0, Number(this.data.stone || 0) - diamondCost);
            }

            // 4. Team Exp & Gold
            this.data.gold = Number(this.data.gold || 0) + goldPer * times;
            this.addTeamExp(expPer * times);
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

            // 5. Drops for each run
            var allItems = [];
            for (var t = 0; t < times; t++) {
                var roundDrops = [];
                if (chCfg) {
                    for (var di = 1; di <= 3; di++) {
                        var dropId = chCfg["drop_id_" + di];
                        if (dropId) {
                            if (Config.equip && Config.equip[dropId]) {
                                this.changeEquipAmount(dropId, 1, queuePush);
                                roundDrops.push({ type: 2, item_id: Number(dropId), amount: 1 });
                            } else if (Config.item && Config.item[dropId]) {
                                this.changeItemAmount(dropId, 1, queuePush);
                                roundDrops.push({ type: 1, item_id: Number(dropId), amount: 1 });
                            }
                        }
                    }
                }
                if (roundDrops.length === 0) {
                    this.changeItemAmount(10010, 1, queuePush);
                    roundDrops.push({ type: 1, item_id: 10010, amount: 1 });
                }
                allItems.push(roundDrops);
            }

            respond({
                exp: expPer,
                gold: goldPer * times,
                allItems: allItems
            });
            return true;
        }

        // 5. Hero Progression: Equip, Quality Rank-Up, Skills, BaMen, Awaken, UseItem
        if (cmd === SVRCMD.LearnEquip || cmd === SVRCMD.HeroEquip) {
            var equipId = Number((params && params[0]) || 0);
            var heroId = Number((params && params[1]) || 0);
            var slotIdx = Number((params && params[2]) || 1);
            if (this.data.heros[heroId]) {
                if (!self.canDeductEquip(equipId, 1)) {
                    return respond({}, { code: 1, msg: "Không có trang bị trong túi!" });
                }
                self.deductEquip(equipId, 1, queuePush);
                this.data.heros[heroId]["equip_" + slotIdx] = equipId || 1;
                var hPayload = this.computeHeroPayload(heroId);
                queuePush(SVRCMD.Hero, { hero: hPayload });
            }
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.UpgradeQuality) {
            var heroId = Number((params && params[0]) || 0);
            if (this.data.heros[heroId]) {
                var h = this.data.heros[heroId];
                var oldQ = Number(h.quality || 1);
                var nextQ = oldQ + 1;
                if (typeof Config !== "undefined" && Config.heroQuality && Config.heroQuality[nextQ] && Config.heroQuality[nextQ][heroId]) {
                    if (Config.hero_quality_up && Config.hero_quality_up[oldQ]) {
                        var qUp = Config.hero_quality_up[oldQ];
                        if (qUp.soul_count > 0) {
                            this.changeItemAmount(this.findSoulItemId(heroId), -Number(qUp.soul_count), queuePush);
                        }
                        if (qUp.item_id > 0 && qUp.item_count > 0) {
                            this.changeItemAmount(Number(qUp.item_id), -Number(qUp.item_count), queuePush);
                        }
                    }
                    h.quality = nextQ;
                    h.equip_1 = 0;
                    h.equip_2 = 0;
                    h.equip_3 = 0;
                    h.equip_4 = 0;
                    h.equip_5 = 0;
                    h.equip_6 = 0;
                    if (nextQ >= 12) {
                        h.has_awake = 1;
                    }
                }
                var hPayload = this.computeHeroPayload(heroId);
                queuePush(SVRCMD.Hero, { hero: hPayload });
            }
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.SkillUpgradeInfo) {
            respond({ leftCount: 9999, point: 9999, lastTime: Math.floor(Date.now() / 1000) });
            return true;
        }
        if (cmd === SVRCMD.UpgradeSkill) {
            var heroId = Number((params && params[0]) || 0);
            var skillParam = Number((params && params[1]) || 1);
            var newLv = 2;
            if (this.data.heros[heroId]) {
                var h = this.data.heros[heroId];
                var skillIndex = skillParam;
                if (skillParam > 12 && typeof Config !== "undefined" && Config.hero && Config.hero[heroId]) {
                    var hCfg = Config.hero[heroId];
                    for (var sIdx = 1; sIdx <= 12; sIdx++) {
                        if (Number(hCfg["skill_id_" + sIdx]) === skillParam) {
                            skillIndex = sIdx;
                            break;
                        }
                    }
                }
                if (skillIndex < 1 || skillIndex > 12) skillIndex = 1;
                var curLv = Number(h["skill_" + skillIndex + "_lv"] !== undefined ? h["skill_" + skillIndex + "_lv"] : 0);

                // Enforce exact skill limits: skill 1,2 max 80; skill 3 max 60; skill 4,5 max 40
                var maxLv = 80;
                if (skillIndex === 3 || skillIndex === 8) maxLv = 60;
                else if (skillIndex === 4 || skillIndex === 5 || skillIndex === 9 || skillIndex === 10) maxLv = 40;

                newLv = Math.min(maxLv, curLv + 1);
                var costGold = 100 * curLv;
                if (typeof Config !== "undefined" && Config.skillLevel && Config.skillLevel[curLv] && Config.skill && Config.skill[skillParam]) {
                    var q = Config.skill[skillParam].quality || 1;
                    costGold = Number(Config.skillLevel[curLv]["gold_cost_" + q] || costGold);
                }
                if (!self.canDeductGold(costGold)) {
                    return respond({}, { code: 1, msg: "Không đủ Vàng để nâng cấp kỹ năng!" });
                }
                self.deductGold(costGold, queuePush);
                h["skill_" + skillIndex + "_lv"] = newLv;
                if (skillIndex <= 5 && Number(h["skill_" + (skillIndex + 5) + "_lv"] || 0) > 0) {
                    h["skill_" + (skillIndex + 5) + "_lv"] = newLv;
                } else if (skillIndex >= 6 && skillIndex <= 10) {
                    h["skill_" + (skillIndex - 5) + "_lv"] = newLv;
                }
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            respond({ skillLv: newLv, leftCount: 9999, point: 9999, lastTime: Math.floor(Date.now() / 1000) });
            return true;
        }
        if (cmd === SVRCMD.SelectTfSkill) {
            var heroId = Number((params && params[0]) || 0);
            var skillId = Number((params && params[1]) || 0);
            if (this.data.heros[heroId]) {
                this.data.heros[heroId].sel_tf_skill = skillId;
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            respond({ status: 1, selTfSkill: skillId });
            return true;
        }
        if (cmd === SVRCMD.UpgradeTfSkill) {
            var heroId = Number((params && params[0]) || 0);
            var skillId = Number((params && params[1]) || 0);
            var targetNewLv = 2;
            if (this.data.heros[heroId] && typeof Config !== "undefined" && Config.hero && Config.hero[heroId]) {
                var h = this.data.heros[heroId];
                var hCfg = Config.hero[heroId];
                if (hCfg.skill_id_11 == skillId) {
                    var curLv = Number(h.skill_11_lv || 1);
                    targetNewLv = Math.min(6, curLv + 1);
                    h.skill_11_lv = targetNewLv;
                } else if (hCfg.skill_id_12 == skillId) {
                    var curLv = Number(h.skill_12_lv || 1);
                    targetNewLv = Math.min(6, curLv + 1);
                    h.skill_12_lv = targetNewLv;
                }
                this.changeItemAmount(this.findSoulItemId(heroId), -10, queuePush);
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            respond({ status: 1, skillLv: targetNewLv });
            return true;
        }
        if (cmd === SVRCMD.GetHeroAwakeTasks) {
            var heroId = Number((params && params[0]) || 0);
            var heroCfg = (typeof Config !== "undefined" && Config.hero) ? Config.hero[heroId] : null;
            var taskIds = [];
            if (heroCfg && heroCfg.awake_task_ids) {
                taskIds = String(heroCfg.awake_task_ids).split("/");
            }
            var respData = {};
            var isAwakened = (this.data.heros[heroId] && Number(this.data.heros[heroId].has_awake) === 1);
            var isTaskDone = (this.data.awake_task_progress && this.data.awake_task_progress[heroId] === 1);
            for (var ti = 0; ti < taskIds.length; ti++) {
                var tid = taskIds[ti];
                if (tid) {
                    respData[String(tid)] = (isAwakened || isTaskDone) ? 1 : 0;
                }
            }
            respond(respData);
            return true;
        }
        if (cmd === SVRCMD.GenerateAwakeTask) {
            var heroId = Number((params && params[0]) || 0);
            var heroCfg = (typeof Config !== "undefined" && Config.hero) ? Config.hero[heroId] : null;
            var taskIds = [];
            if (heroCfg && heroCfg.awake_task_ids) {
                taskIds = String(heroCfg.awake_task_ids).split("/");
            }
            var activeTaskId = (taskIds.length > 0) ? Number(taskIds[taskIds.length - 1]) : 16461;
            this.data.active_awake_hero = heroId;
            this.data.cur_task_id = activeTaskId;
            this.data.task_id = activeTaskId;
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.UpgradeBaMen) {
            var heroId = Number((params && params[0]) || 0);
            var targetLv = Number((params && params[1]) || 0);
            var respLv = 1;
            if (this.data.heros[heroId]) {
                var h = this.data.heros[heroId];
                var curBg = Number(h.bagate_level || 0);
                var nextBg = targetLv > 0 ? targetLv : (curBg + 1);
                if (nextBg > 200) nextBg = 200;
                h.bagate_level = nextBg;
                respLv = nextBg;

                var costItemCount = 5;
                var costGold = nextBg * 10000;
                if (typeof Config !== "undefined" && Config.bamen && Config.bamen[nextBg]) {
                    var bgCfg = Config.bamen[nextBg];
                    costItemCount = Number(bgCfg.item_count || 5);
                    costGold = Number(bgCfg.gold || costGold);
                }
                this.changeItemAmount(10140, -costItemCount, queuePush);
                if (!self.canDeductGold(costGold)) {
                    return respond({}, { code: 1, msg: "Không đủ Vàng để mở Bát Môn!" });
                }
                if (bmCfg.item_id && bmCfg.item_amount) {
                    if (!self.canDeductItem(bmCfg.item_id, bmCfg.item_amount)) {
                        return respond({}, { code: 1, msg: "Không đủ nguyên liệu để mở Bát Môn!" });
                    }
                    self.deductItem(bmCfg.item_id, bmCfg.item_amount, queuePush);
                }
                self.deductGold(costGold, queuePush);

                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            respond({ status: 1, bagate_level: respLv });
            return true;
        }
        if (cmd === SVRCMD.UseItem) {
            var itemId = Number((params && params[0]) || 0);
            var param1 = (params && params.length >= 2) ? Number(params[1] || 0) : 0;
            var param2 = (params && params.length >= 3) ? Number(params[2] || 0) : 0;
            var count = Math.max(1, param2 || param1 || 1);
            var targetHeroId = param1;
            var itCfg = (typeof Config !== "undefined" && Config.item && Config.item[itemId]) ? Config.item[itemId] : null;
            var outItems = [];

            if (itCfg) {
                var iType = Number(itCfg.item_type || 0);
                if ((iType === 1 || (typeof Config !== "undefined" && Config.expItem && Config.expItem[itemId])) && targetHeroId > 0 && this.data.heros[targetHeroId]) {
                    // Case 1: Hero EXP book (single or Quick Upgrade in UpgradeView.js)
                    this.changeItemAmount(itemId, -count, queuePush);
                    var perExp = 60;
                    if (typeof Config !== "undefined" && Config.expItem && Config.expItem[itemId] && Config.expItem[itemId].add_exp) {
                        perExp = Number(Config.expItem[itemId].add_exp);
                    } else if (itCfg.add_hero_exp) {
                        perExp = Number(itCfg.add_hero_exp);
                    }
                    this.addHeroExp(targetHeroId, perExp * count);
                    queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(targetHeroId) });
                } else if (iType === 2) {
                    // Case 2: Hero Soul (Hồn Ninja 20010..21060) -> Summon Ninja from shards
                    var summonHeroId = Number(targetHeroId || itCfg.merge_id || itCfg.hero_id || 0);
                    var needSoul = param2 > 0 ? param2 : ((typeof Config !== "undefined" && Config.hero && Config.hero[summonHeroId]) ? Number(Config.hero[summonHeroId].sum_soul || 10) : 10);
                    var goldCost = (typeof Config !== "undefined" && Config.hero && Config.hero[summonHeroId]) ? Number(Config.hero[summonHeroId].sum_gold || 0) : 0;
                    this.changeItemAmount(itemId, -needSoul, queuePush);
                    if (goldCost > 0) {
                        this.data.gold = Math.max(0, Number(this.data.gold || 0) - goldCost);
                        queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                    }
                    if (summonHeroId > 0) {
                        this.addOrConvertHero(summonHeroId, queuePush);
                    }
                } else if (iType === 3) {
                    // Case 3: Ninjutsu Shard (Mảnh Thuật 30101..31705) -> Synthesize Ninjutsu Equip
                    var eqId = Number(itCfg.merge_id || itCfg.equip_id || 0);
                    var eqCfg = (typeof Config !== "undefined" && Config.equip && Config.equip[eqId]) ? Config.equip[eqId] : null;
                    var needChip = eqCfg ? Number(eqCfg.forge_amount || 5) : 5;
                    var goldCost2 = Number(itCfg.item_com_coin || (eqCfg && eqCfg.forge_coin) || 5000);
                    this.changeItemAmount(itemId, -needChip, queuePush);
                    this.data.gold = Math.max(0, Number(this.data.gold || 0) - goldCost2);
                    queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                    if (eqId > 0) {
                        if (eqId >= 30000) {
                            this.addSecretEquip(eqId, 1, queuePush);
                        } else {
                            this.changeEquipAmount(eqId, 1, queuePush);
                        }
                    }
                } else if (iType === 12) {
                    // Case 4: Ninja Tool Chest (Rương Nhẫn Cụ 11010, 11020, 11021, 11030)
                    this.changeItemAmount(itemId, -count, queuePush);
                    var boxId = Number(itCfg.merge_id || 52003);
                    var drops = this.rollBoxDrops(boxId, count);
                    for (var dri = 0; dri < drops.length; dri++) {
                        var dr = drops[dri];
                        if (dr.type === 13 || (typeof Config !== "undefined" && Config.ninja_tool && Config.ninja_tool[dr.item_id])) {
                            this.changeNinjaToolAmount(dr.item_id, dr.amount, queuePush);
                            outItems.push({ type: 13, item_id: dr.item_id, amount: dr.amount });
                        } else if (dr.type === 2) {
                            if (dr.item_id >= 30000) {
                                this.addSecretEquip(dr.item_id, dr.amount, queuePush);
                            } else {
                                this.changeEquipAmount(dr.item_id, dr.amount, queuePush);
                            }
                            outItems.push({ type: 2, item_id: dr.item_id, amount: dr.amount });
                        } else {
                            this.changeItemAmount(dr.item_id, dr.amount, queuePush);
                            outItems.push({ type: 1, item_id: dr.item_id, amount: dr.amount });
                        }
                    }
                } else {
                    // Consumable / Resource pack
                    this.changeItemAmount(itemId, -count, queuePush);
                    var goldAdd = Number(itCfg.add_gold || itCfg.sell_price || 0) * count;
                    var stoneAdd = Number(itCfg.add_stone || 0) * count;
                    var spAdd = Number(itCfg.add_sp || 0) * count;
                    if (goldAdd > 0) {
                        this.data.gold = Number(this.data.gold || 0) + goldAdd;
                        outItems.push({ type: 3, item_id: 0, amount: goldAdd });
                    }
                    if (stoneAdd > 0) {
                        this.data.stone = Number(this.data.stone || 0) + stoneAdd;
                        outItems.push({ type: 4, item_id: 0, amount: stoneAdd });
                    }
                    if (spAdd > 0) {
                        this.data.sp = Number(this.data.sp || 0) + spAdd;
                        outItems.push({ type: 5, item_id: 0, amount: spAdd });
                    }
                    if (goldAdd > 0 || stoneAdd > 0 || spAdd > 0) {
                        queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                    }
                }
            }
            respond({ success: 1, status: 1, use_item_id: itemId, items: outItems });
            return true;
        }

        // 6. Tailed Beasts ("Vĩ Thú Giải Ấn" - TailsUpgrade.js)
        if (cmd === SVRCMD.BeastInfo) {
            respond({ Beasts: this.data.beasts || {} });
            return true;
        }
        if (cmd === SVRCMD.UnlockBreast) {
            var heroId = Number((params && params[0]) || 0);
            if (!this.data.beasts[heroId]) this.data.beasts[heroId] = [];
            var curList = this.data.beasts[heroId];
            var nextIdx = curList.length;
            if (nextIdx < 9) {
                var beastId = 30001 + nextIdx;
                var needSouls = [10, 20, 30, 50, 80, 120, 170, 230, 300];
                if (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.BEAST_UNLOCK_NEED_SOUL) {
                    needSouls = String(ConfigGlobalVar.BEAST_UNLOCK_NEED_SOUL).split(",");
                }
                var costSoul = Number(needSouls[nextIdx] || 10);
                this.changeItemAmount(this.findSoulItemId(heroId), -costSoul, queuePush);
                curList.push({
                    hero_id: heroId,
                    beast_id: beastId,
                    lv: 1,
                    exp: 0
                });
                if (this.data.heros[heroId]) {
                    queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
                }
            }
            respond({ Beasts: this.data.beasts });
            return true;
        }
        // (UpgradeBeastByEquip moved to V14 section)
        if (cmd === SVRCMD.UpgradeBeastByStone) {
            var heroId = Number((params && params[0]) || 0);
            var beastId = Number((params && params[1]) || 30001);
            var stoneCost = (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.BEAST_PER_STONE) ? Number(ConfigGlobalVar.BEAST_PER_STONE) : 20;
            var expGain = (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.BEAST_PER_STONE_EXP) ? Number(ConfigGlobalVar.BEAST_PER_STONE_EXP) : 20;
            this.data.stone = Math.max(0, Number(this.data.stone || 0) - stoneCost);
            this.data.daily_counts["BEAST_STONE_EXP"] = Number(this.data.daily_counts["BEAST_STONE_EXP"] || 0) + expGain;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

            var updatedBeast2 = { beast_id: beastId, lv: 1, exp: 0 };
            if (this.data.beasts[heroId]) {
                for (var bi2 = 0; bi2 < this.data.beasts[heroId].length; bi2++) {
                    var b2 = this.data.beasts[heroId][bi2];
                    if (b2.beast_id == beastId) {
                        var lv2 = Number(b2.lv || 1);
                        var exp2 = Number(b2.exp || 0) + expGain;
                        if (typeof Config !== "undefined" && Config.beast && Config.beast[beastId]) {
                            while (lv2 < 10 && Config.beast[beastId][lv2] && Config.beast[beastId][lv2].upg_exp > 0 && exp2 >= Config.beast[beastId][lv2].upg_exp) {
                                exp2 -= Config.beast[beastId][lv2].upg_exp;
                                lv2++;
                            }
                            if (lv2 >= 10 && Config.beast[beastId][10]) {
                                exp2 = 0;
                            }
                        }
                        b2.lv = lv2;
                        b2.exp = exp2;
                        updatedBeast2 = b2;
                        queuePush(SVRCMD.Beast, { beast: b2 });
                        break;
                    }
                }
            }
            if (this.data.heros[heroId]) {
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            respond({ beast: updatedBeast2 });
            return true;
        }

        // 7. Events (Exact Online Events), SignIn, First Recharge, Roulette, BattlePass, Raid
        if (cmd === SVRCMD.SignInInfo) {
            respond({ days: this.data.sign_days || [] });
            return true;
        }
        if (cmd === SVRCMD.SignIn) {
            var nowDate = new Date(Cache.getServerTime());
            var today = nowDate.getDate();
            var already = false;
            for (var i = 0; i < this.data.sign_days.length; i++) {
                if (this.data.sign_days[i].day == today) {
                    already = true;
                    break;
                }
            }
            if (!already) {
                this.data.sign_days.push({ day: today });
            }
            var signIdx = this.data.sign_days.length;
            var month = nowDate.getMonth() + 1;
            if (typeof Config !== "undefined" && Config.sign && Config.sign[month] && Config.sign[month][signIdx]) {
                var sCfg = Config.sign[month][signIdx];
                var mult = (sCfg.vip > 0 && Number(this.data.vip_lv || 0) >= sCfg.vip) ? 2 : 1;
                var amt = Number(sCfg.amount || 1) * mult;
                if (sCfg.reward_type == 1) {
                    this.changeItemAmount(sCfg.item_id, amt, queuePush);
                } else if (sCfg.reward_type == 2) {
                    if (Number(sCfg.item_id) >= 30000) this.addSecretEquip(sCfg.item_id, amt, queuePush);
                    else this.changeEquipAmount(sCfg.item_id, amt, queuePush);
                } else if (sCfg.reward_type == 3) {
                    this.data.gold = Number(this.data.gold || 0) + amt;
                    queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                } else if (sCfg.reward_type == 4) {
                    this.data.stone = Number(this.data.stone || 0) + amt;
                    queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                } else if (sCfg.reward_type == 5) {
                    this.addOrConvertHero(sCfg.item_id, queuePush);
                }
            }
            respond({ days: this.data.sign_days });
            return true;
        }
        if (cmd === SVRCMD.GetAllEvents) {
            var nowSec = Math.floor(Date.now() / 1000);
            var minFrom = nowSec - 86400 * 7;
            var minTo = nowSec + 86400 * 180;
            var evGroups = this.onlineEvents || [];
            for (var gi = 0; gi < evGroups.length; gi++) {
                var grp = evGroups[gi];
                if (!grp) continue;
                for (var ej = 0; ej < grp.length; ej++) {
                    var ev = grp[ej];
                    if (ev.from_time > nowSec) ev.from_time = minFrom;
                    if (ev.to_time < minTo) ev.to_time = minTo;
                }
            }
            respond({ events: evGroups });
            return true;
        }
        if (cmd === SVRCMD.GetAllEventsProcess || cmd === SVRCMD.GetEventProcess) {
            var pList = [];
            var evGroups2 = this.onlineEvents || [];
            var myPid = (typeof gamePlayer !== "undefined" && gamePlayer.id) ? Number(gamePlayer.id) : 1;
            for (var gi2 = 0; gi2 < evGroups2.length; gi2++) {
                var grp2 = evGroups2[gi2];
                if (!grp2) continue;
                for (var ej2 = 0; ej2 < grp2.length; ej2++) {
                    var ev2 = grp2[ej2];
                    var eid = Number(ev2.id);
                    var eType = Number(ev2.types);
                    var hasRec = (this.data.event_claims && this.data.event_claims[eid]) ? 1 : 0;
                    var procVal = 0;
                    if (eType === 15) {
                        procVal = Number((this.data.event_process && this.data.event_process[eid]) || 0);
                        hasRec = 0;
                    } else if (eType !== 101) {
                        var condParts = String(ev2.conditions || "1").split(",");
                        procVal = Math.max(1, parseInt(condParts[0]) || 1);
                    }
                    pList.push({
                        event_id: eid,
                        player_id: myPid,
                        has_received: hasRec,
                        process: procVal
                    });
                }
            }
            respond({ process_list: pList, process: 999999 });
            return true;
        }
        if (cmd === SVRCMD.ReceivedEventAward) {
            var evType = Number((params && params[0]) || 0);
            var evId = Number((params && params[1]) || 0);
            var targetEv = null;
            var evGroups3 = this.onlineEvents || [];
            for (var gi3 = 0; gi3 < evGroups3.length; gi3++) {
                var grp3 = evGroups3[gi3];
                if (!grp3) continue;
                for (var ej3 = 0; ej3 < grp3.length; ej3++) {
                    if (Number(grp3[ej3].id) === evId) {
                        targetEv = grp3[ej3];
                        break;
                    }
                }
                if (targetEv) break;
            }
            if (targetEv) {
                if (Number(targetEv.types) === 15) {
                    this.data.event_process[evId] = Number(this.data.event_process[evId] || 0) + 1;
                    var condSplit = String(targetEv.conditions || "").split(";");
                    if (condSplit.length >= 3 && condSplit[2]) {
                        var needArr = condSplit[2].split("-");
                        for (var ni = 0; ni < needArr.length; ni++) {
                            var np = needArr[ni].split(",");
                            var nType = Number(np[0] || 1);
                            var nId = Number(np[1] || 0);
                            var nAmt = Number(np[2] || 0);
                            if (nType === 1) this.changeItemAmount(nId, -nAmt, queuePush);
                            else if (nType === 2) this.changeEquipAmount(nId, -nAmt, queuePush);
                            else if (nType === 3) this.data.gold = Math.max(0, Number(this.data.gold || 0) - nAmt);
                            else if (nType === 4) this.data.stone = Math.max(0, Number(this.data.stone || 0) - nAmt);
                        }
                    }
                } else {
                    this.data.event_claims[evId] = 1;
                }
                var itemStr = String(targetEv.items || "");
                if (itemStr.length > 0) {
                    var entries = itemStr.split("-");
                    for (var ei = 0; ei < entries.length; ei++) {
                        var sub = entries[ei].split(",");
                        var rType = Number(sub[0] || 1);
                        var rId = Number(sub[1] || 0);
                        var rAmt = Number(sub[2] || 1);
                        if (rType === 1) {
                            this.changeItemAmount(rId, rAmt, queuePush);
                        } else if (rType === 2) {
                            if (rId >= 30000) {
                                this.addSecretEquip(rId, rAmt, queuePush);
                            } else {
                                this.changeEquipAmount(rId, rAmt, queuePush);
                            }
                        } else if (rType === 3) {
                            this.data.gold = Number(this.data.gold || 0) + rAmt;
                        } else if (rType === 4) {
                            this.data.stone = Number(this.data.stone || 0) + rAmt;
                        } else if (rType === 5) {
                            this.data.sp = Number(this.data.sp || 0) + rAmt;
                        }
                    }
                }
            }
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({});
            return true;
        }
        if (cmd === SVRCMD.LuckyInfo) {
            var nowSec = Math.floor(Date.now() / 1000);
            var minTo = nowSec + 86400 * 180;
            if (this.onlineLucky && this.onlineLucky.luckys) {
                for (var lk in this.onlineLucky.luckys) {
                    if (this.onlineLucky.luckys[lk].to_time < minTo) {
                        this.onlineLucky.luckys[lk].to_time = minTo;
                    }
                }
            }
            respond(this.onlineLucky);
            return true;
        }
        if (cmd === SVRCMD.PlayerLuckyInfo) {
            respond({ gold: 0, item: 0, stone: 0 });
            return true;
        }
        if (cmd === SVRCMD.LuckyLogs) {
            respond({
                logs: [
                    { seq: 4, item: 60040, player_name: this.data.team_name || "Nhẫn Giả" },
                    { seq: 2, item: 10230, player_name: "Kurumi" },
                    { seq: 12, item: 30105, player_name: "Kakashi" }
                ]
            });
            return true;
        }
        if (cmd === SVRCMD.Lucky) {
            var luckyId = Number((params && params[0]) || 11011208);
            var tabIdx = Number((params && params[1]) || 1);
            var count = Number((params && params[2]) || 1);
            var lBasic = (this.onlineLucky && this.onlineLucky.luckys && this.onlineLucky.luckys[luckyId]) ? this.onlineLucky.luckys[luckyId] : null;
            var lItems = (this.onlineLucky && this.onlineLucky.items && this.onlineLucky.items[luckyId]) ? this.onlineLucky.items[luckyId] : [];
            var discRate = (count === 10 && lBasic && lBasic.lucky_10_cost_rate) ? (Number(lBasic.lucky_10_cost_rate) / 100) : 1;
            if (tabIdx === 1) {
                var gCost = Math.floor(Number((lBasic && lBasic.gold_cost) || 999999) * count * discRate);
                this.data.gold = Math.max(0, Number(this.data.gold || 0) - gCost);
            } else if (tabIdx === 2) {
                var sCost = Math.floor(Number((lBasic && lBasic.stone_cost) || 999) * count * discRate);
                this.data.stone = Math.max(0, Number(this.data.stone || 0) - sCost);
            } else {
                var needItemId = Number((lBasic && lBasic.item_id) || 10050);
                var iCost = Math.floor(Number((lBasic && lBasic.item_amount) || 99) * count * discRate);
                this.changeItemAmount(needItemId, -iCost, queuePush);
            }
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            var outLogs = [];
            for (var li = 0; li < count; li++) {
                if (lItems.length > 0) {
                    var pick = lItems[Math.floor(Math.random() * lItems.length)];
                    var pType = Number(pick.item_type || 1);
                    var pId = Number(pick.item_id || 10230);
                    var pAmt = Number(pick.item_amount || 1);
                    if (pType === 1) {
                        this.changeItemAmount(pId, pAmt, queuePush);
                    } else if (pType === 2) {
                        if (pId >= 30000) this.addSecretEquip(pId, pAmt, queuePush);
                        else this.changeEquipAmount(pId, pAmt, queuePush);
                    } else if (pType === 3) {
                        this.data.gold = Number(this.data.gold || 0) + pAmt;
                    } else if (pType === 4) {
                        this.data.stone = Number(this.data.stone || 0) + pAmt;
                    }
                    outLogs.push({ seq: pick.seq, item: pId, player_name: this.data.team_name || "Nhẫn Giả" });
                }
            }
            respond({ logs: outLogs });
            return true;
        }
        if (cmd === SVRCMD.ReceiveFirstRecharge) {
            this.data.had_recharge_gift = 2;
            this.data.gold = Number(this.data.gold || 0) + 500000;
            this.addOrConvertHero(10050, queuePush);
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.ReceiveVipGiftBag) {
            var vipLv = Number((params && params[0]) || 5);
            this.data["had_vip" + vipLv + "_gift"] = 2;
            this.data.gold = Number(this.data.gold || 0) + 1000000;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ status: 1 });
            return true;
        }
        if (cmd === "BattlePassInfo" || cmd === "BattlePassClaim" || cmd === "BattlePassRedeem" || cmd === SVRCMD.BattlePassInfo || cmd === SVRCMD.BattlePassClaim || cmd === SVRCMD.BattlePassRedeem) {
            var nowMs = Date.now();
            var tiers = [];
            var freeCycle = [
                { kind: "item", itemId: 10140, name: "Bí Ngô", amount: 5 },
                { kind: "item", itemId: 10210, name: "Kẹo", amount: 5 },
                { kind: "item", itemId: 10440, name: "Chìa Khóa Sắt", amount: 1 },
                { kind: "sp", itemId: 0, name: "Thể Lực", amount: 150 },
                { kind: "item", itemId: 10420, name: "Chìa Khóa Đồng", amount: 1 }
            ];
            var premCycle = [
                { kind: "item", itemId: 10210, name: "Kẹo", amount: 15 },
                { kind: "item", itemId: 10140, name: "Bí Ngô", amount: 15 },
                { kind: "item", itemId: 10420, name: "Chìa Khóa Đồng", amount: 2 },
                { kind: "item", itemId: 10440, name: "Chìa Khóa Sắt", amount: 2 },
                { kind: "item", itemId: 10430, name: "Chìa Khóa Vàng", amount: 2 }
            ];
            for (var t = 1; t <= 30; t++) {
                var fc = freeCycle[(t - 1) % freeCycle.length];
                var pc = premCycle[(t - 1) % premCycle.length];
                var mult = 1 + Math.floor((t - 1) / 10);
                tiers.push({
                    tier: t,
                    free: { kind: fc.kind, itemId: fc.itemId, name: fc.name, amount: fc.amount * mult },
                    premium: { kind: pc.kind, itemId: pc.itemId, name: pc.name, amount: pc.amount * mult }
                });
            }
            if (!this.data.bp_claims) this.data.bp_claims = [];
            if (this.data.bp_xp === undefined) this.data.bp_xp = 1450;
            if (this.data.bp_level === undefined) this.data.bp_level = 5;
            if (this.data.bp_premium === undefined) this.data.bp_premium = true;

            var hasClaimed = function(claimsArr, tr, tk) {
                for (var ci = 0; ci < claimsArr.length; ci++) {
                    if (claimsArr[ci].tier == tr && claimsArr[ci].track == tk) return true;
                }
                return false;
            };
            var grantBpReward = function(selfRef, rw) {
                if (!rw) return;
                if (rw.kind === "sp") {
                    selfRef.data.sp = Number(selfRef.data.sp || 0) + Number(rw.amount || 100);
                    queuePush(SVRCMD.PlayerAttr, selfRef.buildPlayerAttrPayload());
                } else if (rw.itemId > 0) {
                    selfRef.changeItemAmount(rw.itemId, Number(rw.amount || 1), queuePush);
                }
            };

            if (cmd === "BattlePassRedeem" || cmd === SVRCMD.BattlePassRedeem) {
                var rKind = (params && params[0]) || "xp";
                if (rKind === "xp") {
                    this.data.bp_xp = Math.min(8700, Number(this.data.bp_xp || 0) + 500);
                    this.data.bp_level = Math.min(30, Math.floor(this.data.bp_xp / 290));
                } else {
                    this.data.bp_premium = true;
                }
            } else if (cmd === "BattlePassClaim" || cmd === SVRCMD.BattlePassClaim) {
                var cTier = Number((params && params[0]) || 1);
                var cTrack = String((params && params[1]) || "free");
                if (cTrack === "all") {
                    for (var ti = 1; ti <= this.data.bp_level; ti++) {
                        if (!hasClaimed(this.data.bp_claims, ti, "free")) {
                            this.data.bp_claims.push({ tier: ti, track: "free" });
                            grantBpReward(this, tiers[ti - 1].free);
                        }
                        if (this.data.bp_premium && !hasClaimed(this.data.bp_claims, ti, "premium")) {
                            this.data.bp_claims.push({ tier: ti, track: "premium" });
                            grantBpReward(this, tiers[ti - 1].premium);
                        }
                    }
                } else if (cTier >= 1 && cTier <= this.data.bp_level) {
                    if (!hasClaimed(this.data.bp_claims, cTier, cTrack)) {
                        this.data.bp_claims.push({ tier: cTier, track: cTrack });
                        grantBpReward(this, tiers[cTier - 1][cTrack]);
                    }
                }
            }

            var missions = [
                { id: "login", name: "Đăng nhập mỗi ngày", description: "Vào game 1 lần trong ngày", target: 1, xp: 80, progress: 1, completed: true },
                { id: "campaign", name: "Vượt ải cốt truyện", description: "Hoàn thành hoặc càn quét 5 ải", target: 5, xp: 100, progress: 5, completed: true },
                { id: "arena", name: "Khiêu chiến Đấu Trường", description: "Tham gia 3 trận Đấu Trường", target: 3, xp: 100, progress: 3, completed: true },
                { id: "task", name: "Nhiệm vụ Ninja", description: "Hoàn thành 3 Nhiệm vụ Ninja", target: 3, xp: 100, progress: 3, completed: true },
                { id: "tower", name: "Tranh Bá Nhẫn Giới", description: "Chiến thắng 2 trận Lôi Đài / Tháp", target: 2, xp: 100, progress: 2, completed: true },
                { id: "raid", name: "Hợp Chiến Raid Boss", description: "Tham gia 1 trận Raid Boss", target: 1, xp: 100, progress: 1, completed: true }
            ];
            respond({
                entitlements: { xp_uses: 99, premium_uses: 1 },
                season: { id: "s1-20261023", name: "DI SẢN HỎA CHÍ", subtitle: "MÙA 01", start: nowMs - 86400000 * 5, end: nowMs + 86400000 * 25, levels: 30, xpPerLevel: 290 },
                now: nowMs,
                xp: Number(this.data.bp_xp || 1450),
                level: Number(this.data.bp_level || 5),
                premium: !!this.data.bp_premium,
                claims: this.data.bp_claims,
                tiers: tiers,
                missions: missions
            });
            return true;
        }
        if (cmd === "RaidInfo" || cmd === "RaidCreate" || cmd === "RaidJoin" || cmd === "RaidSelect" || cmd === "RaidStart" || cmd === "RaidLeave") {
            var keyCount = (this.data.items && this.data.items[10440]) ? Number(this.data.items[10440].amount || 0) : 0;
            if (keyCount < 1) {
                keyCount = 10;
                this.changeItemAmount(10440, 10, queuePush);
            }
            var bosses = [
                { id: 1, name: "Dễ", heroId: 17001, tailId: 16101, lineup: "Kaguya + Nhất Vĩ", reward: 20 },
                { id: 2, name: "Thường", heroId: 17001, tailId: 16201, lineup: "Kaguya + Nhị Vĩ", reward: 30 },
                { id: 3, name: "Khó", heroId: 17001, tailId: 16301, lineup: "Kaguya + Tam Vĩ", reward: 40 },
                { id: 4, name: "Ác Mộng", heroId: 17001, tailId: 16401, lineup: "Kaguya + Tứ Vĩ", reward: 60 }
            ];
            if (cmd === "RaidCreate" || cmd === "RaidJoin") {
                var bId = Number((params && params[0]) || 1);
                if (isNaN(bId) || bId < 1 || bId > 4) bId = 1;
                var firstHeroId = 10070;
                for (var hk in this.data.heros) {
                    firstHeroId = Number(hk);
                    break;
                }
                this.data.raid_room = {
                    raidId: "raid_" + Date.now(),
                    code: "888888",
                    bossId: bId,
                    hostId: 1,
                    state: "waiting",
                    rewardItemId: 10140,
                    rewardPreview: bosses[bId - 1].reward,
                    members: [
                        { playerId: 1, name: this.data.team_name || "Nhẫn Giả", level: Number(this.data.team_lv || 1), icon: Number(this.data.icon || 80110070), heroId: firstHeroId, heroQuality: 5, hasEntryKey: true },
                        { playerId: 2, name: "Kakashi (AI)", level: 60, icon: 80110050, heroId: 10050, heroQuality: 10, hasEntryKey: true }
                    ]
                };
            } else if (cmd === "RaidSelect") {
                var selHeroId = Number((params && params[0]) || 10070);
                if (this.data.raid_room && this.data.raid_room.members && this.data.raid_room.members[0]) {
                    var hObj = this.data.heros[selHeroId];
                    this.data.raid_room.members[0].heroId = selHeroId;
                    this.data.raid_room.members[0].heroQuality = hObj ? Number(hObj.quality || 1) : 1;
                }
            } else if (cmd === "RaidStart") {
                if (this.data.raid_room) {
                    var bId2 = Number(this.data.raid_room.bossId || 1);
                    var rwAmt = bosses[bId2 - 1] ? bosses[bId2 - 1].reward : 20;
                    this.changeItemAmount(10440, -1, queuePush);
                    this.changeItemAmount(10140, rwAmt, queuePush);
                    this.data.raid_room.state = "done";
                    this.data.raid_room.win = true;
                    this.data.raid_room.reward = rwAmt;
                    this.data.raid_room.damage = 950000;
                    keyCount = Math.max(0, keyCount - 1);
                }
            } else if (cmd === "RaidLeave") {
                this.data.raid_room = null;
            }
            respond({
                serverNow: Date.now(),
                keyId: 10440,
                candyId: 10140,
                rewardItemId: 10140,
                keyCount: keyCount,
                bosses: bosses,
                rules: { minMembers: 2, maxMembers: 5, keyCost: 1, dailyLimit: 0, rewardItemId: 10140 },
                room: this.data.raid_room || null
            });
            return true;
        }

        // 8. GM Giftcodes via SVRCMD.UseGiftBagCode ("kiểu tặng" -> ExchangeRewardView + Live PlayerAttr/Item/Equip/Hero/Secret push)
        if (cmd === SVRCMD.UseGiftBagCode) {
            var rawCode = String((params && params[0]) || "").trim();
            var parts = rawCode.toUpperCase().split(/[\s=]+/);
            var gmCmd = parts[0];
            if (gmCmd.startsWith("TEST")) {
                gmCmd = gmCmd.substring(4);
            }
            var val = (parts.length > 1 && !isNaN(parseInt(parts[1]))) ? parseInt(parts[1]) : 0;
            var rewardItems = [];

            if (gmCmd === "GOLD" || gmCmd === "VANG" || gmCmd === "TIEN" || gmCmd === "COIN") {
                var addGold = val > 0 ? val : 1000000000;
                this.data.gold = Number(this.data.gold || 0) + addGold;
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                rewardItems.push({ type: 3, item_id: 0, amount: addGold });
                respond({ items: rewardItems });
                return true;
            }
            if (gmCmd === "DIAMOND" || gmCmd === "GEM" || gmCmd === "KC" || gmCmd === "KIMCUONG" || gmCmd === "STONE") {
                var addStone = val > 0 ? val : 1000000;
                this.data.stone = Number(this.data.stone || 0) + addStone;
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                rewardItems.push({ type: 4, item_id: 0, amount: addStone });
                respond({ items: rewardItems });
                return true;
            }
            if (gmCmd === "HERO" || gmCmd === "SOUL" || gmCmd === "TUONG" || gmCmd === "NINJA") {
                var soulAmt = val > 0 ? val : 2000;
                if (typeof Config !== "undefined" && Config.item) {
                    for (var sid in Config.item) {
                        if (Number(Config.item[sid].item_type) === 2) {
                            this.changeItemAmount(Number(sid), soulAmt, queuePush);
                            if (rewardItems.length < 18) {
                                rewardItems.push({ type: 1, item_id: Number(sid), amount: soulAmt });
                            }
                        }
                    }
                }
                respond({ items: rewardItems });
                return true;
            }
            if (gmCmd === "ITEM" || gmCmd === "PACK" || gmCmd === "DO" || gmCmd === "RUONG" || gmCmd === "MANUAL") {
                // 1. All Bag Items (EXP books, Ninjutsu shards, Ninja Tool Chests 11010..11030, Beast Bones, Event & Shop currencies)
                if (typeof Config !== "undefined" && Config.item) {
                    for (var iid in Config.item) {
                        var it = Config.item[iid];
                        var itType = Number(it.item_type || 0);
                        if (itType !== 2) {
                            var giveAmt = (itType === 12) ? 500 : ((itType === 3) ? 999 : 5000);
                            this.changeItemAmount(Number(iid), giveAmt, queuePush);
                            if (itType === 12 && rewardItems.length < 6) {
                                rewardItems.push({ type: 1, item_id: Number(iid), amount: giveAmt });
                            }
                        }
                    }
                }
                // 2. All Complete Ninjutsu Equips (type 1) + All Gems (Lam Ngọc, Huyết Thạch, Hoàng Ngọc - type 3) + All Tactic Scrolls (type 2)
                if (typeof Config !== "undefined" && Config.equip) {
                    var existingSecretCounts = {};
                    if (this.data.secrets) {
                        for (var si = 0; si < this.data.secrets.length; si++) {
                            var eqKey = Number(this.data.secrets[si].equip_id);
                            existingSecretCounts[eqKey] = (existingSecretCounts[eqKey] || 0) + 1;
                        }
                    }
                    for (var eid in Config.equip) {
                        var eq = Config.equip[eid];
                        var eqType = Number(eq.type || eq.types || 1);
                        if (eqType === 3) {
                            // Gems: Lam Ngọc (40101..40110), Huyết Thạch (40201..40210), Hoàng Ngọc (40301..40310)
                            var curGemCnt = existingSecretCounts[Number(eid)] || 0;
                            var targetGemCnt = 6;
                            if (curGemCnt < targetGemCnt) {
                                this.addSecretEquip(Number(eid), targetGemCnt - curGemCnt, queuePush);
                            }
                            if (rewardItems.length < 12 && Number(eid) % 10 === 0) {
                                rewardItems.push({ type: 2, item_id: Number(eid), amount: 6 });
                            }
                        } else if (eqType === 2) {
                            // Tactic Scrolls (Bí Kíp Học Viện 30101..30613)
                            var curTacCnt = existingSecretCounts[Number(eid)] || 0;
                            var targetTacCnt = 3;
                            if (curTacCnt < targetTacCnt) {
                                this.addSecretEquip(Number(eid), targetTacCnt - curTacCnt, queuePush);
                            }
                        } else {
                            // Complete Ninjutsu Equips (20001..21705)
                            this.changeEquipAmount(Number(eid), 99, queuePush);
                            if (rewardItems.length < 18) {
                                rewardItems.push({ type: 2, item_id: Number(eid), amount: 99 });
                            }
                        }
                    }
                }
                // 3. All Ninja Tools (Nhẫn Cụ)
                if (typeof Config !== "undefined" && Config.ninja_tool) {
                    for (var ntid in Config.ninja_tool) {
                        this.changeNinjaToolAmount(Number(ntid), 10, queuePush);
                    }
                }
                respond({ items: rewardItems });
                return true;
            }
            if (gmCmd === "BIKIP" || gmCmd === "SECRET" || gmCmd === "EXPSECRET" || gmCmd === "BIKIPEXP" || gmCmd === "NGOC") {
                var expTacticIds = [30104, 30105, 30106, 30107];
                var giveCount = val > 0 ? val : 99;
                for (var eti = 0; eti < expTacticIds.length; eti++) {
                    var expId = expTacticIds[eti];
                    this.addSecretEquip(expId, giveCount, queuePush);
                    rewardItems.push({ type: 2, item_id: expId, amount: giveCount });
                }
                // Add base gems lv1 for synthesis testing (40101, 40201, 40301, 40401, 40501, 40601)
                var baseGemIds = [40101, 40201, 40301, 40401, 40501, 40601];
                for (var bgi = 0; bgi < baseGemIds.length; bgi++) {
                    this.addSecretEquip(baseGemIds[bgi], 20, queuePush);
                }
                respond({ items: rewardItems });
                return true;
            }
            if (gmCmd === "EXP" || gmCmd === "TEXTEXP" || gmCmd === "LV") {
                var expAdd = val > 0 ? val : 500000;
                this.addTeamExp(expAdd);
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                rewardItems.push({ type: 10, item_id: 0, amount: expAdd });
                respond({ items: rewardItems });
                return true;
            }
            if (gmCmd === "VIT" || gmCmd === "TL" || gmCmd === "THELUC" || gmCmd === "ENERGY") {
                var addSp = val > 0 ? val : 5000;
                this.data.sp = Number(this.data.sp || 0) + addSp;
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                rewardItems.push({ type: 5, item_id: 0, amount: addSp });
                respond({ items: rewardItems });
                return true;
            }
            if (gmCmd === "VIP" || gmCmd === "SVIP") {
                var targetVip = val > 0 ? val : 15;
                targetVip = Math.min(15, Math.max(0, targetVip));
                this.data.vip_lv = targetVip;
                this.data.had_recharge_gift = 1;
                this.data.had_vip5_gift = 1;
                this.data.had_vip9_gift = 1;
                this.data.had_vip11_gift = 1;
                this.data.had_vip13_gift = 1;
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                rewardItems.push({ type: 4, item_id: 0, amount: 10000 });
                respond({ items: rewardItems });
                return true;
            }
            if (gmCmd === "RESET") {
                this.initDefaultData();
                this.ensureDataFields();
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                rewardItems.push({ type: 3, item_id: 0, amount: 100000 });
                respond({ items: rewardItems });
                return true;
            }

            // Default giftcode fallback: gift 100,000 Gems & 100,000,000 Gold
            this.data.stone = Number(this.data.stone || 0) + 100000;
            this.data.gold = Number(this.data.gold || 0) + 100000000;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            rewardItems.push({ type: 4, item_id: 0, amount: 100000 });
            rewardItems.push({ type: 3, item_id: 0, amount: 100000000 });
            respond({ items: rewardItems });
            return true;
        }

        // 9. Ninja Missions ("Nhiệm Vụ Ninja" - MissionView.js)
        if (cmd === SVRCMD.TaskInfo || cmd === SVRCMD.RefreshTask) {
            var taskKeys = [];
            if (typeof Config !== "undefined" && Config.task) {
                for (var tk in Config.task) {
                    taskKeys.push(Number(tk));
                }
            }
            if (taskKeys.length === 0) taskKeys = [1001];
            if (this.data.active_awake_hero && this.data.cur_task_id) {
                // Keep active awake task intact for hero awakening!
            } else if (!this.data.cur_task_id || cmd === SVRCMD.RefreshTask || (Config && Config.task && !Config.task[this.data.cur_task_id])) {
                this.data.cur_task_id = taskKeys[Math.floor(Math.random() * taskKeys.length)];
            }
            if (cmd === SVRCMD.RefreshTask && params && Number(params[0]) === 2) {
                this.data.gold = Math.max(0, Number(this.data.gold || 0) - 5000);
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            }
            respond({
                task_id: this.data.cur_task_id,
                today_count: Number(this.data.task_today_count || 0),
                total_count: 10,
                gold_refresh_count: 0
            });
            return true;
        }
        if (cmd === SVRCMD.TaskSweep || cmd === SVRCMD.AfterTaskFight) {
            var tid = this.data.cur_task_id || 1001;
            var tCfg = (typeof Config !== "undefined" && Config.task && Config.task[tid]) ? Config.task[tid] : null;
            var expGain = tCfg ? Number(tCfg.team_exp || 20) : 20;
            var goldGain = tCfg ? Number(tCfg.gold || 5000) : 5000;
            this.addTeamExp(expGain);
            this.data.gold = Number(this.data.gold || 0) + goldGain;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

            var dropItems = [];
            if (tCfg && tCfg.box_id && typeof Config !== "undefined" && Config.box_drop && Config.box_drop[tCfg.box_id]) {
                var grp = Config.box_drop[tCfg.box_id];
                var dKeys = Object.keys(grp);
                for (var dIdx = 0; dIdx < Math.min(2, dKeys.length); dIdx++) {
                    var dObj = grp[dKeys[dIdx]];
                    if (dObj) {
                        var dt = Number(dObj.type || 1);
                        var did = Number(dObj.item_id || 10010);
                        var damt = Number(dObj.amount || 1);
                        if (dt === 2) {
                            if (did >= 30000) this.addSecretEquip(did, damt, queuePush);
                            else this.changeEquipAmount(did, damt, queuePush);
                        } else {
                            this.changeItemAmount(did, damt, queuePush);
                        }
                        dropItems.push({ type: dt, item_id: did, amount: damt });
                    }
                }
            } else {
                this.changeItemAmount(10020, 2, queuePush);
                dropItems.push({ type: 1, item_id: 10020, amount: 2 });
            }
            if (typeof Config !== "undefined" && Config.task) {
                var tks = Object.keys(Config.task);
                if (tks.length > 0) {
                    this.data.cur_task_id = Number(tks[Math.floor(Math.random() * tks.length)]);
                }
            }
            if (this.data.active_awake_hero) {
                var aHeroId = Number(this.data.active_awake_hero);
                if (!this.data.awake_task_progress) this.data.awake_task_progress = {};
                this.data.awake_task_progress[aHeroId] = 1;
                if (typeof Config !== "undefined" && Config.hero && Config.hero[aHeroId]) {
                    var aCfg = Config.hero[aHeroId];
                    if (aCfg.awake_equip_id) {
                        this.changeEquipAmount(Number(aCfg.awake_equip_id), 1, queuePush);
                    }
                }
            }
            respond({ is_win: 1, items: dropItems, task_id: this.data.cur_task_id });
            return true;
        }

        // 10. All Shops ("Tạp Hóa", "Chợ Đen", "Tiệm Đấu Trường", "Tiệm Tranh Bá", "Tiệm Boruto" - ShopNinja.js & ShopBoRen.js)
        if (cmd === SVRCMD.ShopInfo || cmd === SVRCMD.RefreshShop) {
            var shopType = Number((params && params[0]) || 1);
            if (!this.data.shops) this.data.shops = {};
            if (cmd === SVRCMD.RefreshShop || !this.data.shops[shopType]) {
                this.data.shops[shopType] = this.generateShopData(shopType);
            }
            var curShop = this.data.shops[shopType];
            respond({
                playerShop: {
                    shop_type: shopType,
                    info: JSON.stringify(curShop.info || {}),
                    discount_info: JSON.stringify(curShop.discount_info || {})
                }
            });
            return true;
        }
        if (cmd === SVRCMD.BuyShopGoods) {
            var shopId = Number((params && params[0]) || 0);
            var shopType = Number((params && params[1]) || 1);
            var boxDropId = Number((params && params[2]) || 0);
            if (typeof Config !== "undefined" && Config.shop && Config.shop[shopId]) {
                var sCfg = Config.shop[shopId];
                var price = Number(sCfg.price || 100);
                var pType = Number(sCfg.price_type || 1);
                if (pType === 1) {
                    if (!self.canDeductGold(price)) return respond({}, { code: 1, msg: "Không đủ Vàng!" });
                    self.deductGold(price, queuePush);
                } else if (pType === 2) {
                    if (!self.canDeductStone(price)) return respond({}, { code: 1, msg: "Không đủ Kim Cương!" });
                    self.deductStone(price, queuePush);
                } else if (pType === 3 || pType === 10) {
                    if (Number(self.data.arena_point || 0) < price) return respond({}, { code: 1, msg: "Không đủ Điểm Đấu Trường!" });
                    self.data.arena_point -= price;
                    queuePush(SVRCMD.PlayerAttr, self.buildPlayerAttrPayload());
                } else if (pType === 4 || pType === 14) {
                    if (Number(self.data.ninja_point || 0) < price) return respond({}, { code: 1, msg: "Không đủ Điểm Tranh Bá!" });
                    self.data.ninja_point -= price;
                    queuePush(SVRCMD.PlayerAttr, self.buildPlayerAttrPayload());
                } else if (pType === 5 || pType === 15) {
                    if (Number(self.data.group_point || 0) < price) return respond({}, { code: 1, msg: "Không đủ Cống Hiến Bang!" });
                    self.data.group_point -= price;
                    queuePush(SVRCMD.PlayerAttr, self.buildPlayerAttrPayload());
                } else if (pType === 6) {
                    if (Number(self.data.dark_arena_point || 0) < price) return respond({}, { code: 1, msg: "Không đủ Điểm Lôi Đài!" });
                    self.data.dark_arena_point -= price;
                    queuePush(SVRCMD.PlayerAttr, self.buildPlayerAttrPayload());
                } else if (pType === 11 || pType === 12 || pType === 13) {
                    var refId = pType === 11 ? 10410 : (pType === 12 ? 10420 : 10430);
                    if (!self.canDeductItem(refId, price)) return respond({}, { code: 1, msg: "Không đủ Đá tinh luyện!" });
                    self.deductItem(refId, price, queuePush);
                }
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

                var drop = null;
                if (Config.box_drop && Config.box_drop[sCfg.box_id] && Config.box_drop[sCfg.box_id][boxDropId]) {
                    drop = Config.box_drop[sCfg.box_id][boxDropId];
                } else if (Config.box_drop_item && Config.box_drop_item[boxDropId]) {
                    drop = Config.box_drop_item[boxDropId];
                }
                if (drop) {
                    var dt = Number(drop.type || 1);
                    var did = Number(drop.item_id || 0);
                    var damt = Number(drop.amount || 1);
                    if (dt === 2) {
                        if (did >= 30000) this.addSecretEquip(did, damt, queuePush);
                        else this.changeEquipAmount(did, damt, queuePush);
                    } else if (dt === 13 || (Config.ninja_tool && Config.ninja_tool[did])) {
                        this.changeNinjaToolAmount(did, damt, queuePush);
                    } else if (dt === 3) {
                        this.addOrConvertHero(did, queuePush);
                    } else {
                        this.changeItemAmount(did, damt, queuePush);
                    }
                }
            }
            if (this.data.shops && this.data.shops[shopType] && this.data.shops[shopType].info) {
                this.data.shops[shopType].info[shopId + "_" + boxDropId] = 0;
            }
            respond({});
            return true;
        }
        if (cmd === SVRCMD.BuyGoods2) {
            var goods2Id = Number((params && params[0]) || 1001);
            var cntKey = "PLAYER_GOODS2_COUNT_ID_" + goods2Id;
            var curBuyCount = Number(this.data.daily_counts[cntKey] || 0);
            var nextTier = curBuyCount + 1;

            var shopRefreshMap = {
                4001: 1, 5001: 2, 6001: 3, 7001: 4, 8001: 5,
                9001: 6, 13001: 7, 16001: 9, 9051: 10
            };

            if (shopRefreshMap[goods2Id]) {
                var targetShopType = shopRefreshMap[goods2Id];
                if (!this.data.shops) this.data.shops = {};
                this.data.shops[targetShopType] = this.generateShopData(targetShopType);
                this.data.stone = Math.max(0, Number(this.data.stone || 0) - 20);
                this.data.daily_counts[cntKey] = nextTier;
            } else if (goods2Id === 1001) {
                // Buy Stamina (SP) - progressive pricing: 75, 90, 95, 105, 110, 120...
                var spPrices = [75, 90, 95, 105, 110, 120, 125, 135, 140, 150];
                var spPrice = (nextTier <= spPrices.length) ? spPrices[nextTier - 1] : 150;
                var spValue = 120;
                this.data.stone = Math.max(0, Number(this.data.stone || 0) - spPrice);
                this.data.sp = Number(this.data.sp || 0) + spValue;
                this.data.daily_counts[cntKey] = nextTier;
            } else if (goods2Id === 2001) {
                // Buy Gold - progressive pricing: 10, 20, 30, 40, 50...
                var goldPrice = nextTier * 10;
                var goldAmount = 20000 + nextTier * 5000;
                // 25% chance of crit x2
                if (Math.random() < 0.25) {
                    goldAmount *= 2;
                    queuePush(SVRCMD.Goods2Crit, {});
                }
                this.data.stone = Math.max(0, Number(this.data.stone || 0) - goldPrice);
                this.data.gold = Number(this.data.gold || 0) + goldAmount;
                this.data.daily_counts[cntKey] = nextTier;
            } else if (goods2Id === 9101) {
                // Buy Skill Points
                this.data.stone = Math.max(0, Number(this.data.stone || 0) - 20);
                this.data.skill_points = 20;
                this.data.daily_counts[cntKey] = nextTier;
            } else if (goods2Id === 17001) {
                // Buy Plunder Times
                this.data.stone = Math.max(0, Number(this.data.stone || 0) - 20);
                this.data.daily_counts[cntKey] = nextTier;
            } else {
                this.data.stone = Math.max(0, Number(this.data.stone || 0) - 20);
                this.data.daily_counts[cntKey] = nextTier;
            }

            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ gold: Number(this.data.gold), diamond: Number(this.data.stone), sp: Number(this.data.sp) });
            return true;
        }
        if (cmd === SVRCMD.GetSoulShopInfo) {
            var bIds = { "1": 4204, "2": 4205, "3": 4206 };
            if (typeof Config !== "undefined" && Config.box_drop_item) {
                var bdKeys = Object.keys(Config.box_drop_item);
                if (bdKeys.length >= 3) {
                    bIds = { "1": Number(bdKeys[0]), "2": Number(bdKeys[1]), "3": Number(bdKeys[2]) };
                }
            }
            respond({
                heroIds: [10020, 10040, 10050],
                buyedHeroIds: [],
                boxIds: bIds
            });
            return true;
        }
        if (cmd === SVRCMD.BuySoulShopItem) {
            this.changeItemAmount(30005, 5, queuePush);
            respond({ extraItems: [] });
            return true;
        }

        // 11. Ninja Academy ("Học Viện Ninja" - SchoolView.js, TrainView.js, InlayView.js, CompoundView.js) & Ninja Tools / Gems
        if (cmd === SVRCMD.PlayerSchoolInfo) {
            if (!this.data.player_school || !this.data.player_school.school_1) {
                this.data.player_school = {
                    school_1: 1101,
                    school_2: 0,
                    school_2_expire_time: 0,
                    school_3: 0,
                    school_3_expire_time: 0,
                    school_4: 0,
                    school_4_expire_time: 0,
                    school_5: 0,
                    school_5_expire_time: 0
                };
            }
            respond({ playerSchool: this.data.player_school });
            return true;
        }
        if (cmd === SVRCMD.CompleteSchoolWithoutFight || cmd === SVRCMD.SchoolSweep || cmd === SVRCMD.AfterSchoolFight) {
            var slot = Number((params && params[0]) || 1);
            var nowSec = Math.floor(Date.now() / 1000);
            if (!this.data.player_school) {
                this.data.player_school = {
                    school_1: 1101,
                    school_2: 0,
                    school_2_expire_time: 0,
                    school_3: 0,
                    school_3_expire_time: 0,
                    school_4: 0,
                    school_4_expire_time: 0,
                    school_5: 0,
                    school_5_expire_time: 0
                };
            }
            if (slot >= 1 && slot < 5) {
                var nextSlot = slot + 1;
                this.data.player_school["school_" + nextSlot] = 1000 + nextSlot * 100 + 1;
                this.data.player_school["school_" + nextSlot + "_expire_time"] = nowSec + 3600;
            }
            var goldCost = slot * 2500;
            this.data.gold = Math.max(0, Number(this.data.gold || 0) - goldCost);
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

            var dropItemId = 50010;
            var dropType = 1;
            if (slot >= 3) {
                dropItemId = 30101 + Math.floor(Math.random() * 8);
                dropType = 2;
                this.changeEquipAmount(dropItemId, 1, queuePush);
            } else {
                this.changeItemAmount(dropItemId, 1, queuePush);
            }
            this.save();
            respond({
                playerSchool: this.data.player_school,
                items: [{ box_id: 96000 + slot * 100 + 1, type: dropType, item_id: dropItemId, amount: 1 }]
            });
            return true;
        }
        if (cmd === SVRCMD.WearSecret || cmd === SVRCMD.WearGem) {
            // Check for secret set swap: ['swap', heroA, heroB, requestId]
            if (params && params[0] === 'swap') {
                var heroA = Number(params[1]);
                var heroB = Number(params[2]);
                var reqId = String(params[3] || "");
                if (this.data.secrets) {
                    for (var si = 0; si < this.data.secrets.length; si++) {
                        var sObj = this.data.secrets[si];
                        var sPos = Number(sObj.pos || 0);
                        if (sPos >= 1 && sPos <= 6 && Number(sObj.status) === 1) {
                            if (Number(sObj.hero_id) === heroA) {
                                sObj.hero_id = heroB;
                                queuePush(SVRCMD.Secret, { secret: sObj });
                            } else if (Number(sObj.hero_id) === heroB) {
                                sObj.hero_id = heroA;
                                queuePush(SVRCMD.Secret, { secret: sObj });
                            }
                        }
                    }
                }
                if (heroA > 0) queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroA) });
                if (heroB > 0) queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroB) });
                this.save();
                respond({ swap_id: reqId });
                return true;
            }

            var heroId = Number((params && params[0]) || 0);
            var pos = Number((params && params[1]) || 1);
            var secretId = Number((params && params[2]) || 0);

            // Unequip any existing secret at this slot on this hero
            if (this.data.secrets) {
                for (var si = 0; si < this.data.secrets.length; si++) {
                    var sec = this.data.secrets[si];
                    if (Number(sec.hero_id) === heroId && Number(sec.pos) === pos && sec.id != secretId) {
                        sec.hero_id = 0;
                        sec.pos = 0;
                        sec.status = 0;
                        queuePush(SVRCMD.Secret, { secret: sec });
                    }
                }
                // Equip the new secret
                for (var sj = 0; sj < this.data.secrets.length; sj++) {
                    var sec2 = this.data.secrets[sj];
                    if (sec2.id == secretId) {
                        sec2.hero_id = heroId;
                        sec2.pos = pos;
                        sec2.status = 1;
                        queuePush(SVRCMD.Secret, { secret: sec2 });
                        break;
                    }
                }
            }
            if (heroId > 0 && this.data.heros && this.data.heros[heroId]) {
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            this.save();
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.UnWearSecret || cmd === SVRCMD.UnWearGem) {
            var secretId = Number((params && params[0]) || 0);
            var affectedHeroId = 0;
            if (this.data.secrets) {
                for (var si = 0; si < this.data.secrets.length; si++) {
                    var sec = this.data.secrets[si];
                    if (sec.id == secretId) {
                        affectedHeroId = Number(sec.hero_id || 0);
                        sec.hero_id = 0;
                        sec.pos = 0;
                        sec.status = 0;
                        queuePush(SVRCMD.Secret, { secret: sec });
                        break;
                    }
                }
            }
            if (affectedHeroId > 0 && this.data.heros && this.data.heros[affectedHeroId]) {
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(affectedHeroId) });
            }
            this.save();
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.UpgradeSecret) {
            var targetId = Number((params && params[0]) || 0);
            var matStr = String((params && params[1]) || "");
            var matIds = matStr.split(",");
            var targetSec = null;
            for (var si = 0; si < this.data.secrets.length; si++) {
                if (this.data.secrets[si].id == targetId) {
                    targetSec = this.data.secrets[si];
                    break;
                }
            }
            if (targetSec) {
                var expAdd = 0;
                for (var mi = 0; mi < matIds.length; mi++) {
                    var mid = Number(matIds[mi]);
                    if (!mid) continue;
                    for (var sj = this.data.secrets.length - 1; sj >= 0; sj--) {
                        if (this.data.secrets[sj].id == mid) {
                            var mSec = this.data.secrets[sj];
                            var eqCfg = (typeof Config !== "undefined" && Config.equip && Config.equip[mSec.equip_id]) ? Config.equip[mSec.equip_id] : null;
                            expAdd += (eqCfg ? Number(eqCfg.forge_coin || 50) : 50) + Number(mSec.exp || 0);
                            this.data.secrets.splice(sj, 1);
                            queuePush(SVRCMD.DeleteSecret, { secret: mid });
                            break;
                        }
                    }
                }
                var tCfg = (typeof Config !== "undefined" && Config.equip && Config.equip[targetSec.equip_id]) ? Config.equip[targetSec.equip_id] : null;
                var q = tCfg ? Number(tCfg.quality || 1) : 1;
                var lv = Number(targetSec.lv || 1);
                var exp = Number(targetSec.exp || 0) + expAdd;
                if (typeof Config !== "undefined" && Config.equip_level) {
                    while (Config.equip_level[lv] && Config.equip_level[lv][q] && Config.equip_level[lv][q].exp > 0 && exp >= Config.equip_level[lv][q].exp) {
                        exp -= Config.equip_level[lv][q].exp;
                        lv++;
                    }
                } else {
                    lv += 1;
                }
                targetSec.lv = lv;
                targetSec.exp = exp;
                queuePush(SVRCMD.Secret, { secret: targetSec });
                if (targetSec.hero_id > 0 && this.data.heros[targetSec.hero_id]) {
                    queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(targetSec.hero_id) });
                }
            }
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.UpgradeGem) {
            var gemEquipId = Number((params && params[0]) || 0);
            var upgType = Number((params && params[1]) || 0);
            var gCfg = (typeof Config !== "undefined" && Config.equip && Config.equip[gemEquipId]) ? Config.equip[gemEquipId] : null;
            var nextGemId = Number((gCfg && (gCfg.forge_id || gCfg.target_item)) || ((gemEquipId % 100 < 10) ? (gemEquipId + 1) : 0));
            if (nextGemId > 0) {
                var needAmt = Math.max(1, Number((gCfg && gCfg.forge_amount) || 4));
                var matchingIdxs = [];
                for (var gi = this.data.secrets.length - 1; gi >= 0; gi--) {
                    if (Number(this.data.secrets[gi].equip_id) === gemEquipId && Number(this.data.secrets[gi].status) === 0) {
                        matchingIdxs.push(gi);
                    }
                }
                var craftCount = (upgType === 1) ? Math.floor(matchingIdxs.length / needAmt) : (matchingIdxs.length >= needAmt ? 1 : 0);
                if (craftCount > 0) {
                    var toRemove = craftCount * needAmt;
                    var costCoin = Number((gCfg && gCfg.forge_coin) || 10000) * craftCount;
                    var costItemId = Number((gCfg && gCfg.forge_item_id) || 0);
                    var costItemAmt = Number((gCfg && gCfg.forge_item_amount) || 0) * craftCount;
                    if (costCoin > 0) {
                        this.data.gold = Math.max(0, Number(this.data.gold || 0) - costCoin);
                        queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                    }
                    if (costItemId > 0 && costItemAmt > 0) {
                        this.changeItemAmount(costItemId, -costItemAmt, queuePush);
                    }
                    for (var r = 0; r < toRemove; r++) {
                        var remIdx = matchingIdxs[r];
                        var remSec = this.data.secrets[remIdx];
                        this.data.secrets.splice(remIdx, 1);
                        queuePush(SVRCMD.DeleteSecret, { secret: remSec.id });
                    }
                    for (var c = 0; c < craftCount; c++) {
                        var nSecId = (this.data.next_secret_id || 10) + 1;
                        this.data.next_secret_id = nSecId;
                        var nSec = { id: nSecId, lv: 1, exp: 0, pos: 0, status: 0, hero_id: 0, equip_id: nextGemId };
                        this.data.secrets.push(nSec);
                        queuePush(SVRCMD.Secret, { secret: nSec });
                    }
                    this.save();
                }
            }
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.WearNinjaTool) {
            var heroId = Number((params && params[0]) || 0);
            var slotType = Number((params && params[1]) || 1);
            var toolId = Number((params && params[2]) || 0);
            if (this.data.heros[heroId] && slotType >= 1 && slotType <= 6 && toolId > 0) {
                var h = this.data.heros[heroId];
                var prevTool = Number(h["ninja_tool_" + slotType] || 0);
                if (prevTool > 0) {
                    this.changeNinjaToolAmount(prevTool, 1, queuePush);
                }
                this.changeNinjaToolAmount(toolId, -1, queuePush);
                h["ninja_tool_" + slotType] = toolId;
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            respond({});
            return true;
        }
        if (cmd === SVRCMD.UnWearNinjaTool) {
            var heroId = Number((params && params[0]) || 0);
            var slotType = Number((params && params[1]) || 1);
            var updatedToolObj = null;
            if (this.data.heros[heroId] && slotType >= 1 && slotType <= 6) {
                var h = this.data.heros[heroId];
                var prevTool = Number(h["ninja_tool_" + slotType] || 0);
                if (prevTool > 0) {
                    h["ninja_tool_" + slotType] = 0;
                    var newAmt = this.changeNinjaToolAmount(prevTool, 1, queuePush);
                    updatedToolObj = { ninja_tool_id: prevTool, amount: newAmt };
                    queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
                }
            }
            respond({ ninja_tool: updatedToolObj });
            return true;
        }
        if (cmd === SVRCMD.UpgradeNinjaTool) {
            var baseToolId = Number((params && params[0]) || 0);
            var matStr = String((params && params[1]) || "");
            var ntCfg = (typeof Config !== "undefined" && Config.ninja_tool && Config.ninja_tool[baseToolId]) ? Config.ninja_tool[baseToolId] : null;
            var outItems = [];
            var targetToolId = ntCfg ? Number(ntCfg.target_item || 0) : 0;
            if (targetToolId > 0) {
                // Deduct base tool
                this.changeNinjaToolAmount(baseToolId, -1, queuePush);
                // Deduct materials in params[1]
                var mats = matStr.split(",");
                for (var mi = 0; mi < mats.length; mi++) {
                    var mId = Number(mats[mi]);
                    if (mId > 0) {
                        this.changeNinjaToolAmount(mId, -1, queuePush);
                    }
                }
                // Deduct extra forge items if required
                if (ntCfg.forge_item && ntCfg.forge_item != "0") {
                    var forgeItemParts = String(ntCfg.forge_item).split(";");
                    for (var fi = 0; fi < forgeItemParts.length; fi++) {
                        var p = forgeItemParts[fi].split(",");
                        if (p.length >= 2) {
                            var fItemId = Number(p[0]);
                            var fItemAmt = Number(p[1]);
                            if (fItemId > 0 && fItemAmt > 0) {
                                this.changeItemAmount(fItemId, -fItemAmt, queuePush);
                            }
                        }
                    }
                }
                if (ntCfg.forge_coin > 0) {
                    this.data.gold = Math.max(0, Number(this.data.gold || 0) - Number(ntCfg.forge_coin));
                }
                if (ntCfg.forge_stone > 0) {
                    this.data.stone = Math.max(0, Number(this.data.stone || 0) - Number(ntCfg.forge_stone));
                }
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

                // Add upgraded target tool
                this.changeNinjaToolAmount(targetToolId, 1, queuePush);
                outItems.push({ type: 13, item_id: targetToolId, amount: 1 });
            }
            respond({ items: outItems });
            return true;
        }

        // 12. Kage Tournament / Crusade & Lost Tower & Endless Tower ("Tranh Bá" - LostTowerChooseView.js, LostTowerView.js, NOEndTowerView.js, ExpeditionMain.js)
        if (cmd === SVRCMD.PlayerTowerInfo || cmd === SVRCMD.GetTowerLayer || cmd === SVRCMD.ResetTower || cmd === SVRCMD.ResetTowerEx) {
            var nowSec = Math.floor(Date.now() / 1000);
            if (cmd === SVRCMD.ResetTower || cmd === SVRCMD.ResetTowerEx) {
                this.data.tower_cur_layer = 1;
                this.data.tower_layers = {};
                this.data.tower_heros = {};
            }
            var curLayer = Number(this.data.tower_cur_layer || 1);
            var reqLayer = (cmd === SVRCMD.GetTowerLayer && params && params[0]) ? Number(params[0]) : curLayer;
            if (!this.data.tower_layers) this.data.tower_layers = {};
            if (!this.data.tower_layers[reqLayer]) {
                var enemyIds = [10010, 10020, 10040];
                var enemyHeros = [];
                for (var ei = 0; ei < enemyIds.length; ei++) {
                    var eh = this.createDefaultHeroRecord(enemyIds[ei]);
                    eh.lv = Math.max(10, reqLayer * 3);
                    eh.level = eh.lv;
                    eh.quality = Math.min(10, 1 + Math.floor(reqLayer / 3));
                    eh.hp = 1500 + reqLayer * 500;
                    eh.maxhp = eh.hp;
                    eh.atk = 120 + reqLayer * 40;
                    eh.def = 40 + reqLayer * 15;
                    eh.mp = 100 + reqLayer * 35;
                    eh.mp_def = 40 + reqLayer * 15;
                    eh.cri = 10;
                    eh.mp_cri = 10;
                    eh.power = 0;
                    enemyHeros.push(eh);
                }
                this.data.tower_layers[reqLayer] = {
                    player_id: 1,
                    layer: reqLayer,
                    has_pass: 0,
                    player_icon: 80110010,
                    player_lv: Math.max(10, reqLayer * 3),
                    player_name: "Thủ Vệ Tầng " + reqLayer,
                    box_1_id: 0,
                    box_2_id: 0,
                    box_3_id: 0,
                    box_4_id: 0,
                    heros: JSON.stringify(enemyHeros)
                };
            }
            respond({
                max: 35,
                refreshTime: 86400,
                tower: {
                    player_id: 1,
                    create_time: nowSec - 3600,
                    cur_layer: curLayer,
                    heros: JSON.stringify(this.data.tower_heros || {})
                },
                layer: this.data.tower_layers[reqLayer]
            });
            return true;
        }
        if (cmd === SVRCMD.CheckTowerTime) {
            respond({});
            return true;
        }
        if (cmd === SVRCMD.AfterTowerFight) {
            var heroObj = (params && params[1]) || {};
            this.data.tower_heros = heroObj;
            var curLayer = Number(this.data.tower_cur_layer || 1);
            if (this.data.tower_layers && this.data.tower_layers[curLayer]) {
                this.data.tower_layers[curLayer].has_pass = 1;
            }
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.OpenTowerBox) {
            var targetLayer = Number((params && params[0]) || this.data.tower_cur_layer || 1);
            if (!this.data.tower_layers) this.data.tower_layers = {};
            if (!this.data.tower_layers[targetLayer]) {
                var enemyIds = [10010, 10020, 10040];
                var enemyHeros = [];
                for (var ei = 0; ei < enemyIds.length; ei++) {
                    enemyHeros.push({
                        id: enemyIds[ei],
                        hero_id: enemyIds[ei],
                        lv: Math.min(100, 30 + targetLayer * 2),
                        quality: Math.min(13, 7 + Math.floor(targetLayer / 5))
                    });
                }
                this.data.tower_layers[targetLayer] = {
                    player_id: 1,
                    layer: targetLayer,
                    has_pass: 1,
                    player_name: "Thủ Vệ Tầng " + targetLayer,
                    player_lv: Math.min(100, 40 + targetLayer * 2),
                    player_icon: 80110010,
                    box_1_id: 4201,
                    box_2_id: 4202,
                    box_3_id: 4203,
                    box_4_id: 4204,
                    heros: JSON.stringify(enemyHeros)
                };
            }
            var lData = this.data.tower_layers[targetLayer];
            lData.has_pass = 1;
            var chosenKey = 0;
            var boxIndex = 0;
            for (var bi = 1; bi <= 4; bi++) {
                if (Number(lData["box_" + bi + "_id"] || 0) > 0) {
                    chosenKey = Number(lData["box_" + bi + "_id"]);
                    boxIndex = bi;
                    break;
                }
            }
            if (!chosenKey) {
                chosenKey = 4204;
                boxIndex = 1;
            }
            lData["box_" + boxIndex + "_id"] = 0;

            if (this.data.tower_cur_layer < 35 && this.data.tower_cur_layer <= targetLayer) {
                this.data.tower_cur_layer = targetLayer + 1;
            }

            var bdItem = (typeof Config !== "undefined" && Config.box_drop_item && Config.box_drop_item[chosenKey]) ? Config.box_drop_item[chosenKey] : null;
            var itemData = null;
            if (bdItem) {
                itemData = {
                    type: Number(bdItem.type || 1),
                    item_id: Number(bdItem.item_id || 10030),
                    amount: Math.max(1, Number(bdItem.amount || 2) * 2)
                };
                if (itemData.type == 2) this.changeEquipAmount(itemData.item_id, itemData.amount, queuePush);
                else this.changeItemAmount(itemData.item_id, itemData.amount, queuePush);
            } else {
                itemData = { type: 1, item_id: 10030, amount: 10 };
                this.changeItemAmount(10030, 10, queuePush);
            }

            respond({
                item: itemData,
                layer: lData
            });
            return true;
        }
        if (cmd === SVRCMD.NoEndTowerInfo) {
            var diff = Number((params && params[0]) || 10);
            if (!this.data.noend_towers) this.data.noend_towers = {};
            if (!this.data.noend_towers[diff]) {
                this.data.noend_towers[diff] = { layer: 0, max_layer: 0, status: 0, difficulty: diff };
            }
            respond(this.data.noend_towers[diff]);
            return true;
        }
        if (cmd === SVRCMD.AfterNoEndTowerFight) {
            var isWin = Number((params && params[1]) !== undefined ? params[1] : 1);
            var diff = Number(this.data.last_noend_diff || 10);
            if (!this.data.noend_towers) this.data.noend_towers = {};
            if (!this.data.noend_towers[diff]) {
                this.data.noend_towers[diff] = { layer: 0, max_layer: 0, status: 0, difficulty: diff };
            }
            if (isWin) {
                var nt = this.data.noend_towers[diff];
                nt.layer = Number(nt.layer || 0) + 1;
                if (nt.layer > Number(nt.max_layer || 0)) nt.max_layer = nt.layer;
                nt.status = 1; // Ready to open reward chest
            }
            respond(this.data.noend_towers[diff]);
            return true;
        }
        if (cmd === SVRCMD.OpenNoEndTowerBox || cmd === SVRCMD.NoEndSkipLayer) {
            var diff = Number((params && params[0]) || 10);
            if (!this.data.noend_towers) this.data.noend_towers = {};
            if (!this.data.noend_towers[diff]) {
                this.data.noend_towers[diff] = { layer: 1, max_layer: 1, status: 0, difficulty: diff };
            }
            var nt = this.data.noend_towers[diff];
            if (cmd === SVRCMD.NoEndSkipLayer) {
                nt.layer = Number(nt.layer || 0) + 1;
                nt.status = 1;
            } else {
                nt.status = 0;
            }
            this.data.gold = Number(this.data.gold || 0) + 100000;
            this.changeItemAmount(10030, 10, queuePush);
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({
                layer: nt.layer,
                max_layer: nt.max_layer,
                status: nt.status,
                difficulty: diff,
                rewards: [
                    { type: 4, item_id: 0, amount: 100000 },
                    { type: 1, item_id: 10030, amount: 10 }
                ]
            });
            return true;
        }
        if (cmd === SVRCMD.NoEndTowerRank) {
            var diff = Number((params && params[0]) || 10);
            respond({
                difficulty: diff,
                ranks: [
                    { rank: 1, icon: Number(this.data.icon || 80110070), player_name: this.data.team_name || "Nhẫn Giả", player_lv: Number(this.data.team_lv || 1), group_name: "Konoha", layer: 50 }
                ]
            });
            return true;
        }
        if (cmd === SVRCMD.GetNinjaPassData) {
            respond({ "1": 1, "2": 1, "3": 1, "4": 1 });
            return true;
        }
        if (cmd === SVRCMD.SetNinjaFightDifficult) {
            var diff = Number((params && params[0]) || 1);
            this.data.expedition_diff = diff;
            this.data.expedition_wave = 1;
            this.data.expedition_picked = {};
            this.save();
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.NinjaFightInfo) {
            var curDiff = Number(this.data.expedition_diff || 1);
            var maxWaves = (curDiff === 4 ? 50 : 15);
            var curWave = Math.min(maxWaves + 1, Number(this.data.expedition_wave || 1));
            var waves = [];
            for (var w = 1; w <= curWave; w++) {
                waves.push({
                    wave: w,
                    is_win: (w < curWave) ? 1 : 0,
                    has_pick: (this.data.expedition_picked && this.data.expedition_picked[w]) ? 1 : 0,
                    npc_name: "Nhẫn Giả Ải " + w,
                    npc_lv: Math.min(120, 20 + Math.floor(w * (curDiff === 4 ? 2 : 5))),
                    npc_quality: Math.min(15, 2 + Math.floor(w * (curDiff === 4 ? 0.25 : 0.8))),
                    base_level: 100,
                    npc: "10050,10010,10020,10030,10040",
                    npc_info: ""
                });
            }
            respond({
                ninjaFight: {
                    difficult: curDiff,
                    current_wave: curWave,
                    hero_info: this.data.expedition_hero_info || "",
                    hire_info: "",
                    hire_hero: "",
                    hire_key: "",
                    status: 0,
                    reset_count: 0
                },
                stageCount: maxWaves,
                hasPass3: 1,
                canSweep: (curDiff === 4 ? 0 : 1),
                fightWaves: waves
            });
            return true;
        }
        if (cmd === SVRCMD.BeforeNinjaFight) {
            var wave = Number((params && params[0]) || this.data.expedition_wave || 1);
            respond({ sign: "expedition_" + (this.data.team_name || "player") + "_" + wave + "_" + Date.now() });
            return true;
        }
        if (cmd === SVRCMD.AfterNinjaFight) {
            var isWin = Number((params && params[1]) !== undefined ? params[1] : 1);
            var curDiff = Number(this.data.expedition_diff || 1);
            var maxWaves = (curDiff === 4 ? 50 : 15);
            if (isWin) {
                if (params && params[3]) {
                    this.data.expedition_hero_info = JSON.stringify(params[3]);
                }
                this.data.expedition_wave = Math.min(maxWaves + 1, Number(this.data.expedition_wave || 1) + 1);
                this.addTeamExp(20);
                this.save();
            }
            respond({ is_win: isWin ? 1 : 0 });
            return true;
        }
        if (cmd === SVRCMD.OpenNinjaFightBox || cmd === SVRCMD.SweepNinja) {
            var curDiff = Number(this.data.expedition_diff || 1);
            var waveIdx = Number((params && params[0]) || 1);
            if (!this.data.expedition_picked) this.data.expedition_picked = {};
            this.data.expedition_picked[waveIdx] = 1;

            if (curDiff === 4) {
                // Siêu khó: Tạm thời chưa có phần thưởng theo yêu cầu
                respond({ items: [] });
                return true;
            }

            var goldGain = 150000 * waveIdx;
            this.data.gold = Number(this.data.gold || 0) + goldGain;
            var dropEquip = 20000 + waveIdx;
            this.changeEquipAmount(dropEquip, 3, queuePush);
            this.changeItemAmount(50040, 500 * waveIdx, queuePush);
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            this.save();

            respond({
                items: [
                    { box_id: 60000 + waveIdx * 10 + 1, type: 4, item_id: 0, amount: goldGain },
                    { box_id: 60000 + waveIdx * 10 + 2, type: 2, item_id: dropEquip, amount: 3 }
                ]
            });
            return true;
        }
        if (cmd === SVRCMD.ResetNinjaFight) {
            var nfResetCost = 50;
            if (!this.canDeductStone(nfResetCost)) {
                return respond({}, { code: 1, msg: "Không đủ Kim Cương để làm mới Tranh Bá!" });
            }
            this.deductStone(nfResetCost, queuePush);
            this.data.expedition_wave = 1;
            this.data.expedition_picked = {};
            this.data.expedition_hero_info = "";
            this.data.expedition_diff = (params && params[0]) ? Number(params[0]) : 1;
            this.data.daily_counts["NINJA_FIGHT_RESET_COUNT"] = Number(this.data.daily_counts["NINJA_FIGHT_RESET_COUNT"] || 0) + 1;
            this.save();
            respond({});
            return true;
        }
        if (cmd === SVRCMD.GetGroupHires) {
            var hiresList = [
                {
                    id: 14,
                    player_id: 302,
                    player_name: "Minato Namikaze",
                    player_lv: 100,
                    player_icon: 1010020,
                    hero_id: 11060,
                    hero: JSON.stringify(this.computeHeroPayload(11060))
                },
                {
                    id: 19,
                    player_id: 251,
                    player_name: "Itachi Uchiha",
                    player_lv: 100,
                    player_icon: 24011061,
                    hero_id: 11000,
                    hero: JSON.stringify(this.computeHeroPayload(11000))
                },
                {
                    id: 5453,
                    player_id: 1123,
                    player_name: "Jiraiya",
                    player_lv: 95,
                    player_icon: 30611060,
                    hero_id: 10650,
                    hero: JSON.stringify(this.computeHeroPayload(10650))
                }
            ];
            respond({ hires: hiresList });
            return true;
        }
        if (cmd === "GetPlayerHires" || cmd === "GetPlayerHireEx") {
            if (!this.data.my_hires) this.data.my_hires = [];
            var myHiresList = [];
            var nowSec = Math.floor(Date.now() / 1000);
            for (var mhi = 0; mhi < this.data.my_hires.length; mhi++) {
                var mhHeroId = Number(this.data.my_hires[mhi]);
                myHiresList.push({
                    id: mhi + 1,
                    hero_id: mhHeroId,
                    hero: JSON.stringify(this.computeHeroPayload(mhHeroId)),
                    hire_time: nowSec - 3600,
                    camp_gold: 50000,
                    hire_gold: 12400,
                    max_gold: 115000
                });
            }
            respond({ hires: myHiresList });
            return true;
        }
        if (cmd === SVRCMD.SetHire) {
            var hId = Number((params && params[0]) || 0);
            if (!this.data.my_hires) this.data.my_hires = [];
            if (hId > 0 && this.data.my_hires.indexOf(hId) === -1) {
                this.data.my_hires.push(hId);
                this.save();
            }
            respond({ success: true, hero_id: hId });
            return true;
        }
        if (cmd === "RemoveHire" || cmd === SVRCMD.RemoveHire) {
            var hId = Number((params && params[0]) || 0);
            if (!this.data.my_hires) this.data.my_hires = [];
            var idx = this.data.my_hires.indexOf(hId);
            if (idx !== -1) {
                this.data.my_hires.splice(idx, 1);
            }
            var goldGained = 62400;
            this.data.gold = Number(this.data.gold || 0) + goldGained;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            this.save();
            respond({ hire_gold: 0, camp_gold: goldGained, total_gold: goldGained });
            return true;
        }

        // 13. Arena, Shadow Arena & Limited Arena ("Đấu Trường", "Đấu Trường LSV", "Arena Limited" - PkView.js, ShadowView.js, ArenaLimitedView.js)
        if (cmd === "LimitedArenaInfo" || cmd === "LimitedArenaLineup" || cmd === "LimitedArenaClearCD" || cmd === "LimitedArenaBuyFights") {
            var allowedHeroIds = [];
            var heroesList = [];
            for (var hid in this.data.heros) {
                var hNum = Number(hid);
                allowedHeroIds.push(hNum);
                var hCfg = (typeof Config !== "undefined" && Config.hero && Config.hero[hNum]) ? Config.hero[hNum] : null;
                heroesList.push({
                    id: hNum,
                    name: hCfg ? hCfg.name : ("Ninja " + hNum),
                    quality: this.data.heros[hNum].quality || 1,
                    star: this.data.heros[hNum].star || 1,
                    type: hCfg ? hCfg.type : 1,
                    owned: true
                });
            }
            var extraPool = [10010, 10020, 10030, 10040, 10050, 10070, 10080, 10090, 10100, 10110, 10120, 10130, 10140, 10150];
            for (var epi = 0; epi < extraPool.length; epi++) {
                var eid = extraPool[epi];
                if (allowedHeroIds.indexOf(eid) === -1) {
                    allowedHeroIds.push(eid);
                    var eCfg = (typeof Config !== "undefined" && Config.hero && Config.hero[eid]) ? Config.hero[eid] : null;
                    heroesList.push({
                        id: eid,
                        name: eCfg ? eCfg.name : ("Ninja " + eid),
                        quality: 1,
                        star: 1,
                        type: eCfg ? eCfg.type : 1,
                        owned: !!this.data.heros[eid]
                    });
                }
            }
            if (!this.data.lim_arena_def || this.data.lim_arena_def.length === 0) {
                this.data.lim_arena_def = [];
                for (var hk in this.data.heros) {
                    this.data.lim_arena_def.push(this.computeHeroPayload(hk));
                    if (this.data.lim_arena_def.length >= 5) break;
                }
            }
            if (!this.data.lim_arena_atk || this.data.lim_arena_atk.length === 0) {
                this.data.lim_arena_atk = this.data.lim_arena_def.slice(0);
            }
            if (cmd === "LimitedArenaLineup" && params && params.length >= 2) {
                var side = String(params[0]);
                var idArr = String(params[1]).split(",");
                var newTeam = [];
                for (var ti = 0; ti < idArr.length; ti++) {
                    var thid = Number(idArr[ti]);
                    if (thid > 0 && this.data.heros[thid]) {
                        newTeam.push(this.computeHeroPayload(thid));
                    }
                }
                if (side === "defense") this.data.lim_arena_def = newTeam;
                else this.data.lim_arena_atk = newTeam;
            }
            var botDef = [this.createDefaultHeroRecord(10020), this.createDefaultHeroRecord(10040), this.createDefaultHeroRecord(10070)];
            var opponents = [
                { rank: 1, fighter_id: -1, player_id: -1, player_name: "Lính Canh #1", player_lv: 20, icon: 10010, fight_value: 2500, win_count: 0, def_heros: botDef },
                { rank: 2, fighter_id: -2, player_id: -2, player_name: "Lính Canh #2", player_lv: 22, icon: 10020, fight_value: 3000, win_count: 0, def_heros: botDef },
                { rank: 3, fighter_id: -3, player_id: -3, player_name: "Lính Canh #3", player_lv: 25, icon: 10030, fight_value: 3500, win_count: 0, def_heros: botDef }
            ];
            respond({
                day: "2026-11-03",
                periodKey: "2026-11-03",
                resetMode: "daily",
                revision: 1,
                heroIds: allowedHeroIds,
                heroes: heroesList,
                rank: Number(this.data.lim_arena_rank || 5),
                winCount: Number(this.data.lim_arena_wins || 3),
                fightCount: 0,
                dailyFights: 5,
                baseDailyFights: 5,
                buyCount: 0,
                buyLimit: 15,
                buyPrice: 50,
                buyFights: 5,
                buyAvailable: true,
                clearCooldownCost: 50,
                cooldown: 0,
                lastFightTime: 0,
                appleRewardAt: "00:00 UTC+7",
                appleRewardRule: "Đấu tối thiểu 3 trận/ngày nhận Táo qua Thư lúc 00:00 UTC+7",
                exchangeHint: "Sự kiện Đổi Thưởng: 100 Táo = 1 Key Vàng",
                attack: this.data.lim_arena_atk,
                defense: this.data.lim_arena_def,
                attackPower: 15000,
                defensePower: 15000,
                opponents: opponents,
                history: []
            });
            return true;
        }
        if (cmd === "LimitedArenaOpponents") {
            var botDef = [this.createDefaultHeroRecord(10020), this.createDefaultHeroRecord(10040), this.createDefaultHeroRecord(10070)];
            respond({
                day: "2026-11-03",
                revision: 1,
                fighters: [
                    { rank: 1, fighter_id: -1, player_id: -1, player_name: "Lính Canh #1", player_lv: 20, icon: 10010, fight_value: 2500, win_count: 0, def_heros: botDef },
                    { rank: 2, fighter_id: -2, player_id: -2, player_name: "Lính Canh #2", player_lv: 22, icon: 10020, fight_value: 3000, win_count: 0, def_heros: botDef },
                    { rank: 3, fighter_id: -3, player_id: -3, player_name: "Lính Canh #3", player_lv: 25, icon: 10030, fight_value: 3500, win_count: 0, def_heros: botDef }
                ]
            });
            return true;
        }
        if (cmd === "LimitedArenaFight") {
            this.data.lim_arena_rank = 1;
            this.data.lim_arena_wins = Number(this.data.lim_arena_wins || 0) + 1;
            this.changeItemAmount(10150, 50, queuePush); // +50 Táo Đỏ
            respond({
                isWin: 1,
                newRank: 1,
                seed: 123456,
                reward: { items: [{ type: 1, item_id: 10150, amount: 50 }] },
                fight_data: ""
            });
            return true;
        }
        if (cmd === "LimitedArenaRank" || cmd === "LimitedArenaHistory") {
            var botDef = [this.createDefaultHeroRecord(10020), this.createDefaultHeroRecord(10040), this.createDefaultHeroRecord(10070)];
            respond({
                day: "2026-11-03",
                revision: 1,
                ranks: [
                    { rank: 1, fighter_id: 1, player_id: 1, player_name: this.data.team_name || "Nhẫn Giả", player_lv: Number(this.data.team_lv || 1), icon: Number(this.data.icon || 80110070), fight_value: 15000, win_count: 5, def_heros: botDef }
                ],
                history: []
            });
            return true;
        }
        if (cmd === SVRCMD.ArenaInfo) {
            var myHerosArr = [];
            for (var hid in this.data.heros) {
                myHerosArr.push(this.computeHeroPayload(hid));
                if (myHerosArr.length >= 5) break;
            }
            respond({
                rank: {
                    rank: 10,
                    icon: Number(this.data.icon || 80110070),
                    win_count: 15,
                    player_lv: Number(this.data.team_lv || 1),
                    player_name: this.data.team_name || "Nhẫn Giả",
                    player_id: 1,
                    fighter_id: 1,
                    fight_value: 5000,
                    server_id: 1,
                    atk_heros: JSON.stringify(myHerosArr),
                    def_heros: JSON.stringify(myHerosArr)
                },
                lastFightTime: 0,
                fightCount: 0,
                buyCount: 0
            });
            return true;
        }
        if (cmd === SVRCMD.MatchFighters || cmd === SVRCMD.MatcDarkhFighters) {
            var myRank = Number(this.data.dark_arena_rank || 100);
            var botHero1 = this.createDefaultHeroRecord(10020);
            var botHero2 = this.createDefaultHeroRecord(10040);
            var botHero3 = this.createDefaultHeroRecord(10070);
            var defStr = JSON.stringify([botHero1, botHero2, botHero3]);
            var r1 = Math.max(1, myRank - 15);
            var r2 = Math.max(1, myRank - 8);
            var r3 = Math.max(1, myRank - 3);
            var list = [
                { rank: r1, icon: 30610460, win_count: 50, player_lv: 85, player_name: "Kakashi Hatake", player_id: 101, fighter_id: 101, fight_value: 696039, server_id: 1, def_heros: defStr, def_heros_1: defStr, def_heros_2: defStr, def_heros_3: defStr },
                { rank: r2, icon: 80110020, win_count: 30, player_lv: 80, player_name: "Naruto Uzumaki", player_id: 102, fighter_id: 102, fight_value: 580000, server_id: 1, def_heros: defStr, def_heros_1: defStr, def_heros_2: defStr, def_heros_3: defStr },
                { rank: r3, icon: 80110040, win_count: 10, player_lv: 75, player_name: "Sakura Haruno", player_id: 103, fighter_id: 103, fight_value: 450000, server_id: 1, def_heros: defStr, def_heros_1: defStr, def_heros_2: defStr, def_heros_3: defStr }
            ];
            respond(list);
            return true;
        }
        if (cmd === SVRCMD.PlayerArenaInfo || cmd === SVRCMD.PlayerDarkArenaInfo) {
            var fId = Number((params && params[0]) || 101);
            var botHero1 = this.createDefaultHeroRecord(10020);
            var botHero2 = this.createDefaultHeroRecord(10040);
            var botHero3 = this.createDefaultHeroRecord(10070);
            var defStr = JSON.stringify([botHero1, botHero2, botHero3]);
            respond({
                player_id: fId,
                fighter_id: fId,
                server_id: 1,
                team_num: 3,
                win_count: 25,
                rank: 15,
                player_name: "Thủ Vệ " + fId,
                player_lv: 80,
                icon: 30610460,
                fight_value: 500000,
                def_heros_1: defStr,
                def_heros_2: defStr,
                def_heros_3: defStr
            });
            return true;
        }
        if (cmd === SVRCMD.SetArenaLineup || cmd === SVRCMD.SetDarkArenaLineup || cmd === SVRCMD.ClearArenaFightCD || cmd === SVRCMD.ClearDarkArenaFightCD || cmd === SVRCMD.BuyArenaFightNum || cmd === SVRCMD.BuyDarkArenaFightNum) {
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.ArenaFight || cmd === SVRCMD.DarkArenaFight) {
            var targetFighterId = Number((params && params[0]) || 0);
            var reqId = (params && params[4]) ? String(params[4]) : "";
            this.data.stone = Number(this.data.stone || 0) + 100;
            this.data.arena_point = Number(this.data.arena_point || 0) + 200;
            var curRank = Number(this.data.arena_rank || 10);
            var newRank = Math.max(1, curRank - 1);
            this.data.arena_rank = newRank;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            this.save();
            respond({
                skipReply: true,
                isWin: 1,
                arena_request_id: reqId,
                rank: newRank,
                settled: true,
                reward: { gold: 50000, stone: 100 }
            });
            return true;
        }
        if (cmd === SVRCMD.ArenaFightReport || cmd === SVRCMD.DarkArenaFightReport) {
            this.data.stone = Number(this.data.stone || 0) + 100;
            this.data.arena_point = Number(this.data.arena_point || 0) + 200;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ status: 1, rankChange: 1, bestRankChange: 1, stone: 100 });
            return true;
        }
        if (cmd === "DarkArenaFightHistoryInfo") {
            respond({ history: { fight_data: "{}" } });
            return true;
        }
        if (cmd === SVRCMD.ArenaRank || cmd === SVRCMD.DarkArenaRank) {
            var topRanks = [
                { fighter_id: 18, player_id: 18, player_name: "Boo", player_lv: 102, icon: 4011040, rank: 1 },
                { fighter_id: 38, player_id: 38, player_name: "Bá Khí", player_lv: 100, icon: 80110050, rank: 2 },
                { fighter_id: 1, player_id: 1, player_name: this.data.team_name || "Nhẫn Giả", player_lv: Number(this.data.team_lv || 1), icon: Number(this.data.icon || 2010080), rank: Number(this.data.dark_arena_rank || 10) }
            ];
            respond({ ranks: topRanks, logs: [] });
            return true;
        }
        if (cmd === SVRCMD.ArenaFightHistory || cmd === SVRCMD.DarkArenaFightHistory) {
            var nowSec = Math.floor(Date.now() / 1000);
            var sampleHeros = "[{\"hero_id\":11040,\"id\":11040,\"lv\":70,\"quality\":8}]";
            respond({
                logs: [],
                history: [
                    {
                        id: 4453,
                        atk_id: 1,
                        atk_name: this.data.team_name || "Nhẫn Giả",
                        atk_lv: Number(this.data.team_lv || 1),
                        atk_icon: Number(this.data.icon || 2010080),
                        atk_heros_1: sampleHeros,
                        atk_heros_2: sampleHeros,
                        atk_heros_3: sampleHeros,
                        def_id: 101,
                        def_name: "Kakashi Hatake",
                        def_lv: 85,
                        def_icon: 30610460,
                        def_heros_1: sampleHeros,
                        def_heros_2: sampleHeros,
                        def_heros_3: sampleHeros,
                        is_win: 1,
                        fight_time: nowSec - 300
                    }
                ]
            });
            return true;
        }
        if (cmd === SVRCMD.DarkArenaInfo) {
            var myHerosArr = [];
            for (var hid in this.data.heros) {
                myHerosArr.push(this.computeHeroPayload(hid));
                if (myHerosArr.length >= 3) break;
            }
            var defStr = JSON.stringify(myHerosArr);
            respond({
                rank: {
                    rank: 10,
                    icon: Number(this.data.icon || 80110070),
                    win_count: 10,
                    player_lv: Number(this.data.team_lv || 1),
                    player_name: this.data.team_name || "Nhẫn Giả",
                    player_id: 1,
                    fighter_id: 1,
                    fight_value: 5000,
                    server_id: 1,
                    def_heros_1: defStr,
                    def_heros_2: defStr,
                    def_heros_3: defStr
                },
                fightCount: 0,
                lastFightTime: 0,
                hour_point: 50,
                total_point: 500
            });
            return true;
        }
        if (cmd === SVRCMD.ReceiceDarkArenaRecordPoint) {
            this.data.dark_arena_point = Number(this.data.dark_arena_point || 0) + 500;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ point: 500, status: 1, total_point: 0 });
            return true;
        }

        // 14. Forest, Trials, Tailed Beast Boss & Mineral ("Khu Rừng Chết", "Thử Thách", "Vĩ Thú", "Cứ Điểm")
        if (cmd === SVRCMD.HasSepcialChapterOpenInEvent) {
            respond({ hasOpenInEvent: true });
            return true;
        }
        if (cmd === SVRCMD.GetChapterPerDayCountMulti || cmd === SVRCMD.GetTreasureDropMulti) {
            respond({ multi: 0, mulit: 0 });
            return true;
        }
        if (cmd === SVRCMD.ChapterCountInfo) {
            var cid = Number((params && params[0]) || 0);
            if (!this.data.chapter_counts) this.data.chapter_counts = {};
            var cInfo = this.data.chapter_counts[cid] || { todayCount: 0, resetCount: 0 };
            respond({ todayCount: Number(cInfo.todayCount || 0), resetCount: Number(cInfo.resetCount || 0) });
            return true;
        }
        if (cmd === SVRCMD.ResetChapter) {
            var cid = Number((params && params[0]) || 0);
            var diff = Number((params && params[1]) || 1);
            if (!this.data.chapter_counts) this.data.chapter_counts = {};
            var cInfo = this.data.chapter_counts[cid] || { todayCount: 0, resetCount: 0 };
            var rCount = Number(cInfo.resetCount || 0);
            var nextTier = rCount + 1;
            var resetPrice = nextTier * 10;
            if (typeof Config !== "undefined" && Config.goods2 && Config.goods2[9201] && Config.goods2[9201][nextTier]) {
                resetPrice = Number(Config.goods2[9201][nextTier].price || resetPrice);
            }
            if (!self.canDeductStone(resetPrice)) {
                return respond({}, { code: 1, msg: "Không đủ Kim Cương để làm mới ải!" });
            }
            self.deductStone(resetPrice, queuePush);
            cInfo.resetCount = nextTier;
            cInfo.todayCount = 0;
            this.data.chapter_counts[cid] = cInfo;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({});
            return true;
        }
        if (cmd === SVRCMD.SweepSpecial) {
            var cid = Number((params && params[0]) || 55013);
            var diff = Number((params && params[1]) || 4);
            var times = Number((params && params[2]) || 1);

            if (!this.data.chapter_counts) this.data.chapter_counts = {};
            var cInfo = this.data.chapter_counts[cid] || { todayCount: 0, resetCount: 0 };
            cInfo.todayCount = Number(cInfo.todayCount || 0) + times;
            this.data.chapter_counts[cid] = cInfo;

            var spCost = 6 * times;
            this.data.sp = Math.max(0, Number(this.data.sp || 120) - spCost);
            this.addTeamExp(6 * times);
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

            var allItems = [];
            for (var t = 0; t < times; t++) {
                var roundDrops = [
                    { type: 7, item_id: 30703, amount: 1 },
                    { type: 7, item_id: 30705, amount: 1 },
                    { type: 1, item_id: 10020, amount: 2 }
                ];
                for (var rdi = 0; rdi < roundDrops.length; rdi++) {
                    this.changeItemAmount(roundDrops[rdi].item_id, roundDrops[rdi].amount, queuePush);
                }
                allItems.push(roundDrops);
            }
            respond({ exp: 6, gold: 0, allItems: allItems });
            return true;
        }
        if (cmd === SVRCMD.AfterSpecialFight) {
            this.data.gold = Number(this.data.gold || 0) + 20000;
            this.changeItemAmount(10020, 3, queuePush);
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ isFirst3Star: false, items: [{ type: 1, item_id: 10020, amount: 3 }] });
            return true;
        }

        if (cmd === SVRCMD.GetAllHeroStatus) {
            var stMap = {};
            for (var hk in this.data.heros) {
                stMap[hk] = 0;
            }
            respond({ status: stMap });
            return true;
        }
        if (cmd === SVRCMD.DailyTaskAward) {
            var taskId = Number((params && params[0]) || 0);
            this.data.daily_counts["PLAYER_COMPLETE_DAILT_TASK_" + taskId] = 1;
            var dtCfg = (typeof Config !== "undefined" && Config.daily_task && Config.daily_task[taskId]) ? Config.daily_task[taskId] : null;
            if (dtCfg) {
                if (dtCfg.exp > 0) this.addTeamExp(Number(dtCfg.exp));
                if (dtCfg.gold > 0) this.data.gold = Number(this.data.gold || 0) + Number(dtCfg.gold);
                if (dtCfg.stone > 0) this.data.stone = Number(this.data.stone || 0) + Number(dtCfg.stone);
                if (dtCfg.sp > 0) this.data.sp = Number(this.data.sp || 0) + Number(dtCfg.sp);
                for (var ri = 1; ri <= 3; ri++) {
                    var rType = Number(dtCfg["reward_type_" + ri] || 0);
                    var rId = Number(dtCfg["item_id_" + ri] || 0);
                    var rAmt = Number(dtCfg["amount_" + ri] || 0);
                    if (rType === 1 && rId > 0) this.changeItemAmount(rId, rAmt, queuePush);
                    else if (rType === 2 && rId > 0) {
                        if (rId >= 30000) this.addSecretEquip(rId, rAmt, queuePush);
                        else this.changeEquipAmount(rId, rAmt, queuePush);
                    } else if (rType === 3) this.data.gold = Number(this.data.gold || 0) + rAmt;
                    else if (rType === 4) this.data.stone = Number(this.data.stone || 0) + rAmt;
                    else if (rType === 5) this.data.sp = Number(this.data.sp || 0) + rAmt;
                }
            } else {
                this.addTeamExp(100);
                this.data.stone = Number(this.data.stone || 0) + 100;
            }
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({});
            return true;
        }
        if (cmd === SVRCMD.ReceiveAchievement) {
            var achId = Number((params && params[0]) || 0);
            if (!this.data.achievements) this.data.achievements = {};
            this.data.achievements["PLAYER_ACHIEVEMENT_" + achId] = 1;
            var aCfg = (typeof Config !== "undefined" && Config.achievement && Config.achievement[achId]) ? Config.achievement[achId] : null;
            if (aCfg) {
                for (var ai = 1; ai <= 3; ai++) {
                    var aType = Number(aCfg["reward_type_" + ai] || 0);
                    var aItemId = Number(aCfg["item_id_" + ai] || 0);
                    var aAmt = Number(aCfg["amount_" + ai] || 0);
                    if (aType === 1 && aItemId > 0) this.changeItemAmount(aItemId, aAmt, queuePush);
                    else if (aType === 2 && aItemId > 0) {
                        if (aItemId >= 30000) this.addSecretEquip(aItemId, aAmt, queuePush);
                        else this.changeEquipAmount(aItemId, aAmt, queuePush);
                    } else if (aType === 3) this.data.gold = Number(this.data.gold || 0) + aAmt;
                    else if (aType === 4) this.data.stone = Number(this.data.stone || 0) + aAmt;
                }
            } else {
                this.data.stone = Number(this.data.stone || 0) + 100;
            }
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({});
            return true;
        }
        if (cmd === SVRCMD.ReceiveLevelAward || cmd === SVRCMD.GetLvReward) {
            var lvAward = Number((params && params[0]) || 10);
            if (!this.data.lv_rewards) this.data.lv_rewards = [];
            if (this.data.lv_rewards.indexOf(lvAward) === -1) this.data.lv_rewards.push(lvAward);
            this.data.stone = Number(this.data.stone || 0) + 300;
            this.data.gold = Number(this.data.gold || 0) + 100000;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ rewards: this.data.lv_rewards });
            return true;
        }

        // 15. Misc & Other Modules
        if (cmd === "GetFaceBookUrl" || cmd === SVRCMD.GetFaceBookUrl) {
            respond({ url: "" });
            return true;
        }
        if (cmd === SVRCMD.LanternInfo) {
            respond({
                lanterns: [
                    {
                        id: 1,
                        msg: "Chào mừng các Nhẫn Giả bước vào thế giới Shinobi Saga Offline!",
                        content: "Chào mừng các Nhẫn Giả bước vào thế giới Shinobi Saga Offline!",
                        from: 0,
                        to: 2147483647,
                        interval: 60,
                        type: 1
                    }
                ]
            });
            return true;
        }
        if (cmd === SVRCMD.DailyGet || cmd === SVRCMD.MidnightGet) {
            var k = (params && params[0]) || "";
            respond({ key: k, value: Number(this.data.daily_counts[k] || 0) });
            return true;
        }
        if (cmd === SVRCMD.SpInfo) {
            respond({ sp: Number(this.data.sp || 120), spTime: Math.floor(Date.now() / 1000), next_time: 0, max_sp: 194 });
            return true;
        }
        if (cmd === SVRCMD.ChatMessage) {
            respond({ chats: [] });
            return true;
        }
        if (cmd === SVRCMD.BlackList) {
            respond({ blacks: [] });
            return true;
        }
        if (cmd === SVRCMD.PlayerGroupInfo) {
            if (this.data.group_id && Number(this.data.group_id) > 0) {
                respond({
                    playerGroup: {
                        group_id: Number(this.data.group_id || 1),
                        player_id: 1,
                        role: Number(this.data.group_role || 1),
                        contribution: Number(this.data.group_contribution || 0)
                    },
                    group: {
                        id: Number(this.data.group_id || 1),
                        name: this.data.group_name || "Làng Lá",
                        level: Number(this.data.group_level || 1),
                        exp: Number(this.data.group_exp || 0),
                        notice: this.data.group_notice || "Chào mừng các Nhẫn Giả đến với Bang Hội!",
                        president_id: Number(this.data.group_role === 1 ? 1 : 100),
                        created_at: 1793709061,
                        icon: Number(this.data.group_icon || 20806),
                        capacity: 30,
                        join_type: Number(this.data.group_join_type || 1),
                        min_lv: Number(this.data.group_min_lv || 30),
                        size: Number(this.data.group_size || 5),
                        resource: Number(this.data.group_resource || 10000),
                        last_opponent: "",
                        last_opponent_icon: 0,
                        last_point: 0,
                        last_opponent_point: 0,
                        last_is_win: 0
                    }
                });
            } else {
                respond({});
            }
            return true;
        }
        if (cmd === "BestMatchGroups") {
            respond({
                groups: [
                    { id: 1, name: "Làng Lá", level: 5, icon: 20806, capacity: 30, size: 18, min_lv: 30, president_name: "Naruto", notice: "Kế thừa Hỏa Chí!" },
                    { id: 2, name: "Akatsuki", level: 6, icon: 20002, capacity: 30, size: 24, min_lv: 40, president_name: "Pain", notice: "Thế giới sẽ biết nỗi đau." },
                    { id: 3, name: "Uchiha Clan", level: 4, icon: 20003, capacity: 30, size: 15, min_lv: 30, president_name: "Itachi", notice: "Gia tộc Uchiha chiêu mộ." }
                ]
            });
            return true;
        }
        if (cmd === SVRCMD.CreateGroup) {
            this.data.group_id = 11;
            this.data.group_name = (params && params[0]) ? String(params[0]) : "Bang Hội";
            this.data.group_icon = (params && params[1]) ? Number(params[1]) : 20806;
            this.data.group_role = 1;
            this.data.group_level = 1;
            this.data.group_exp = 0;
            this.data.group_contribution = 0;
            this.data.group_resource = 10000;
            this.data.group_size = 1;
            this.save();
            respond({
                playerGroup: {
                    group_id: 11,
                    player_id: 1,
                    role: 1,
                    contribution: 0
                },
                group: {
                    id: 11,
                    name: this.data.group_name,
                    level: 1,
                    exp: 0,
                    notice: "",
                    president_id: 1,
                    created_at: Math.floor(Date.now() / 1000),
                    icon: this.data.group_icon,
                    capacity: 30,
                    join_type: 1,
                    min_lv: 30,
                    size: 1,
                    resource: 10000,
                    last_opponent: "",
                    last_opponent_icon: 0,
                    last_point: 0,
                    last_opponent_point: 0,
                    last_is_win: 0
                }
            });
            return true;
        }
        if (cmd === SVRCMD.ApplyGroup) {
            var gId = (params && params[0]) ? Number(params[0]) : 1;
            this.data.group_id = gId;
            this.data.group_name = (gId === 2) ? "Akatsuki" : "Làng Lá";
            this.data.group_role = 4;
            this.save();
            respond({ joined: true });
            return true;
        }
        if (cmd === SVRCMD.ExitGroup) {
            this.data.group_id = 0;
            this.data.group_name = "";
            this.data.group_role = 0;
            this.save();
            respond({ dissolved: true });
            return true;
        }
        if (cmd === SVRCMD.GroupMembers) {
            var mems = [
                {
                    player_id: 1,
                    team_name: this.data.team_name || "Nhẫn Giả",
                    team_lv: Number(this.data.team_lv || 1),
                    icon: Number(this.data.icon || 2010080),
                    role: Number(this.data.group_role || 1),
                    contribution: Number(this.data.group_contribution || 0),
                    last_signin_time: Math.floor(Date.now() / 1000)
                },
                { player_id: 101, team_name: "Uchiha Sasuke", team_lv: 95, icon: 10020, role: 3, contribution: 2500, last_signin_time: Math.floor(Date.now() / 1000) - 1800 },
                { player_id: 102, team_name: "Haruno Sakura", team_lv: 92, icon: 10030, role: 4, contribution: 1800, last_signin_time: Math.floor(Date.now() / 1000) - 3600 },
                { player_id: 103, team_name: "Hatake Kakashi", team_lv: 98, icon: 10050, role: 2, contribution: 3200, last_signin_time: Math.floor(Date.now() / 1000) - 7200 },
                { player_id: 104, team_name: "Nara Shikamaru", team_lv: 90, icon: 10120, role: 4, contribution: 1200, last_signin_time: Math.floor(Date.now() / 1000) - 14400 }
            ];
            respond({ members: mems });
            return true;
        }
        if (cmd === SVRCMD.GroupSetting) {
            if (params && params.length >= 3) {
                this.data.group_icon = Number(params[0]) || this.data.group_icon;
                this.data.group_join_type = Number(params[1]) || this.data.group_join_type;
                this.data.group_min_lv = Number(params[2]) || this.data.group_min_lv;
                this.save();
            }
            respond({});
            return true;
        }
        if (cmd === SVRCMD.GroupApplyLogList) {
            respond({ logs: [] });
            return true;
        }
        if (cmd === "GuildGrowthInfo") {
            var gLv = Number(this.data.group_level || 1);
            var reqExp = gLv * 1000;
            respond({
                guildId: Number(this.data.group_id || 1),
                level: gLv,
                exp: Number(this.data.group_exp || 0),
                expRequired: reqExp,
                maxLevel: 20,
                fund: Number(this.data.group_fund || 500),
                contribution: Number(this.data.group_contribution || 0),
                canUpgrade: true,
                donations: {
                    gold: { currency: "gold", cost: 500000, limit: 5, exp: 100, fund: 100, contribution: 100, used: Number(this.data.guild_donate_gold || 0), left: Math.max(0, 5 - Number(this.data.guild_donate_gold || 0)) },
                    diamond: { currency: "diamond", cost: 100, limit: 3, exp: 100, fund: 100, contribution: 100, used: Number(this.data.guild_donate_gem || 0), left: Math.max(0, 3 - Number(this.data.guild_donate_gem || 0)) }
                },
                skills: [
                    { key: "hp", name: "Sinh lực", level: Number((this.data.guild_skills && this.data.guild_skills.hp) || 0), percent: 0, cap: gLv, cost: 500 },
                    { key: "atk", name: "Công kích", level: Number((this.data.guild_skills && this.data.guild_skills.atk) || 0), percent: 0, cap: gLv, cost: 500 },
                    { key: "def", name: "Phòng thủ", level: Number((this.data.guild_skills && this.data.guild_skills.def) || 0), percent: 0, cap: gLv, cost: 500 }
                ],
                logs: []
            });
            return true;
        }
        if (cmd === "GuildDonate") {
            var kind = (params && params[0]) ? String(params[0]) : "gold";
            if (kind === "diamond") {
                this.data.stone = Math.max(0, Number(this.data.stone || 0) - 100);
                this.data.guild_donate_gem = Number(this.data.guild_donate_gem || 0) + 1;
            } else {
                this.data.gold = Math.max(0, Number(this.data.gold || 0) - 500000);
                this.data.guild_donate_gold = Number(this.data.guild_donate_gold || 0) + 1;
            }
            this.data.group_exp = Number(this.data.group_exp || 0) + 100;
            this.data.group_fund = Number(this.data.group_fund || 0) + 100;
            this.data.group_contribution = Number(this.data.group_contribution || 0) + 100;
            var gLv = Number(this.data.group_level || 1);
            if (this.data.group_exp >= gLv * 1000 && gLv < 20) {
                this.data.group_level = gLv + 1;
                this.data.group_exp = 0;
            }
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            this.save();
            respond({
                guildId: Number(this.data.group_id || 1),
                level: Number(this.data.group_level || 1),
                exp: Number(this.data.group_exp || 0),
                expRequired: Number(this.data.group_level || 1) * 1000,
                maxLevel: 20,
                fund: Number(this.data.group_fund || 500),
                contribution: Number(this.data.group_contribution || 0),
                canUpgrade: true,
                donations: {
                    gold: { currency: "gold", cost: 500000, limit: 5, exp: 100, fund: 100, contribution: 100, used: Number(this.data.guild_donate_gold || 0), left: Math.max(0, 5 - Number(this.data.guild_donate_gold || 0)) },
                    diamond: { currency: "diamond", cost: 100, limit: 3, exp: 100, fund: 100, contribution: 100, used: Number(this.data.guild_donate_gem || 0), left: Math.max(0, 3 - Number(this.data.guild_donate_gem || 0)) }
                },
                skills: [
                    { key: "hp", name: "Sinh lực", level: Number((this.data.guild_skills && this.data.guild_skills.hp) || 0), percent: 0, cap: Number(this.data.group_level || 1), cost: 500 },
                    { key: "atk", name: "Công kích", level: Number((this.data.guild_skills && this.data.guild_skills.atk) || 0), percent: 0, cap: Number(this.data.group_level || 1), cost: 500 },
                    { key: "def", name: "Phòng thủ", level: Number((this.data.guild_skills && this.data.guild_skills.def) || 0), percent: 0, cap: Number(this.data.group_level || 1), cost: 500 }
                ],
                logs: []
            });
            return true;
        }
        if (cmd === "GuildSkillUpgrade") {
            var sKey = (params && params[0]) ? String(params[0]) : "hp";
            if (!this.data.guild_skills) this.data.guild_skills = { hp: 0, atk: 0, def: 0 };
            this.data.guild_skills[sKey] = Number(this.data.guild_skills[sKey] || 0) + 1;
            this.data.group_contribution = Math.max(0, Number(this.data.group_contribution || 0) - 500);
            this.save();
            respond({});
            return true;
        }
        if (cmd === "GetWorShipGold") {
            respond({ count2: 0, gold: 0 });
            return true;
        }
        if (cmd === "Worship") {
            this.data.gold = Number(this.data.gold || 0) + 100000;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            this.save();
            respond({ gold: 100000, count: 1 });
            return true;
        }
        if (cmd === "GetGroupResource") {
            respond({ resource: Number(this.data.group_resource || 10000) });
            return true;
        }
        if (cmd === "GroupStatus") {
            respond({ status: 0, cs_status: 0 });
            return true;
        }
        if (cmd === "GroupFightStatus") {
            respond({ status: 4, change_time: Math.floor(Date.now() / 1000) + 86400 });
            return true;
        }
        if (cmd === "GetGroupLinuUp") {
            respond({
                lineup: {
                    heros: JSON.stringify([{ hero_id: 10010 }, { hero_id: 10020 }, { hero_id: 10030 }]),
                    def_heros: JSON.stringify([{ hero_id: 10010, quality: 1, lv: 1 }, { hero_id: 10020, quality: 1, lv: 1 }, { hero_id: 10030, quality: 1, lv: 1 }])
                }
            });
            return true;
        }
        if (cmd === SVRCMD.SetGroupFightLineupEx || cmd === "SetGroupFightLineup") {
            respond({ status: 1 });
            return true;
        }

        // --- CU DIEM (TREASURE / MINING & PLUNDERING) ---
        if (cmd === SVRCMD.GetTreasureDropMulti) {
            respond({ mulit: 0 });
            return true;
        }
        if (cmd === SVRCMD.PlayerTreasure) {
            respond({ treasures: this.data.treasures || [] });
            return true;
        }
        if (cmd === SVRCMD.DugTreasure) {
            var mineId = (this.data.treasures ? this.data.treasures.length : 0) + 1;
            var nowSec = Math.floor(Date.now() / 1000);
            var newTreasure = {
                id: mineId,
                status: 1,
                types: (params && params[0]) ? Number(params[0]) : 3,
                can_pick: 0,
                has_pick: 0,
                hero_ids: (params && params[1]) ? String(params[1]) : "10010,10020,10030,10040,10050",
                player_id: 1,
                player_lv: Number(this.data.team_lv || 1),
                player_name: this.data.team_name || "Nhẫn Giả",
                player_icon: Number(this.data.icon || 2010080),
                fight_value: 12500,
                create_time: nowSec,
                plunder_time: nowSec + 14400,
                robbed_at: 0,
                is_plundered: 0,
                heros: "[]"
            };
            if (!this.data.treasures) this.data.treasures = [];
            this.data.treasures.push(newTreasure);
            this.save();
            respond({ treasure: newTreasure });
            return true;
        }
        if (cmd === SVRCMD.SearchTreasure) {
            var nowSec = Math.floor(Date.now() / 1000);
            var oppId = 200 + Math.floor(Math.random() * 50);
            var oppMine = {
                id: Math.floor(Math.random() * 10) + 1,
                status: 1,
                types: Math.floor(Math.random() * 3) + 1,
                can_pick: 0,
                has_pick: 0,
                hero_ids: "10070,10400,10120,10200,10230",
                player_id: oppId,
                player_lv: Math.min(100, Math.max(50, Number(this.data.team_lv || 60))),
                player_name: "Nhẫn Giả " + oppId,
                player_icon: 1010020,
                fight_value: 5800 + Math.floor(Math.random() * 2000),
                create_time: nowSec - 3600,
                plunder_time: nowSec + 10800,
                robbed_at: 0,
                is_plundered: 0,
                heros: "[]"
            };
            respond({ treasure: oppMine });
            return true;
        }
        if (cmd === SVRCMD.TreasureInfo) {
            var oppId = Number((params && params[0]) || 215);
            var mId = Number((params && params[1]) || 6);
            var nowSec = Math.floor(Date.now() / 1000);
            respond({
                treasure: {
                    id: mId,
                    status: 1,
                    types: 3,
                    can_pick: 0,
                    has_pick: 0,
                    hero_ids: "10070,10400,10120,10200,10230",
                    player_id: oppId,
                    player_lv: 90,
                    player_name: "Nhẫn Giả " + oppId,
                    player_icon: 1010020,
                    fight_value: 5888,
                    create_time: nowSec - 3600,
                    plunder_time: nowSec + 10800,
                    robbed_at: 0,
                    is_plundered: 0,
                    heros: "[]"
                }
            });
            return true;
        }
        if (cmd === SVRCMD.BeforePlunderTreasure) {
            respond({ sign: "plunder_" + Date.now(), seed: Math.floor(Math.random() * 1000000) });
            return true;
        }
        if (cmd === SVRCMD.AfterPlunderTreasure) {
            var lootItems = [
                { item_id: 60010, amount: 10, type: 1 },
                { item_id: 10210, amount: 8, type: 1 },
                { item_id: 40010, amount: 5, type: 1 }
            ];
            for (var li = 0; li < lootItems.length; li++) {
                this.changeItemAmount(lootItems[li].item_id, lootItems[li].amount, queuePush);
            }
            this.data.gold = Number(this.data.gold || 0) + 50000;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            this.save();
            respond({
                tg_num: 5,
                awardedItemIds: [60010, 10210, 40010],
                gold: 50000,
                items: lootItems,
                itemBalances: lootItems.map(function(it) {
                    return { id: it.item_id, item_id: it.item_id, count: 20, amount: 20 };
                })
            });
            return true;
        }
        if (cmd === SVRCMD.PlunderHistorys) {
            respond({ historys: [] });
            return true;
        }
        // (ReviceTreasure moved to V14 section)
        if (cmd === SVRCMD.MessageInfo) {
            respond({ messages: [] });
            return true;
        }
        if (cmd === SVRCMD.GetLvRewardInfo) {
            respond(this.data.lv_rewards || []);
            return true;
        }
        if (cmd === SVRCMD.ChangeIcon) {
            var newHero = Number((params && params[0]) || 10010) % 100000;
            var curIcon = Number(this.data.icon || 10010);
            var curFrame = Math.floor(curIcon / 100000);
            this.data.icon = curFrame * 100000 + newHero;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ icon: this.data.icon });
            return true;
        }
        if (cmd === SVRCMD.ChangeFrame) {
            var newFrame = Number((params && params[0] !== undefined) ? params[0] : 0);
            var curIcon = Number(this.data.icon || 10010);
            var baseHero = curIcon % 100000;
            this.data.icon = newFrame * 100000 + baseHero;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({
                icon: this.data.icon,
                avatar_frame_ids: [10, 21, 22, 23, 24, 25, 50, 60, 330, 340, 350, 360, 370, 690, 801, 802, 803, 804, 805, 806, 807, 808, 809, 810, 811]
            });
            return true;
        }
        if (cmd === SVRCMD.LsvChatSend || cmd === SVRCMD.Chat) {
            var msgText = (params && params[0]) ? String(params[0]) : "";
            var chatChannel = (params && params[1] !== undefined) ? Number(params[1]) : 0;
            var cId = (this.data.chat_seq = (this.data.chat_seq || 100) + 1);
            var chatObj = {
                id: cId,
                source_server: 1,
                player_id: 1,
                player_name: this.data.team_name || "Nhẫn Giả",
                player_icon: Number(this.data.icon || 2010080),
                player_lv: Number(this.data.team_lv || 1),
                player_vip: Number(this.data.vip_lv || 15),
                create_time: Math.floor(Date.now() / 1000),
                fight_record_id: 0,
                msg: msgText,
                send_to: chatChannel,
                chat_type: chatChannel,
                lsv: true
            };
            if (!this.data.chats) this.data.chats = [];
            this.data.chats.unshift(chatObj);
            if (this.data.chats.length > 50) this.data.chats.pop();
            respond({ chat: chatObj });
            return true;
        }
        if (cmd === SVRCMD.LsvChatHistory || cmd === SVRCMD.ChatMessage) {
            respond({ chats: this.data.chats || [] });
            return true;
        }
        if (cmd === SVRCMD.ChangeTeamName) {
            if (params && params[0]) {
                this.data.team_name = String(params[0]);
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            }
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.BuySomething) {
            var goodsType = Number((params && params[0]) || 1);
            if (goodsType === 1) {
                this.data.stone = Math.max(0, Number(this.data.stone || 0) - 10);
                this.data.gold = Number(this.data.gold || 0) + 50000;
            } else if (goodsType === 2) {
                this.data.stone = Math.max(0, Number(this.data.stone || 0) - 50);
                this.data.sp = Number(this.data.sp || 0) + 120;
            }
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ status: 1 });
            return true;
        }
        if (cmd === SVRCMD.SellManyItems) {
            var idListStr = String((params && params[0]) || "");
            var idArr = idListStr.split(",");
            var totalGoldAdd = 0;
            for (var si = 0; si < idArr.length; si++) {
                var sItemId = Number(idArr[si]);
                if (sItemId > 0 && this.data.items && this.data.items[sItemId]) {
                    var curAmt = Number(this.data.items[sItemId].amount || 0);
                    if (curAmt > 0) {
                        var sCfg = (typeof Config !== "undefined" && Config.item && Config.item[sItemId]) ? Config.item[sItemId] : null;
                        var unitPrice = sCfg ? Number(sCfg.sell_price || 100) : 100;
                        totalGoldAdd += unitPrice * curAmt;
                        this.changeItemAmount(sItemId, -curAmt, queuePush);
                    }
                }
            }
            this.data.gold = Number(this.data.gold || 0) + totalGoldAdd;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({});
            return true;
        }
        if (cmd === SVRCMD.SellItem || cmd === SVRCMD.SellEquip) {
            var sellId = Number((params && params[0]) || 0);
            var sellCnt = Math.max(1, Number((params && params[1]) || 1));
            var sellType = Number((params && params[2]) || (cmd === SVRCMD.SellEquip ? 2 : 1));
            var sellGold = 5000 * sellCnt;
            if (sellType === 2) {
                var eCfg = (typeof Config !== "undefined" && Config.equip && Config.equip[sellId]) ? Config.equip[sellId] : null;
                if (eCfg && eCfg.sell_price) sellGold = Number(eCfg.sell_price) * sellCnt;
                this.changeEquipAmount(sellId, -sellCnt, queuePush);
            } else {
                var iCfg = (typeof Config !== "undefined" && Config.item && Config.item[sellId]) ? Config.item[sellId] : null;
                if (iCfg && iCfg.sell_price) sellGold = Number(iCfg.sell_price) * sellCnt;
                this.changeItemAmount(sellId, -sellCnt, queuePush);
            }
            this.data.gold = Number(this.data.gold || 0) + sellGold;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ status: 1, gold: this.data.gold });
            return true;
        }


        // ====================================================================
        // V14 ENHANCED COMMANDS: VĨ THÚ NUỐT HỒN, CỨ ĐIỂM & LIÊN SERVER
        // ====================================================================

        // 1. Vĩ Thú Nuốt Hồn Tướng & Nâng Cấp Trang Bị
        if (cmd === SVRCMD.UpgradeBeastByEquip) {
            var heroId = Number((params && params[0]) || 0);
            var beastId = Number((params && params[1]) || 30001);
            var useEquips = (params && params[2]) || {};
            var useSouls = (params && params[3]) || {};
            var totalExp = 0;
            var totalSoulsAbsorbed = 0;

            // Check souls balance
            for (var sid in useSouls) {
                var scnt = Number(useSouls[sid] || 0);
                if (scnt > 0) {
                    if (!this.canDeductItem(Number(sid), scnt)) {
                        return respond({}, { code: 1, msg: "Không đủ Hồn Ninja để nuốt!" });
                    }
                }
            }

            // Check equips balance
            for (var eid in useEquips) {
                var ecnt = Number(useEquips[eid] || 0);
                if (ecnt > 0) {
                    if (!this.canDeductEquip(Number(eid), ecnt)) {
                        return respond({}, { code: 1, msg: "Không đủ trang bị trong túi!" });
                    }
                    var eqCfg = (typeof Config !== "undefined" && Config.equip && Config.equip[eid]) ? Config.equip[eid] : null;
                    var perExp = eqCfg ? Number(eqCfg.add_weishou_exp || eqCfg.forge_coin || 10) : 10;
                    totalExp += perExp * ecnt;
                }
            }

            // Check gold cost for equip feeding
            var goldPerExp = (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.BEAST_USE_EQUIP_EXP) ? Number(ConfigGlobalVar.BEAST_USE_EQUIP_EXP) : 10;
            var goldCost = totalExp * goldPerExp;
            if (goldCost > 0 && !this.canDeductGold(goldCost)) {
                return respond({}, { code: 1, msg: "Không đủ Vàng để nâng cấp Vĩ Thú!" });
            }

            // Execute Deductions
            for (var sid in useSouls) {
                var scnt = Number(useSouls[sid] || 0);
                if (scnt > 0) {
                    this.deductItem(Number(sid), scnt, queuePush);
                    totalSoulsAbsorbed += scnt;
                }
            }
            for (var eid in useEquips) {
                var ecnt = Number(useEquips[eid] || 0);
                if (ecnt > 0) {
                    this.deductEquip(Number(eid), ecnt, queuePush);
                }
            }
            if (goldCost > 0) {
                this.deductGold(goldCost, queuePush);
            }

            // Find or create beast record
            if (!this.data.beasts) this.data.beasts = {};
            if (!this.data.beasts[heroId]) this.data.beasts[heroId] = [];

            var updatedBeast = null;
            for (var bi = 0; bi < this.data.beasts[heroId].length; bi++) {
                if (this.data.beasts[heroId][bi].beast_id == beastId) {
                    updatedBeast = this.data.beasts[heroId][bi];
                    break;
                }
            }
            if (!updatedBeast) {
                updatedBeast = { hero_id: heroId, beast_id: beastId, lv: 1, exp: 0, soul_absorbed: 0 };
                this.data.beasts[heroId].push(updatedBeast);
            }

            // Update level & exp
            var lv = Number(updatedBeast.lv || 1);
            var exp = Number(updatedBeast.exp || 0) + totalExp;
            if (typeof Config !== "undefined" && Config.beast && Config.beast[beastId]) {
                while (lv < 10 && Config.beast[beastId][lv] && Config.beast[beastId][lv].upg_exp > 0 && exp >= Config.beast[beastId][lv].upg_exp) {
                    exp -= Config.beast[beastId][lv].upg_exp;
                    lv++;
                }
                if (lv >= 10 && Config.beast[beastId][10]) exp = 0;
            }
            updatedBeast.lv = lv;
            updatedBeast.exp = exp;
            updatedBeast.hero_id = heroId;

            // Update soul feeding absorption & bonus (Matches online server formula: HP = souls*10, ATK/MP/DEF/MP_DEF = souls*1)
            updatedBeast.soul_absorbed = Number(updatedBeast.soul_absorbed || 0) + totalSoulsAbsorbed;
            var sa = updatedBeast.soul_absorbed;
            updatedBeast.soul_bonus = {
                hp: sa * 10,
                atk: sa * 1,
                mp: sa * 1,
                def: sa * 1,
                mp_def: sa * 1
            };

            queuePush(SVRCMD.Beast, { beast: updatedBeast });
            if (this.data.heros && this.data.heros[heroId]) {
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            respond({ beast: updatedBeast });
            return true;
        }

        // 2. Cứ Điểm: Nhận thưởng khai thác mỏ
        if (cmd === SVRCMD.ReviceTreasure) {
            var mineId = Number((params && params[0]) || 1);
            var addGold = 140000;
            var addDiamond = 60;
            this.data.gold = Number(this.data.gold || 0) + addGold;
            this.data.stone = Number(this.data.stone || 0) + addDiamond;
            this.changeItemAmount(40010, 20, queuePush); // 20 Vé càn quét
            this.changeItemAmount(10210, 10, queuePush); // 10 Mảnh tướng
            this.changeItemAmount(60010, 100, queuePush); // 100 Đá cường hóa
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            this.save();
            respond({
                success: true,
                gold: addGold,
                diamond: addDiamond,
                items: [
                    { item_id: 40010, count: 20 },
                    { item_id: 10210, count: 10 },
                    { item_id: 60010, count: 100 }
                ],
                itemBalances: [
                    { id: 40010, item_id: 40010, count: Number(this.data.items[40010] || 0) },
                    { id: 10210, item_id: 10210, count: Number(this.data.items[10210] || 0) },
                    { id: 60010, item_id: 60010, count: Number(this.data.items[60010] || 0) }
                ]
            });
            return true;
        }

        // 3. Hoán Đổi Bí Tịch (WearSecret swap)
        if (cmd === SVRCMD.WearSecret && params && params[0] === "swap") {
            var fromHero = Number(params[1] || 0);
            var toHero = Number(params[2] || 0);
            var reqId = String(params[3] || "swap_" + Date.now());
            // Swap secrets between the two heroes
            var fromSec = null, toSec = null;
            if (this.data.secrets) {
                for (var si = 0; si < this.data.secrets.length; si++) {
                    var s = this.data.secrets[si];
                    if (s.hero_id == fromHero && !fromSec) fromSec = s;
                    else if (s.hero_id == toHero && !toSec) toSec = s;
                }
                if (fromSec) fromSec.hero_id = toHero;
                if (toSec) toSec.hero_id = fromHero;
            }
            if (this.data.heros) {
                if (this.data.heros[fromHero]) queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(fromHero) });
                if (this.data.heros[toHero]) queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(toHero) });
            }
            respond({ swap_id: reqId, from: fromHero, to: toHero, replayed: false });
            return true;
        }

        // 4. Trạng Thái Kết Nối Liên Server (Hỗ trợ Đấu Trường LSV, Boss LSV, Ám Đấu Trường LSV, Công Thành Chiến LSV)
        if (cmd === SVRCMD.CrossServerStatus || cmd === "CrossServerStatus") {
            respond({
                status: 1,
                features: [
                    { feature: "arena", enabled: true },
                    { feature: "dark_arena", enabled: true },
                    { feature: "boss", enabled: true },
                    { feature: "guild_war", enabled: true }
                ]
            });
            return true;
        }

        // 5. Boss Liên Server (CrossBossInfo, CrossBossFight, CrossBossRank)
        if (cmd === SVRCMD.CrossBossInfo || cmd === "CrossBossInfo") {
            var myDamage = Number(this.data.cross_boss_damage || 0);
            var myRank = myDamage > 0 ? 1 : 9999;
            respond({
                rank: myRank,
                total_damage: myDamage,
                join_hero_ids: this.data.cross_boss_lineup || "11060,11000,10510,10650,10710",
                fightJingYingCount: 0,
                boss_lv: 70,
                min_lv: 70,
                max_lv: 89,
                fightCount: 0,
                all_ranks: {
                    ranks_70: { lv: 70, min_lv: 70, max_lv: 89, rank: 1, icon: 30610141, player_name: this.data.team_name || "Nhẫn Giả", server_id: 1, total_damage: Math.max(myDamage, 134891733) },
                    ranks_90: { lv: 90, min_lv: 90, max_lv: 109, rank: 1, icon: 81110901, player_name: "Chú thợ Điện", server_id: 1, total_damage: 154948899 },
                    ranks_110: { lv: 110, min_lv: 110, max_lv: 129, rank: 1, icon: 81110901, player_name: "Thần Sấm", server_id: 2, total_damage: 198234120 },
                    ranks_130: { lv: 130, min_lv: 130, max_lv: 150, rank: 1, icon: 81110901, player_name: "Lục Đạo", server_id: 3, total_damage: 254890000 }
                }
            });
            return true;
        }

        if (cmd === SVRCMD.CrossBossFight || cmd === "CrossBossFight") {
            var lineupStr = (params && params[0]) ? String(params[0]) : "11060,11000,10510,10650,10710";
            this.data.cross_boss_lineup = lineupStr;
            var battleDmg = 18500000;
            this.data.cross_boss_damage = Number(this.data.cross_boss_damage || 0) + battleDmg;
            this.data.gold = Number(this.data.gold || 0) + 200000;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({
                useZip: false,
                damage: battleDmg,
                rank: 1,
                total_damage: this.data.cross_boss_damage,
                fightData: "{\"0\":{\"e\":[[\"__b6\",100000000001,20652,21,13,11],[\"__b19\",100000000001]]}}"
            });
            return true;
        }

        if (cmd === SVRCMD.CrossBossRank || cmd === "CrossBossRank") {
            respond({
                ranks: [
                    { rank: 1, player_id: 1, player_name: this.data.team_name || "Nhẫn Giả", server_id: 1, icon: 30610141, total_damage: Number(this.data.cross_boss_damage || 134891733), team_lv: Number(this.data.team_lv || 100) },
                    { rank: 2, player_id: 2, player_name: "Chú thợ Điện", server_id: 1, icon: 81110901, total_damage: 125000000, team_lv: 95 },
                    { rank: 3, player_id: 3, player_name: "Sasuke Uchiha", server_id: 2, icon: 10020, total_damage: 110000000, team_lv: 92 }
                ],
                my_rank: 1,
                my_damage: Number(this.data.cross_boss_damage || 134891733)
            });
            return true;
        }

        // 6. Đấu Trường Liên Server (CrossArena*)
        if (cmd === SVRCMD.CrossArenaInfo || cmd === "CrossArenaInfo") {
            respond({
                rank: Number(this.data.cross_arena_rank || 1),
                score: Number(this.data.cross_arena_score || 1600),
                fightCount: Number(this.data.cross_arena_fight_cnt || 5),
                buyFightCount: 0,
                cdTime: 0,
                lineup: this.data.cross_arena_lineup || [10010, 10020, 10030, 10040, 10050]
            });
            return true;
        }

        if (cmd === SVRCMD.CrossArenaRank || cmd === "CrossArenaRank" || cmd === "CrossArenaAllRankInfo") {
            respond({
                ranks: [
                    { rank: 1, player_id: 1, player_name: this.data.team_name || "Nhẫn Giả", server_id: 1, icon: 30610141, score: 2400, team_lv: Number(this.data.team_lv || 100) },
                    { rank: 2, player_id: 4520, player_name: "Madara", server_id: 2, icon: 11060, score: 2350, team_lv: 99 },
                    { rank: 3, player_id: 4521, player_name: "Hashirama", server_id: 1, icon: 11000, score: 2300, team_lv: 98 }
                ]
            });
            return true;
        }

        if (cmd === "CrossMatchArenaFighters" || cmd === SVRCMD.CrossMatchArenaFighters) {
            respond({
                fighters: [
                    { player_id: 4520, player_name: "Madara Uchiha", server_id: 2, rank: 2, score: 2350, icon: 11060, team_lv: 99, power: 1500000 },
                    { player_id: 4521, player_name: "Hashirama Senju", server_id: 1, rank: 3, score: 2300, icon: 11000, team_lv: 98, power: 1450000 },
                    { player_id: 4522, player_name: "Minato Namikaze", server_id: 3, rank: 4, score: 2250, icon: 10710, team_lv: 97, power: 1400000 }
                ]
            });
            return true;
        }

        if (cmd === "CrossPlayerArenaInfo") {
            var targetPid = Number((params && params[0]) || 4520);
            respond({
                player: { player_id: targetPid, player_name: "Madara Uchiha", server_id: 2, rank: 2, score: 2350, icon: 11060, team_lv: 99 },
                heros: [
                    { hero_id: 11060, lv: 99, quality: 18, star: 5 },
                    { hero_id: 11000, lv: 99, quality: 18, star: 5 },
                    { hero_id: 10510, lv: 99, quality: 18, star: 5 }
                ]
            });
            return true;
        }

        if (cmd === "CrossSetArenaLineup") {
            this.data.cross_arena_lineup = (params && params[0]) ? params[0] : [10010, 10020, 10030, 10040, 10050];
            respond({ status: 1 });
            return true;
        }

        if (cmd === "CrossArenaFight") {
            this.data.cross_arena_rank = 1;
            this.data.cross_arena_score = Number(this.data.cross_arena_score || 1600) + 30;
            this.data.arena_point = Number(this.data.arena_point || 0) + 100;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({
                useZip: false,
                isWin: 1,
                rank: 1,
                score: this.data.cross_arena_score,
                fightData1: "{\"0\":{\"e\":[[\"__b6\",100000000001,40651,21,0,11]]}}",
                fightData2: "{\"0\":{\"e\":[[\"__b6\",100000000001,40651,21,0,11]]}}"
            });
            return true;
        }

        if (cmd === "CrossArenaFightHistory") {
            respond({
                history: [
                    { time: Math.floor(Date.now() / 1000) - 300, is_win: 1, target_name: "Madara Uchiha", server_id: 2, rank_change: 1, score_change: 30 }
                ]
            });
            return true;
        }

        // 7. Lôi Đài Liên Server (CrossDarkArena*)
        if (cmd === "CrossDarkArenaInfo" || cmd === SVRCMD.CrossDarkArenaInfo) {
            respond({
                rank: Number(this.data.cross_dark_rank || 1),
                score: Number(this.data.cross_dark_score || 1500),
                recordPoint: Number(this.data.cross_dark_record_point || 0),
                cdTime: 0,
                lineup: this.data.cross_dark_lineup || [10010, 10020, 10030, 10040, 10050]
            });
            return true;
        }

        if (cmd === "CrossDarkArenaRank" || cmd === "CrossDarkArenaAllRankInfo") {
            respond({
                ranks: [
                    { rank: 1, player_id: 1, player_name: this.data.team_name || "Nhẫn Giả", server_id: 1, icon: 30610141, score: 2100, team_lv: Number(this.data.team_lv || 100) },
                    { rank: 2, player_id: 734, player_name: "Obito Lục Đạo", server_id: 2, icon: 11050, score: 2050, team_lv: 98 }
                ]
            });
            return true;
        }

        if (cmd === "CrossMatcDarkhFighters") {
            respond({
                fighters: [
                    { player_id: 734, player_name: "Obito Lục Đạo", server_id: 2, rank: 2, score: 2050, icon: 11050, team_lv: 98, power: 1600000 }
                ]
            });
            return true;
        }

        if (cmd === "CrossPlayerDarkArenaInfo") {
            respond({
                player: { player_id: 734, player_name: "Obito Lục Đạo", server_id: 2, rank: 2, score: 2050, icon: 11050, team_lv: 98 },
                heros: [
                    { hero_id: 11050, lv: 98, quality: 18, star: 5 },
                    { hero_id: 10650, lv: 98, quality: 18, star: 5 }
                ]
            });
            return true;
        }

        if (cmd === "CrossSetDarkArenaLineup") {
            this.data.cross_dark_lineup = (params && params[0]) ? params[0] : [10010, 10020, 10030, 10040, 10050];
            respond({ status: 1 });
            return true;
        }

        if (cmd === "CrossDarkArenaFight") {
            this.data.cross_dark_rank = 1;
            this.data.cross_dark_score = Number(this.data.cross_dark_score || 1500) + 25;
            this.data.cross_dark_record_point = Number(this.data.cross_dark_record_point || 0) + 50;
            this.data.dark_arena_point = Number(this.data.dark_arena_point || 0) + 120;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({
                useZip: false,
                isWin: 1,
                rank: 1,
                score: this.data.cross_dark_score,
                fightData1: "{\"0\":{\"e\":[[\"__b6\",100000000001,20682,8,4,38]]}}"
            });
            return true;
        }

        if (cmd === "CrossReceiceDarkArenaRecordPoint") {
            var bonusKC = 200;
            this.data.stone = Number(this.data.stone || 0) + bonusKC;
            this.data.cross_dark_record_point = 0;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ status: 1, diamond: bonusKC });
            return true;
        }

        if (cmd === "CrossDarkArenaFightHistory") {
            respond({
                history: [
                    { time: Math.floor(Date.now() / 1000) - 200, is_win: 1, target_name: "Obito Lục Đạo", server_id: 2, rank_change: 1, score_change: 25 }
                ]
            });
            return true;
        }

        // 8. Bang Chiến Liên Server (CrossUnionWar 7 teams)
        if (cmd === "CrossUnionWar" || cmd === "CrossUnionWarInfo") {
            respond({
                status: 1,
                team_count: 7,
                round: 1,
                union_name: "Konoha Liên Minh",
                enemy_union_name: "Akatsuki Quân Đoàn",
                my_teams: [
                    { team_id: 1, leader: "Naruto", power: 2000000, alive: 5 },
                    { team_id: 2, leader: "Sasuke", power: 1950000, alive: 5 },
                    { team_id: 3, leader: "Kakashi", power: 1800000, alive: 5 },
                    { team_id: 4, leader: "Itachi", power: 1850000, alive: 5 },
                    { team_id: 5, leader: "Jiraiya", power: 1750000, alive: 5 },
                    { team_id: 6, leader: "Tsunade", power: 1700000, alive: 5 },
                    { team_id: 7, leader: "Orochimaru", power: 1700000, alive: 5 }
                ]
            });
            return true;
        }

                respond({ status: 1 });
        return true;
    }
};

// Create an instance for a specific player session
class PlayerSession {
    constructor(ws) {
        this.ws = ws;
        this.playerId = 1;
        this.username = "Player_1";
        this.server = Object.create(OfflineServer);
        this.server.data = null;
    }

    initPlayer(playerId, username) {
        this.playerId = playerId;
        this.username = username || `Player_${playerId}`;
        if (!playerDb[this.playerId]) {
            console.log(`[*] Creating new save data for Player ${this.playerId} (${this.username})...`);
            this.server.initDefaultData();
            this.server.ensureDataFields();
            this.server.data.player_id = this.playerId;
            this.server.data.team_name = this.username;
            playerDb[this.playerId] = this.server.data;
        } else {
            console.log(`[*] Loading existing save data for Player ${this.playerId} (${this.username})...`);
            this.server.data = playerDb[this.playerId];
            this.server.ensureDataFields();
        }
    }

    sendPacket(funcName, data, error) {
        if (!this.ws || this.ws.destroyed) return;
        const pkg = {
            func_name: funcName,
            data: data || {},
            error: error || {}
        };
        sendWsFrame(this.ws, JSON.stringify(pkg));
    }

    handle(cmd, params) {
        if (cmd === "Login" || (typeof SVRCMD !== "undefined" && cmd === SVRCMD.Login)) {
            var uid = (params && params[0]) ? String(params[0]) : "1";
            this.initPlayer(uid, "Player_" + uid);
        } else if (!this.server.data) {
            this.initPlayer(this.playerId, this.username);
        }

        // Chat broadcast across all connected players
        if (cmd === "LsvChatSend" || cmd === "Chat") {
            var msgText = (params && params[0]) ? String(params[0]) : "";
            var chatChannel = (params && params[1] !== undefined) ? Number(params[1]) : 0;
            var cId = Date.now() % 10000000;
            var chatObj = {
                id: cId,
                source_server: 1,
                player_id: this.playerId,
                player_name: this.server.data.team_name || this.username,
                player_icon: Number(this.server.data.icon || 2010080),
                player_lv: Number(this.server.data.team_lv || 1),
                player_vip: Number(this.server.data.vip_lv || 15),
                create_time: Math.floor(Date.now() / 1000),
                fight_record_id: 0,
                msg: msgText,
                send_to: chatChannel,
                chat_type: chatChannel,
                lsv: true
            };

            // Broadcast to all connected sockets
            const broadcastPkg = JSON.stringify({ func_name: "ChatMessage", data: { chat: chatObj } });
            for (const sock of connectedSockets) {
                sendWsFrame(sock, broadcastPkg);
            }

            this.sendPacket(cmd, { chat: chatObj });
            saveDb();
            return;
        }

        const queue = [];
        const queuePush = (pushCmd, pushData) => {
            queue.push({ func_name: pushCmd, data: pushData });
        };

        const respond = (respData) => {
            for (const q of queue) {
                this.sendPacket(q.func_name, q.data);
            }
            this.sendPacket(cmd, respData);
            markDirty(this.playerId);
            saveDb();
        };

        this.server.handle(cmd, params, respond, queuePush);
    }
}

// Lightweight Zero-Dependency WebSocket RFC 6455 Implementation
function sendWsFrame(socket, text) {
    if (!socket || socket.destroyed) return;
    const payload = Buffer.from(text, 'utf-8');
    const length = payload.length;
    let header;

    if (length <= 125) {
        header = Buffer.from([0x81, length]);
    } else if (length <= 65535) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(length, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(length), 2);
    }

    socket.write(Buffer.concat([header, payload]));
}

// HTTP + WebSocket Server
const server = http.createServer((req, res) => {
    if (req.url === '/status' || req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: "online",
            game: "Ninja Rebirth",
            version: "1.0.4.100-loginfix",
            build: "railway-ready",
            online_players: connectedSockets.size,
            registered_players: Object.keys(playerDb).length,
            uptime_seconds: Math.floor(process.uptime())
        }));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Ninja Rebirth Online Server</title><meta charset="utf-8"></head>
        <body style="font-family:sans-serif; background:#1e1e2f; color:#fff; padding:30px;">
            <h1>🍃 Ninja Rebirth Standalone Server</h1>
            <p style="color:#4caf50;"><b>● Server Status: ONLINE</b></p>
            <p><b>Port:</b> ${PORT} (WebSocket: <code>ws://YOUR_IP:${PORT}</code>)</p>
            <p><b>Online Players:</b> ${connectedSockets.size}</p>
            <p><b>Registered Players:</b> ${Object.keys(playerDb).length}</p>
            <hr style="border-color:#444;" />
            <p>Ready for connections from Ninja Rebirth APK & IPA!</p>
        </body>
        </html>
    `);
});

server.on('upgrade', (req, socket, head) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
        socket.destroy();
        return;
    }

    const acceptKey = crypto.createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
    );

    connectedSockets.add(socket);
    console.log(`[+] Client connected from ${req.socket.remoteAddress}. Total online: ${connectedSockets.size}`);

    const session = new PlayerSession(socket);

    // Initial greeting / Connected event
    session.sendPacket("Connected", { status: 1 });

    let buffer = (head && head.length) ? Buffer.from(head) : Buffer.alloc(0);

    socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 2) {
            const byte1 = buffer[0];
            const byte2 = buffer[1];
            const isMasked = (byte2 & 0x80) !== 0;
            let payloadLen = byte2 & 0x7F;
            let offset = 2;

            if (payloadLen === 126) {
                if (buffer.length < 4) break;
                payloadLen = buffer.readUInt16BE(2);
                offset = 4;
            } else if (payloadLen === 127) {
                if (buffer.length < 10) break;
                payloadLen = Number(buffer.readBigUInt64BE(2));
                offset = 10;
            }

            let maskKey = null;
            if (isMasked) {
                if (buffer.length < offset + 4) break;
                maskKey = buffer.subarray(offset, offset + 4);
                offset += 4;
            }

            if (buffer.length < offset + payloadLen) break;

            let data = buffer.subarray(offset, offset + payloadLen);
            buffer = buffer.subarray(offset + payloadLen);

            if (isMasked && maskKey) {
                const unmasked = Buffer.alloc(data.length);
                for (let i = 0; i < data.length; i++) {
                    unmasked[i] = data[i] ^ maskKey[i % 4];
                }
                data = unmasked;
            }

            const opcode = byte1 & 0x0F;
            if (opcode === 0x08) {
                // Close frame
                socket.end();
                break;
            } else if (opcode === 0x09) {
                // Ping -> send Pong
                const pongHeader = Buffer.from([0x8A, 0x00]);
                socket.write(pongHeader);
            } else if (opcode === 0x01 || opcode === 0x02) {
                // Text frame
                const text = data.toString('utf-8');
                try {
                    const parsed = JSON.parse(text);
                    const funcName = parsed.func_name || parsed.cmd;
                    const params = parsed.params || [];
                    if (funcName) {
                        session.handle(funcName, params);
                    }
                } catch (e) {
                    console.error('[-] Error parsing client frame:', e.message, text.slice(0, 100));
                }
            }
        }
    });

    socket.on('close', () => {
        connectedSockets.delete(socket);
        console.log(`[-] Client disconnected. Remaining online: ${connectedSockets.size}`);
        saveDb();
    });

    socket.on('error', (err) => {
        connectedSockets.delete(socket);
        console.error('[-] Socket error:', err.message);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🍃 Ninja Rebirth Standalone Online Server is running!`);
    console.log(`   Port     : ${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}`);
    console.log(`   Dashboard: http://localhost:${PORT}/status`);
    console.log(`=======================================================`);
});
