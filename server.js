/**
 * Ninja Rebirth (Ninja Đại Chiến) Standalone Modular Online Server (Node.js)
 * Modularized Architecture:
 *  - config/configLoader.js          : ConfigData.json loader, SVRCMD, Cache
 *  - config/onlineEventsData.js      : Online events & Lucky Roulette configuration
 *  - db/database.js                  : Local JSON + Supabase Cloud persistence
 *  - services/economyService.js      : Handle trừ vàng, trừ thể lực, trừ kim cương, tiền tệ shop, thêm/trừ item, trang bị, tướng, EXP
 *  - handlers/playerHandler.js       : Handle Tài khoản, Nhân vật, Túi đồ, Tân thủ, Thư, Hảo hữu, Quà cấp độ
 *  - handlers/chapterHandler.js      : Handle Ải cốt truyện, Càn quét (Sweep), Khu rừng chết, Thử thách, Vĩ thú
 *  - handlers/heroHandler.js         : Handle Tướng, Trang bị, Kỹ năng, Bát môn, Thức tỉnh, Vĩ thú, Học viện, Bí tịch/Ngọc, Nhẫn cụ, Túi đồ
 *  - handlers/shopAndBoxHandler.js   : Handle Tạp hóa, Chợ đen, Tiệm Đấu trường/Tranh bá/Bang/Boruto, Mở Rương (BuyBox), Mua thể lực/vàng
 *  - handlers/eventAndSignInHandler.js: Handle Điểm danh (SignIn), Nhiệm vụ ngày, Thành tựu, Sự kiện, Vòng quay, BattlePass, Raid, Giftcode
 *  - handlers/arenaAndTowerHandler.js: Handle Đấu trường, Lôi đài, Tranh bá, Tháp vô tận, Cứ điểm, Liên server
 *  - handlers/guildHandler.js        : Handle Bang hội, Kỹ năng bang, Cống hiến, Lính đánh thuê, Bang chiến
 *  - handlers/gmAndChatHandler.js    : Handle Chat, Loa thế giới, Replay, Lệnh GM
 */

const http = require('http');
const crypto = require('crypto');

// 1. Load Game Configs (ConfigData.json), SVRCMD & Cache globals
require('./config/configLoader');
const { onlineEvents, onlineLucky } = require('./config/onlineEventsData');

// 2. Load Database & Persistence Layer
const {
    playerDb,
    loadDbFromSupabase,
    markDirty,
    saveDb,
    getOrAssignUid,
    findPlayerByIdOrUid
} = require('./db/database');

// 3. Load Services & Domain Handlers
const EconomyService = require('./services/economyService');
const handlePlayer = require('./handlers/playerHandler');
const handleChapter = require('./handlers/chapterHandler');
const HeroHandler = require('./handlers/heroHandler');
const ShopAndBoxHandler = require('./handlers/shopAndBoxHandler');
const EventAndSignInHandler = require('./handlers/eventAndSignInHandler');
const ArenaAndTowerHandler = require('./handlers/arenaAndTowerHandler');
const GuildHandler = require('./handlers/guildHandler');
const GmAndChatHandler = require('./handlers/gmAndChatHandler');

const PORT = process.env.PORT || 8088;

// Load all players on startup from Supabase if configured
loadDbFromSupabase();

// Periodic auto-save every 10 seconds
setInterval(saveDb, 10000);

// Active WebSocket connections
const connectedSockets = new Set();

const OfflineServer = Object.assign(
    {
        enabled: false,
        saveKey: "SHINOBI_OFFLINE_SAVE_V10",
        onlineEvents: onlineEvents,
        onlineLucky: onlineLucky,

        logPacket: function() {},

        loadSave: function() {
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
            if (!this.data.chapters || typeof this.data.chapters !== "object") {
                this.data.chapters = { "1": [{ chapter_id: 50011, star: 0 }], "2": [], "3": [], "16": [] };
            }
            for (const ck in this.data.chapters) {
                if (Number(ck) >= 50000 && !Array.isArray(this.data.chapters[ck])) {
                    delete this.data.chapters[ck];
                }
            }
            if (!Array.isArray(this.data.chapters["1"]) || this.data.chapters["1"].length === 0) {
                this.data.chapters["1"] = [{ chapter_id: 50011, star: 0 }];
            }
            if (!this.data.secrets) this.data.secrets = [];
            if (!this.data.guide_vars) this.data.guide_vars = { releaseSkill: 1, callHero: 1 };
            if (!this.data.daily_counts) this.data.daily_counts = {};
            if (!Array.isArray(this.data.sign_days)) this.data.sign_days = [];
            if (!Array.isArray(this.data.lv_rewards)) this.data.lv_rewards = [];
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
            if (this.data.group_id === undefined) this.data.group_id = 0;
            if (this.data.group_name === undefined) this.data.group_name = "";
            if (this.data.group_level === undefined) this.data.group_level = 0;
            if (this.data.group_role === undefined) this.data.group_role = 0;
            if (!this.data.tower_cur_layer) this.data.tower_cur_layer = 1;
            if (!this.data.tower_layers) this.data.tower_layers = {};
            if (!this.data.tower_heros) this.data.tower_heros = {};
            if (!this.data.noend_towers) this.data.noend_towers = {};
            if (!this.data.next_secret_id) this.data.next_secret_id = 1;
        },

        save: function() {},

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
                icon: 10020,
                guide_step: 0,
                guide_vars: { releaseSkill: 1, callHero: 1 },
                heros: {
                    10020: this.createDefaultHeroRecord(10020),
                    10040: this.createDefaultHeroRecord(10040),
                    10250: this.createDefaultHeroRecord(10250)
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
                group_id: 0,
                group_name: "",
                group_level: 0,
                group_exp: 0,
                group_role: 0,
                group_contribution: 0,
                group_fund: 0,
                group_resource: 0,
                group_icon: 20806,
                group_capacity: 30,
                group_size: 0,
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
        },

        buildPlayerAttrPayload: function() {
            return {
                team_name: this.data.team_name || "Nhẫn Giả",
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

        handlePlayer: handlePlayer,
        handleChapter: handleChapter,

        handle: function(cmd, params, extRespond, extQueuePush) {
            const self = this;
            this.loadSave();
            const pendingPushes = [];
            const queuePush = function(pCmd, pData) {
                pendingPushes.push({
                    cmd: pCmd,
                    data: pData !== undefined ? pData : {}
                });
            };
            let responded = false;
            const respond = function(data, err) {
                if (responded) return;
                responded = true;
                self.save();
                if (typeof extRespond === "function") {
                    if (typeof extQueuePush === "function") {
                        for (let i = 0; i < pendingPushes.length; i++) {
                            extQueuePush(pendingPushes[i].cmd, pendingPushes[i].data);
                        }
                    }
                    extRespond(data !== undefined ? data : {}, err || null);
                }
            };

            try {
                if (this.handlePlayer(cmd, params, respond, queuePush)) return true;
                if (this.handleChapter(cmd, params, respond, queuePush)) return true;
                if (this.handleHeroCommand(cmd, params, respond, queuePush)) return true;
                if (this.handleShopAndBoxCommand(cmd, params, respond, queuePush)) return true;
                if (this.handleEventAndSignInCommand(cmd, params, respond, queuePush)) return true;
                if (this.handleArenaAndTowerCommand(cmd, params, respond, queuePush)) return true;
                if (this.handleGuildCommand(cmd, params, respond, queuePush)) return true;
                if (this.handleGmAndChatCommand(cmd, params, respond, queuePush)) return true;

                respond({ status: 1 });
                return true;
            } catch (err) {
                console.error(`[-] Error handling command ${cmd}:`, err);
                respond({}, { code: 1, msg: "Lỗi xử lý lệnh: " + err.message });
                return true;
            }
        }
    },
    EconomyService,
    HeroHandler,
    ShopAndBoxHandler,
    EventAndSignInHandler,
    ArenaAndTowerHandler,
    GuildHandler,
    GmAndChatHandler
);

// Create an instance for a specific player session
class PlayerSession {
    constructor(ws) {
        this.ws = ws;
        this.playerId = "1";
        this.username = "Player_1";
        this.hasLoggedIn = false;
        this.server = Object.create(OfflineServer);
        this.server.data = null;
    }

    initPlayer(playerId, username) {
        this.playerId = String(playerId || "1");
        this.username = username || `${this.playerId}`;
        if (!playerDb[this.playerId]) {
            console.log(`[*] Creating new save data for Player ${this.playerId} (${this.username})...`);
            this.server.initDefaultData();
            this.server.ensureDataFields();
            this.server.data.player_id = this.playerId;
            this.server.data.uid = getOrAssignUid(this.playerId, this.server.data);
            this.server.data.team_name = this.username;
            playerDb[this.playerId] = this.server.data;
            markDirty(this.playerId);
            saveDb();
        } else {
            console.log(`[*] Loading existing save data for Player ${this.playerId} (${this.username})...`);
            this.server.data = playerDb[this.playerId];
            this.server.ensureDataFields();
            this.server.data.uid = getOrAssignUid(this.playerId, this.server.data);
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
            this.hasLoggedIn = true;
            const uid = (params && params[0]) ? String(params[0]) : "1";
            this.initPlayer(uid, uid);
        } else if (!this.server.data) {
            this.initPlayer(this.playerId, this.username);
        }

        // ---- Multiplayer-aware commands (need access to other players) ----
        const d = this.server.data;
        if (cmd === "GetPlayerId") {
            const queryName = String((params && params[0]) || "").trim();
            const found = findPlayerByIdOrUid(queryName);
            if (!found) return this.sendPacket(cmd, {}, { code: 1, msg: "Không tìm thấy người chơi này!" });
            const targetUid = getOrAssignUid(found.key, found.data);
            return this.sendPacket(cmd, { playerId: targetUid });
        }
        if (cmd === "GetPlayerInfo") {
            const qId = (params && params[0]) !== undefined ? params[0] : "";
            const found = findPlayerByIdOrUid(qId);
            const t = found ? found.data : {};
            const tUid = found ? getOrAssignUid(found.key, found.data) : Number(qId || 0);
            return this.sendPacket(cmd, {
                group_name: t.group_id ? (t.group_name || "") : "",
                player_id: tUid || String(qId),
                player_name: t.team_name || ("Nhẫn Giả " + qId),
                player_lv: Number(t.team_lv || 1),
                player_vip: Number(t.vip_lv || 0),
                player_icon: Number(t.icon || 10010)
            });
        }
        if (cmd === "AddBlack") {
            if (!Array.isArray(d.blacks)) d.blacks = [];
            const tid = String((params && params[0]) || "");
            if (tid && !d.blacks.some(b => String(b.target_id) === tid)) {
                d.blacks.push({
                    target_id: tid,
                    icon: Number((params && params[1]) || 10010),
                    lv: Number((params && params[2]) || 1),
                    name: String((params && params[3]) || "")
                });
            }
            markDirty(this.playerId);
            saveDb();
            return this.sendPacket(cmd, { status: 1 });
        }
        if (cmd === "RemoveFromBlack") {
            const tid = String((params && params[0]) || "");
            d.blacks = (d.blacks || []).filter(b => String(b.target_id) !== tid);
            markDirty(this.playerId);
            saveDb();
            return this.sendPacket(cmd, { status: 1 });
        }
        if (cmd === "BlackList") {
            return this.sendPacket(cmd, { blacks: d.blacks || [] });
        }

        const queue = [];
        const queuePush = (pushCmd, pushData) => {
            queue.push({ func_name: pushCmd, data: pushData });
        };

        const respond = (respData, err) => {
            for (const q of queue) {
                this.sendPacket(q.func_name, q.data);
            }
            this.sendPacket(cmd, respData, err);

            // Real-time broadcast for Chat and LsvChatSend to other connected players
            if (!err && respData && respData.chat && (cmd === "Chat" || (typeof SVRCMD !== "undefined" && cmd === SVRCMD.Chat))) {
                const broadcastFrame = JSON.stringify({
                    func_name: "Chat",
                    data: { chat: respData.chat },
                    error: {}
                });
                for (const sock of connectedSockets) {
                    if (sock !== this.ws) {
                        sendWsFrame(sock, broadcastFrame);
                    }
                }
            }
            if (!err && (cmd === "SendLatern" || (typeof SVRCMD !== "undefined" && cmd === SVRCMD.SendLatern))) {
                const lanternText = String((params && params[0]) || "").trim();
                if (lanternText) {
                    const senderName = (this.server.data && this.server.data.team_name) || this.username || "Nhẫn Giả";
                    const shoutFrame = JSON.stringify({
                        func_name: "Chat",
                        data: {
                            chat: {
                                id: Date.now() % 10000000,
                                source_server: 1,
                                player_id: this.server.getNumericId(),
                                player_name: senderName,
                                player_icon: Number((this.server.data && this.server.data.icon) || 10010),
                                player_lv: Number((this.server.data && this.server.data.team_lv) || 1),
                                player_vip: Number((this.server.data && this.server.data.vip_lv) || 0),
                                create_time: Math.floor(Date.now() / 1000),
                                fight_record_id: 0,
                                msg: "[LOA] " + lanternText,
                                send_to: 0,
                                send_to_name: ""
                            }
                        },
                        error: {}
                    });
                    for (const sock of connectedSockets) {
                        sendWsFrame(sock, shoutFrame);
                    }
                }
            }

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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === '/status' || req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            status: "online",
            game: "Ninja Rebirth",
            version: "1.0.4.102-modular",
            build: "railway-ready",
            online_players: connectedSockets.size,
            registered_players: Object.keys(playerDb).length,
            uptime_seconds: Math.floor(process.uptime())
        }));
        return;
    }

    if (req.url && (req.url.startsWith('/auth') || req.url.startsWith('/api/auth') || req.url.includes('api='))) {
        let bodyStr = '';
        req.on('data', chunk => { bodyStr += chunk; });
        req.on('end', () => {
            try {
                const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
                const api = (parsedUrl.searchParams.get('api') || '').toLowerCase();
                let pkg = [];
                if (bodyStr) {
                    try {
                        pkg = JSON.parse(bodyStr);
                    } catch (e) {
                        const sp = new URLSearchParams(bodyStr);
                        if (sp.has('pkg')) {
                            try { pkg = JSON.parse(sp.get('pkg')); } catch (e2) {}
                        }
                    }
                } else if (parsedUrl.searchParams.has('pkg')) {
                    try { pkg = JSON.parse(parsedUrl.searchParams.get('pkg')); } catch (e) {}
                }
                if (!Array.isArray(pkg)) pkg = [];

                const sendJson = (obj) => {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify(obj));
                };

                const ensurePlayerRecord = (acc, pwd) => {
                    if (!playerDb[acc]) {
                        const tmp = Object.create(OfflineServer);
                        tmp.initDefaultData();
                        tmp.ensureDataFields();
                        tmp.data.player_id = acc;
                        tmp.data.uid = getOrAssignUid(acc, tmp.data);
                        tmp.data.team_name = acc;
                        if (pwd !== undefined) tmp.data.password = String(pwd);
                        playerDb[acc] = tmp.data;
                        markDirty(acc);
                        saveDb();
                    } else {
                        playerDb[acc].uid = getOrAssignUid(acc, playerDb[acc]);
                    }
                    return playerDb[acc];
                };

                if (api === 'signup') {
                    const acc = String(pkg[0] || '').trim();
                    const pwd = String(pkg[1] || '');
                    if (!acc) return sendJson({ err_code: 1, err_msg: "Vui lòng nhập tên tài khoản!" });
                    if (playerDb[acc] && playerDb[acc].password) {
                        return sendJson({ err_code: 1, err_msg: "Tài khoản đã tồn tại, vui lòng đăng nhập!" });
                    }
                    const rec = ensurePlayerRecord(acc, pwd);
                    rec.password = pwd;
                    markDirty(acc);
                    saveDb();
                    return sendJson([acc, "sess_" + acc + "_" + Date.now()]);
                }

                if (api === 'signin') {
                    const acc = String(pkg[0] || '').trim();
                    const pwd = String(pkg[1] || '');
                    if (!acc) return sendJson({ err_code: 1, err_msg: "Vui lòng nhập tên tài khoản!" });
                    if (playerDb[acc]) {
                        if (playerDb[acc].password && playerDb[acc].password !== pwd) {
                            return sendJson({ err_code: 1, err_msg: "Sai tài khoản hoặc mật khẩu!" });
                        }
                        if (!playerDb[acc].password && pwd) {
                            playerDb[acc].password = pwd;
                            markDirty(acc);
                            saveDb();
                        }
                    } else {
                        ensurePlayerRecord(acc, pwd);
                    }
                    return sendJson([acc, "sess_" + acc + "_" + Date.now()]);
                }

                if (api === 'check_guest_user' || api === 'checkguestuser') {
                    const gid = String(pkg[0] || '').trim() || ("guest_" + (Math.floor(Math.random() * 899999) + 100000));
                    const gpwd = String(pkg[1] || '123456');
                    ensurePlayerRecord(gid, gpwd);
                    return sendJson([gid, gpwd, gid, "sess_" + gid + "_" + Date.now()]);
                }

                if (api === 'get_server_list' || api === 'getserverlist') {
                    return sendJson({
                        servers: [{
                            id: 1,
                            name: "Ninja Đại Chiến",
                            serverip: "interchange.proxy.rlwy.net:19046/rpc",
                            host: "interchange.proxy.rlwy.net",
                            port: 19046,
                            status: 1,
                            newer: 1,
                            hot: 1
                        }]
                    });
                }

                if (api === 'get_notifications' || api === 'getnotifications') {
                    return sendJson([]);
                }

                if (api === 'change_password') {
                    const acc = String(pkg[0] || '').trim();
                    const oldPwd = String(pkg[1] || '');
                    const newPwd = String(pkg[2] || '');
                    if (acc && playerDb[acc]) {
                        if (playerDb[acc].password && playerDb[acc].password !== oldPwd) {
                            return sendJson({ err_code: 1, err_msg: "Mật khẩu cũ không đúng!" });
                        }
                        playerDb[acc].password = newPwd;
                        markDirty(acc);
                        saveDb();
                    }
                    return sendJson({ status: 1 });
                }

                if (api === 'change_username') {
                    const oldAcc = String(pkg[0] || '').trim();
                    const newAcc = String(pkg[2] || pkg[1] || '').trim();
                    const newPwd = String(pkg[3] || '');
                    if (newAcc && playerDb[newAcc] && newAcc !== oldAcc) {
                        return sendJson({ err_code: 1, err_msg: "Tên tài khoản mới đã tồn tại!" });
                    }
                    if (oldAcc && newAcc && playerDb[oldAcc]) {
                        playerDb[newAcc] = playerDb[oldAcc];
                        playerDb[newAcc].player_id = newAcc;
                        if (newPwd) playerDb[newAcc].password = newPwd;
                        markDirty(newAcc);
                        saveDb();
                    }
                    return sendJson({ status: 1 });
                }

                return sendJson({ status: 1 });
            } catch (err) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ err_code: 1, err_msg: err.message }));
            }
        });
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Ninja Rebirth Online Server</title><meta charset="utf-8"></head>
        <body style="font-family:sans-serif; background:#1e1e2f; color:#fff; padding:30px;">
            <h1>🍃 Ninja Rebirth Standalone Server</h1>
            <p style="color:#4caf50;"><b>● Server Status: ONLINE (Modular v1.0.4.102)</b></p>
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

    setTimeout(() => {
        if (!socket.destroyed && !session.hasLoggedIn) {
            session.sendPacket("Connected", { status: 1 });
        }
    }, 60);

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
                socket.end();
                break;
            } else if (opcode === 0x09) {
                const pongHeader = Buffer.from([0x8A, 0x00]);
                socket.write(pongHeader);
            } else if (opcode === 0x01 || opcode === 0x02) {
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

if (require.main === module) {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`=======================================================`);
        console.log(`🍃 Ninja Rebirth Standalone Online Server is running!`);
        console.log(`   Port     : ${PORT}`);
        console.log(`   WebSocket: ws://localhost:${PORT}`);
        console.log(`   Dashboard: http://localhost:${PORT}/status`);
        console.log(`=======================================================`);
    });
}

module.exports = {
    OfflineServer,
    PlayerSession,
    server
};
