/**
 * Database & Persistence Layer (Local JSON + Supabase Cloud Sync)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'players.json');

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

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

let nextNumericUid = 10001;
function getOrAssignUid(accountKey, dataObj) {
    if (dataObj && dataObj.uid && Number(dataObj.uid) > 0) {
        if (Number(dataObj.uid) >= nextNumericUid) {
            nextNumericUid = Number(dataObj.uid) + 1;
        }
        return Number(dataObj.uid);
    }
    const parsed = parseInt(accountKey, 10);
    if (!isNaN(parsed) && String(parsed) === String(accountKey) && parsed > 0) {
        if (dataObj) dataObj.uid = parsed;
        if (parsed >= nextNumericUid) nextNumericUid = parsed + 1;
        return parsed;
    }
    for (const k in playerDb) {
        const u = Number(playerDb[k] && playerDb[k].uid);
        if (u >= nextNumericUid) nextNumericUid = u + 1;
    }
    const assigned = nextNumericUid++;
    if (dataObj) dataObj.uid = assigned;
    return assigned;
}

function findPlayerByIdOrUid(idOrKey) {
    const s = String(idOrKey || "").trim();
    if (!s) return null;
    if (playerDb[s]) return { key: s, data: playerDb[s] };
    const sLower = s.toLowerCase();
    const n = Number(idOrKey);
    for (const k in playerDb) {
        const d = playerDb[k];
        if (!d) continue;
        if ((n > 0 && Number(d.uid) === n) ||
            (d.team_name && String(d.team_name).toLowerCase() === sLower) ||
            String(k).toLowerCase() === sLower) {
            return { key: k, data: d };
        }
    }
    return null;
}

module.exports = {
    playerDb,
    saveLocalDb,
    loadDbFromSupabase,
    markDirty,
    flushDirtyToSupabase,
    saveDb,
    getOrAssignUid,
    findPlayerByIdOrUid
};
