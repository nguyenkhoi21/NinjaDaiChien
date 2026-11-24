/**
 * Upstream Event & Lucky Roulette Sync Service
 * - Logs into the official server using env credentials (UPSTREAM_SYNC_ACCOUNT / UPSTREAM_SYNC_PASSWORD)
 * - Fetches GetAllEvents and LuckyInfo over a pure Node.js RFC 6455 WebSocket client
 * - Applies live to OfflineServer, caches locally, and backs up to GitHub hotfix-mirror (hotfix/android/events.json)
 * - Falls back automatically to local cache / GitHub mirror when upstream is unreachable
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const UPSTREAM_AUTH_URL = process.env.UPSTREAM_AUTH_URL || 'http://103.90.227.124:8080/auth';
const UPSTREAM_SYNC_ACCOUNT = process.env.UPSTREAM_SYNC_ACCOUNT || '';
const UPSTREAM_SYNC_PASSWORD = process.env.UPSTREAM_SYNC_PASSWORD || '';
const UPSTREAM_SYNC_SERVER_ID = Number(process.env.UPSTREAM_SYNC_SERVER_ID || 1);

const GITHUB_REPO = process.env.GITHUB_REPO || 'nguyenkhoi21/NinjaDaiChien';
const GITHUB_MIRROR_BRANCH = process.env.GITHUB_MIRROR_BRANCH || 'hotfix-mirror';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const MIRROR_EVENTS_URL =
    process.env.MIRROR_EVENTS_URL ||
    `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_MIRROR_BRANCH}/hotfix/android/events.json`;
const LOCAL_EVENTS_FILE = path.join(__dirname, '..', 'data', 'synced_events.json');
const LOCAL_CONFIG_FILE = path.join(__dirname, '..', 'data', 'upstream_sync_config.json');
const SYS_ROW_ID = '__sys_upstream_sync__';

const SYNC_COOLDOWN_MS = 5 * 60 * 1000;

let dbRef = null;
let savedConfig = { account: '', password: '', serverId: 1, updatedAt: null };

if (fs.existsSync(LOCAL_CONFIG_FILE)) {
    try {
        const parsed = JSON.parse(fs.readFileSync(LOCAL_CONFIG_FILE, 'utf8'));
        if (parsed && typeof parsed === 'object') {
            savedConfig = {
                account: String(parsed.account || '').trim(),
                password: String(parsed.password || ''),
                serverId: Math.max(1, Number(parsed.serverId || 1)),
                updatedAt: parsed.updatedAt || null
            };
        }
    } catch (err) {
        console.warn('[-] Failed to read upstream_sync_config.json:', err.message);
    }
}

function writeLocalConfig(cfg) {
    try {
        const dir = path.dirname(LOCAL_CONFIG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(LOCAL_CONFIG_FILE, JSON.stringify(cfg), 'utf8');
        return true;
    } catch (err) {
        console.warn('[-] Failed to write upstream_sync_config.json:', err.message);
        return false;
    }
}

/** Mask an account identifier for safe display without exposing credentials. */
function maskAccount(acc) {
    const s = String(acc || '').trim();
    if (!s) return '';
    if (s.length <= 3) return s[0] + '**';
    return s.slice(0, 2) + '***' + s.slice(-1);
}

/** Resolve active upstream credentials with precedence: one-shot > GM saved > ENV. */
function getEffectiveCredentials(options = {}) {
    const fallbackServerId = Math.max(
        1,
        Number(options.serverId || savedConfig.serverId || UPSTREAM_SYNC_SERVER_ID || 1)
    );
    const optAcc = String(options.account || '').trim();
    const optPass = String(options.password || '');
    if (optAcc && optPass) {
        return { account: optAcc, password: optPass, serverId: fallbackServerId, source: 'oneshot' };
    }
    if (savedConfig.account && savedConfig.password) {
        return {
            account: savedConfig.account,
            password: savedConfig.password,
            serverId: Math.max(1, Number(options.serverId || savedConfig.serverId || 1)),
            source: 'gm'
        };
    }
    if (UPSTREAM_SYNC_ACCOUNT && UPSTREAM_SYNC_PASSWORD) {
        return {
            account: UPSTREAM_SYNC_ACCOUNT,
            password: UPSTREAM_SYNC_PASSWORD,
            serverId: Math.max(1, Number(options.serverId || UPSTREAM_SYNC_SERVER_ID || 1)),
            source: 'env'
        };
    }
    return { account: '', password: '', serverId: fallbackServerId, source: 'none' };
}

/** Attach database listeners so GM-saved credentials restore cleanly from Supabase on boot. */
function attachDatabaseSync(db, OfflineServer) {
    dbRef = db;
    if (!db || typeof db.onSystemRow !== 'function') return;
    db.onSystemRow(SYS_ROW_ID, (rowData) => {
        if (!rowData || typeof rowData !== 'object') return;
        const acc = String(rowData.account || '').trim();
        const pass = String(rowData.password || '');
        if (!acc || !pass) return;
        savedConfig = {
            account: acc,
            password: pass,
            serverId: Math.max(1, Number(rowData.serverId || 1)),
            updatedAt: rowData.updatedAt || null
        };
        writeLocalConfig(savedConfig);
        if (OfflineServer && state.lastSource !== 'upstream-ws') {
            syncEventsFromUpstream(OfflineServer, { reason: 'supabase-ready', force: true }).catch(() => {});
        }
    });
}

/** Save upstream sync credentials locally and to Supabase so they persist across restarts. */
async function setUpstreamCredentials({ account, password, serverId }) {
    const rawAcc = String(account || '').trim();
    const rawPass = String(password || '');
    const cleanAcc = rawAcc || savedConfig.account;
    const reuseSavedPass = !rawPass && savedConfig.password && (!rawAcc || rawAcc === savedConfig.account);
    const cleanPass = reuseSavedPass ? savedConfig.password : rawPass;

    if (!cleanAcc) {
        throw new Error('Vui lòng nhập tài khoản server chính');
    }
    if (!cleanPass) {
        throw new Error('Vui lòng nhập mật khẩu tài khoản server chính');
    }

    savedConfig = {
        account: cleanAcc,
        password: cleanPass,
        serverId: Math.max(1, Number(serverId || savedConfig.serverId || 1)),
        updatedAt: new Date().toISOString()
    };
    writeLocalConfig(savedConfig);

    let cloudRes = { cloud: false };
    if (dbRef && typeof dbRef.saveSystemRow === 'function') {
        cloudRes = await dbRef.saveSystemRow(SYS_ROW_ID, savedConfig);
    }

    return {
        ok: true,
        cloudSaved: Boolean(cloudRes && cloudRes.cloud),
        status: getEventSyncStatus()
    };
}

/** Clear GM-saved upstream credentials from memory, local file, and Supabase. */
async function clearUpstreamCredentials() {
    savedConfig = { account: '', password: '', serverId: 1, updatedAt: null };
    try {
        if (fs.existsSync(LOCAL_CONFIG_FILE)) fs.unlinkSync(LOCAL_CONFIG_FILE);
    } catch (err) {
        console.warn('[-] Failed to delete upstream_sync_config.json:', err.message);
    }
    if (dbRef && typeof dbRef.deleteSystemRow === 'function') {
        await dbRef.deleteSystemRow(SYS_ROW_ID);
    }
    return { ok: true, status: getEventSyncStatus() };
}

/** Fetch live upstream server list for the GM selector, falling back to S1..S6 offline. */
async function fetchUpstreamServerList(authUrl) {
    const fallback = [1, 2, 3, 4, 5, 6].map((id) => ({ id, name: 'S' + id }));
    try {
        const srvResp = await httpPostJson(`${authUrl || UPSTREAM_AUTH_URL}?api=get_server_list`, [], 6000);
        const servers = Array.isArray(srvResp && srvResp.servers) ? srvResp.servers : [];
        if (servers.length === 0) return fallback;
        return servers
            .map((s) => {
                const id = Number(s.server_id || s.id || 0);
                if (!id) return null;
                return {
                    id,
                    name: String(s.name || s.server_name || ('S' + id))
                };
            })
            .filter(Boolean);
    } catch (_) {
        return fallback;
    }
}

const state = {
    lastSyncAt: 0,
    lastSource: null,
    lastStatus: 'never',
    mirrorBackedUp: false,
    lastError: null,
    eventGroups: 0,
    luckyCount: 0
};

function httpRequest(urlStr, options = {}, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 4) return reject(new Error('Too many redirects'));
        let parsed;
        try {
            parsed = new URL(urlStr);
        } catch (err) {
            return reject(err);
        }
        const transport = parsed.protocol === 'https:' ? https : http;
        const timeoutMs = options.timeoutMs || 10000;
        const reqOpts = {
            method: options.method || 'GET',
            headers: Object.assign({ 'User-Agent': 'NinjaDaiChien-EventSync/1.0' }, options.headers || {}),
            timeout: timeoutMs
        };

        const req = transport.request(parsed, reqOpts, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                res.resume();
                const nextUrl = new URL(res.headers.location, parsed).toString();
                return httpRequest(nextUrl, options, redirectCount + 1).then(resolve, reject);
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
            });
        });

        req.on('timeout', () => req.destroy(new Error(`Timeout after ${timeoutMs}ms: ${urlStr}`)));
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function httpPostJson(urlStr, payload, timeoutMs = 10000) {
    const bodyStr = JSON.stringify(payload);
    const res = await httpRequest(urlStr, {
        method: 'POST',
        timeoutMs,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr)
        },
        body: bodyStr
    });
    if (res.statusCode !== 200) {
        throw new Error(`HTTP ${res.statusCode} from ${urlStr}`);
    }
    return JSON.parse(res.body);
}

async function httpGetJson(urlStr, timeoutMs = 10000) {
    const res = await httpRequest(urlStr, { method: 'GET', timeoutMs });
    if (res.statusCode !== 200) {
        throw new Error(`HTTP ${res.statusCode} from ${urlStr}`);
    }
    return JSON.parse(res.body);
}

function encodeWsFrame(opcode, payloadBuf) {
    const payload = Buffer.isBuffer(payloadBuf) ? payloadBuf : Buffer.from(String(payloadBuf), 'utf8');
    const len = payload.length;
    const maskKey = crypto.randomBytes(4);
    let header;
    if (len < 126) {
        header = Buffer.allocUnsafe(6);
        header[0] = 0x80 | (opcode & 0x0f);
        header[1] = 0x80 | len;
        maskKey.copy(header, 2);
    } else if (len < 65536) {
        header = Buffer.allocUnsafe(8);
        header[0] = 0x80 | (opcode & 0x0f);
        header[1] = 0x80 | 126;
        header.writeUInt16BE(len, 2);
        maskKey.copy(header, 4);
    } else {
        header = Buffer.allocUnsafe(14);
        header[0] = 0x80 | (opcode & 0x0f);
        header[1] = 0x80 | 127;
        header.writeBigUInt64BE(BigInt(len), 2);
        maskKey.copy(header, 10);
    }
    const masked = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) {
        masked[i] = payload[i] ^ maskKey[i % 4];
    }
    return Buffer.concat([header, masked]);
}

function parseNettyMessages(msgBuf) {
    // Support both raw JSON text and Cocos/Netty 4-byte BE length-prefixed framing
    const out = [];
    if (!msgBuf || msgBuf.length === 0) return out;

    if (msgBuf.length > 4 && msgBuf[0] === 0x00) {
        let off = 0;
        while (off + 4 <= msgBuf.length) {
            const pLen = msgBuf.readUInt32BE(off);
            if (pLen <= 0 || off + 4 + pLen > msgBuf.length) break;
            const sliceStr = msgBuf.subarray(off + 4, off + 4 + pLen).toString('utf8').trim();
            if (sliceStr) {
                try { out.push(JSON.parse(sliceStr)); } catch (_) {}
            }
            off += 4 + pLen;
        }
        if (out.length > 0) return out;
    }

    const str = msgBuf.toString('utf8').trim();
    if (!str) return out;
    try {
        out.push(JSON.parse(str));
        return out;
    } catch (_) {
        // Handle concatenated JSON objects if any
        const lines = str.split(/\r?\n/);
        for (const l of lines) {
            if (!l.trim()) continue;
            try { out.push(JSON.parse(l.trim())); } catch (_) {}
        }
    }
    return out;
}

function fetchUpstreamEventsViaWs({ host, port, wsPath, userId, sessionKey, timeoutMs = 15000 }) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let upgraded = false;
        let loginSent = false;
        let eventsRequested = false;
        let gotEvents = null;
        let gotLucky = null;
        let rxBuf = Buffer.alloc(0);
        let fragChunks = [];
        let fragOpcode = null;

        const socket = net.createConnection({ host, port: Number(port) });
        const wsKey = crypto.randomBytes(16).toString('base64');

        const finish = (err, res) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            clearTimeout(fallbackLoginTimer);
            try {
                if (upgraded) socket.write(encodeWsFrame(0x8, Buffer.alloc(0)));
            } catch (_) {}
            try { socket.destroy(); } catch (_) {}
            if (err) reject(err);
            else resolve(res);
        };

        const timer = setTimeout(() => {
            finish(new Error(`Upstream WebSocket timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        let fallbackLoginTimer = null;

        const sendCmd = (cmd, params) => {
            if (!upgraded || socket.destroyed) return;
            const json = JSON.stringify({ func_name: cmd, params: params || [] });
            socket.write(encodeWsFrame(0x1, Buffer.from(json, 'utf8')));
        };

        const requestEventsAndLucky = () => {
            if (eventsRequested) return;
            eventsRequested = true;
            sendCmd('GetAllEvents', []);
            sendCmd('LuckyInfo', []);
        };

        const handlePacket = (pkg) => {
            if (!pkg || typeof pkg !== 'object') return;
            const cmd = pkg.func_name || pkg.cmd || '';
            const data = pkg.data !== undefined ? pkg.data : pkg;

            if (cmd === 'Connected') {
                if (!loginSent) {
                    loginSent = true;
                    sendCmd('Login', [userId, sessionKey, 0]);
                }
                return;
            }

            if (cmd === 'Login') {
                if (pkg.err_code || (data && data.err_code)) {
                    const msg = pkg.err_msg || (data && data.err_msg) || 'Upstream login failed';
                    return finish(new Error(msg));
                }
                if (data && Array.isArray(data.roles) && data.roles.length > 0) {
                    const rId = Number(data.roles[0].player_id || data.roles[0].id || 0);
                    sendCmd('Login', [userId, sessionKey, rId]);
                    return;
                }
                requestEventsAndLucky();
                return;
            }

            if (cmd === 'GetAllEvents') {
                const ev = (data && Array.isArray(data.events)) ? data.events : (Array.isArray(data) ? data : null);
                if (ev) gotEvents = ev;
            } else if (cmd === 'LuckyInfo') {
                if (data && data.luckys && data.items) gotLucky = data;
            }

            if (gotEvents && gotLucky) {
                finish(null, { events: gotEvents, lucky: gotLucky });
            }
        };

        const drainWsFrames = () => {
            while (rxBuf.length >= 2) {
                const b0 = rxBuf[0];
                const b1 = rxBuf[1];
                const fin = (b0 & 0x80) !== 0;
                const opcode = b0 & 0x0f;
                const masked = (b1 & 0x80) !== 0;
                let payloadLen = b1 & 0x7f;
                let offset = 2;

                if (payloadLen === 126) {
                    if (rxBuf.length < 4) return;
                    payloadLen = rxBuf.readUInt16BE(2);
                    offset = 4;
                } else if (payloadLen === 127) {
                    if (rxBuf.length < 10) return;
                    payloadLen = Number(rxBuf.readBigUInt64BE(2));
                    offset = 10;
                }

                let maskKey = null;
                if (masked) {
                    if (rxBuf.length < offset + 4) return;
                    maskKey = rxBuf.subarray(offset, offset + 4);
                    offset += 4;
                }

                if (rxBuf.length < offset + payloadLen) return;
                let payload = rxBuf.subarray(offset, offset + payloadLen);
                rxBuf = rxBuf.subarray(offset + payloadLen);

                if (masked && maskKey) {
                    const unmasked = Buffer.allocUnsafe(payload.length);
                    for (let i = 0; i < payload.length; i++) {
                        unmasked[i] = payload[i] ^ maskKey[i % 4];
                    }
                    payload = unmasked;
                }

                if (opcode === 0x8) {
                    return finish(new Error('Upstream WebSocket closed before delivering events'));
                } else if (opcode === 0x9) {
                    // Ping -> Pong
                    try { socket.write(encodeWsFrame(0xA, payload)); } catch (_) {}
                } else if (opcode === 0xA) {
                    // Pong -> ignore
                } else if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
                    if (opcode !== 0x0) {
                        fragOpcode = opcode;
                        fragChunks = [payload];
                    } else {
                        fragChunks.push(payload);
                    }
                    if (fin) {
                        const fullMsg = Buffer.concat(fragChunks);
                        fragChunks = [];
                        fragOpcode = null;
                        const msgs = parseNettyMessages(fullMsg);
                        for (const m of msgs) {
                            handlePacket(m);
                            if (settled) return;
                        }
                    }
                }
            }
        };

        socket.on('connect', () => {
            const pathPart = wsPath && wsPath.startsWith('/') ? wsPath : '/' + (wsPath || '');
            const reqStr =
                `GET ${pathPart} HTTP/1.1\r\n` +
                `Host: ${host}:${port}\r\n` +
                `Upgrade: websocket\r\n` +
                `Connection: Upgrade\r\n` +
                `Sec-WebSocket-Key: ${wsKey}\r\n` +
                `Sec-WebSocket-Version: 13\r\n\r\n`;
            socket.write(reqStr);
        });

        socket.on('data', (chunk) => {
            rxBuf = Buffer.concat([rxBuf, chunk]);
            if (!upgraded) {
                const hdrEnd = rxBuf.indexOf('\r\n\r\n');
                if (hdrEnd === -1) return;
                const hdrStr = rxBuf.subarray(0, hdrEnd).toString('utf8');
                if (!hdrStr.includes('101')) {
                    return finish(new Error('WebSocket handshake failed: ' + hdrStr.split('\r\n')[0]));
                }
                upgraded = true;
                rxBuf = rxBuf.subarray(hdrEnd + 4);
                fallbackLoginTimer = setTimeout(() => {
                    if (!loginSent && !settled) {
                        loginSent = true;
                        sendCmd('Login', [userId, sessionKey, 0]);
                    }
                }, 400);
                if (fallbackLoginTimer.unref) fallbackLoginTimer.unref();
            }
            drainWsFrames();
        });

        socket.on('error', (err) => finish(err));
        socket.on('close', () => {
            if (!settled) {
                finish(new Error('Upstream WebSocket disconnected before completion'));
            }
        });
    });
}

function parseServerTarget(serverObj) {
    const serverIp = String(serverObj.serverip || '');
    let host = serverObj.host || '';
    let port = Number(serverObj.port || 0);
    let wsPath = '/';

    if (serverIp) {
        const slashIdx = serverIp.indexOf('/');
        const hostPort = slashIdx >= 0 ? serverIp.slice(0, slashIdx) : serverIp;
        if (slashIdx >= 0) wsPath = serverIp.slice(slashIdx);
        const colonIdx = hostPort.lastIndexOf(':');
        if (colonIdx >= 0) {
            if (!host) host = hostPort.slice(0, colonIdx);
            if (!port) port = Number(hostPort.slice(colonIdx + 1));
        } else if (!host) {
            host = hostPort;
        }
    }
    if (!port) port = 10011;
    return { host, port, wsPath };
}

function applySyncedEvents(OfflineServer, payload) {
    if (!OfflineServer || !payload) return false;
    const { events, lucky } = payload;
    if (!Array.isArray(events) || events.length === 0) return false;
    if (!lucky || !lucky.luckys || !lucky.items) return false;

    const clonedEvents = JSON.parse(JSON.stringify(events));
    // Preserve custom server-specific kind=9840 (Táo Đấu Trường) if upstream doesn't have it
    const staticEvents = Array.isArray(OfflineServer._baseOnlineEvents)
        ? OfflineServer._baseOnlineEvents
        : (OfflineServer._baseOnlineEvents = JSON.parse(JSON.stringify(OfflineServer.onlineEvents || [])));
    const hasCustomApple = clonedEvents.some(grp => Array.isArray(grp) && grp.some(ev => Number(ev && ev.kind) === 9840));
    if (!hasCustomApple) {
        const appleGrp = staticEvents.find(grp => Array.isArray(grp) && grp.some(ev => Number(ev && ev.kind) === 9840));
        if (appleGrp) clonedEvents.push(JSON.parse(JSON.stringify(appleGrp)));
    }

    OfflineServer.onlineEvents = clonedEvents;
    OfflineServer.onlineLucky = JSON.parse(JSON.stringify(lucky));
    if (typeof OfflineServer.syncOnlineLuckyWithLatestHero === 'function') {
        OfflineServer.syncOnlineLuckyWithLatestHero();
    }

    state.eventGroups = OfflineServer.onlineEvents.length;
    state.luckyCount = Object.keys(OfflineServer.onlineLucky.luckys || {}).length;
    return true;
}

function saveLocalEvents(payload) {
    try {
        const dir = path.dirname(LOCAL_EVENTS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(LOCAL_EVENTS_FILE, JSON.stringify(payload), 'utf8');
        return true;
    } catch (err) {
        console.warn('[-] Failed to save local synced_events.json:', err.message);
        return false;
    }
}

async function pushEventsToGithubMirror(payload) {
    if (!GITHUB_TOKEN) return { pushed: false, reason: 'GITHUB_TOKEN not set' };
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/hotfix/android/events.json`;
    const headers = {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };

    let existingSha = null;
    try {
        const cur = await httpRequest(`${apiUrl}?ref=${encodeURIComponent(GITHUB_MIRROR_BRANCH)}`, {
            method: 'GET',
            headers,
            timeoutMs: 8000
        });
        if (cur.statusCode === 200) {
            const parsed = JSON.parse(cur.body);
            existingSha = parsed.sha || null;
        }
    } catch (_) {}

    const contentB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    const bodyObj = {
        message: `chore(events): sync upstream events ${new Date().toISOString()}`,
        content: contentB64,
        branch: GITHUB_MIRROR_BRANCH
    };
    if (existingSha) bodyObj.sha = existingSha;
    const bodyStr = JSON.stringify(bodyObj);

    const putRes = await httpRequest(apiUrl, {
        method: 'PUT',
        timeoutMs: 12000,
        headers: Object.assign({}, headers, {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr)
        }),
        body: bodyStr
    });
    if (putRes.statusCode === 200 || putRes.statusCode === 201) {
        state.mirrorBackedUp = true;
        return { pushed: true };
    }
    return { pushed: false, reason: `HTTP ${putRes.statusCode}` };
}

function loadCachedOrMirrorEvents(OfflineServer) {
    if (fs.existsSync(LOCAL_EVENTS_FILE)) {
        try {
            const cached = JSON.parse(fs.readFileSync(LOCAL_EVENTS_FILE, 'utf8'));
            if (applySyncedEvents(OfflineServer, cached)) {
                state.lastSource = 'local-cache';
                state.lastStatus = 'loaded cached events';
                console.log(`[+] Loaded cached upstream events (${state.eventGroups} groups, ${state.luckyCount} roulettes)`);
                return true;
            }
        } catch (err) {
            console.warn('[-] Failed to load synced_events.json:', err.message);
        }
    }

    // Async fallback check on GitHub mirror (non-blocking at startup)
    httpGetJson(MIRROR_EVENTS_URL, 6000)
        .then((mirrorData) => {
            if (applySyncedEvents(OfflineServer, mirrorData)) {
                saveLocalEvents(mirrorData);
                state.lastSource = 'github-mirror';
                state.lastStatus = 'loaded from GitHub mirror';
                state.mirrorBackedUp = true;
                console.log(`[+] Loaded events from GitHub mirror (${state.eventGroups} groups)`);
            }
        })
        .catch(() => {});

    return false;
}

async function syncEventsFromUpstream(OfflineServer, options = {}) {
    const now = Date.now();
    if (!options.force && state.lastSyncAt > 0 && (now - state.lastSyncAt) < SYNC_COOLDOWN_MS) {
        return { ok: true, skipped: true, status: state.lastStatus };
    }

    const authUrl = options.authUrl || UPSTREAM_AUTH_URL;
    const creds = getEffectiveCredentials(options);
    const account = creds.account;
    const password = creds.password;
    const serverId = creds.serverId;

    if (!account || !password) {
        // Still try mirror fallback if configured
        try {
            const mirrorData = await httpGetJson(MIRROR_EVENTS_URL, 6000);
            if (applySyncedEvents(OfflineServer, mirrorData)) {
                saveLocalEvents(mirrorData);
                state.lastSyncAt = Date.now();
                state.lastSource = 'github-mirror';
                state.lastStatus = 'loaded from mirror (upstream account not configured)';
                state.mirrorBackedUp = true;
                return { ok: true, source: 'github-mirror', status: state.lastStatus, eventGroups: state.eventGroups };
            }
        } catch (_) {}
        state.lastStatus = 'chưa cấu hình tài khoản đồng bộ (nhập trên /gm hoặc ENV)';
        return { ok: false, skipped: true, status: state.lastStatus };
    }

    try {
        const srvResp = await httpPostJson(`${authUrl}?api=get_server_list`, [], 8000);
        const servers = Array.isArray(srvResp && srvResp.servers) ? srvResp.servers : [];
        if (servers.length === 0) throw new Error('Upstream server list is empty');
        const chosen = servers.find(s => Number(s.server_id || s.id) === serverId) || servers[0];
        const target = parseServerTarget(chosen);

        const authResp = await httpPostJson(`${authUrl}?api=signin`, [account, password], 8000);
        if (!Array.isArray(authResp) || !authResp[0] || !authResp[1]) {
            const errMsg = (authResp && authResp.err_msg) || 'Upstream signin failed';
            throw new Error(errMsg);
        }

        const wsData = await fetchUpstreamEventsViaWs({
            host: target.host,
            port: target.port,
            wsPath: target.wsPath,
            userId: authResp[0],
            sessionKey: authResp[1],
            timeoutMs: options.timeoutMs || 15000
        });

        const payload = {
            syncedAt: new Date().toISOString(),
            serverId: Number(chosen.server_id || chosen.id || serverId),
            events: wsData.events,
            lucky: wsData.lucky
        };

        applySyncedEvents(OfflineServer, payload);
        saveLocalEvents(payload);
        state.lastSyncAt = Date.now();
        state.lastSource = 'upstream-ws';
        state.lastStatus = `synced (${state.eventGroups} event groups, ${state.luckyCount} roulettes)`;
        state.lastError = null;

        let mirrorPush = { pushed: false };
        try {
            mirrorPush = await pushEventsToGithubMirror(payload);
        } catch (mErr) {
            mirrorPush = { pushed: false, reason: mErr.message };
        }

        console.log(`[+] Synced upstream events via WS: ${state.lastStatus}`);
        return {
            ok: true,
            source: 'upstream-ws',
            status: state.lastStatus,
            eventGroups: state.eventGroups,
            luckyCount: state.luckyCount,
            mirrorPush
        };
    } catch (err) {
        state.lastError = err.message;
        // Fallback to GitHub mirror if upstream fails
        try {
            const mirrorData = await httpGetJson(MIRROR_EVENTS_URL, 8000);
            if (applySyncedEvents(OfflineServer, mirrorData)) {
                saveLocalEvents(mirrorData);
                state.lastSyncAt = Date.now();
                state.lastSource = 'github-mirror (fallback)';
                state.lastStatus = `fallback from mirror (${err.message})`;
                state.mirrorBackedUp = true;
                return { ok: true, source: 'github-mirror', status: state.lastStatus, eventGroups: state.eventGroups };
            }
        } catch (_) {}

        state.lastStatus = `error: ${err.message}`;
        return { ok: false, error: err.message, status: state.lastStatus };
    }
}

function getEventSyncStatus() {
    const creds = getEffectiveCredentials();
    return {
        configured: Boolean(creds.account && creds.password),
        credentialSource: creds.source,
        accountMasked: creds.account ? maskAccount(creds.account) : '',
        serverId: creds.serverId,
        lastSyncAt: state.lastSyncAt,
        lastSource: state.lastSource,
        lastStatus: state.lastStatus,
        mirrorBackedUp: state.mirrorBackedUp,
        lastError: state.lastError,
        eventGroups: state.eventGroups,
        luckyCount: state.luckyCount
    };
}

module.exports = {
    syncEventsFromUpstream,
    loadCachedOrMirrorEvents,
    applySyncedEvents,
    getEventSyncStatus,
    attachDatabaseSync,
    setUpstreamCredentials,
    clearUpstreamCredentials,
    fetchUpstreamServerList
};
