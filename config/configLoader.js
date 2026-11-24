/**
 * Config Loader (Load ConfigData.json, SVRCMD, Cache, OnlineEvents, OnlineLucky)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');

if (typeof global !== 'undefined') {
    global.SVRCMD = new Proxy({}, { get: (t, p) => p });
    global.Cache = {
        getServerTime: function() {
            return Date.now();
        },
        getServerTimeByZone: function() {
            return Date.now() + 7 * 3600 * 1000;
        },
        setServerTime: function() {}
    };
}

const ConfigGlobalVar = {};
const Config = {
    maleFirstname: [],
    femaleFirstname: [],
    lastname: [],
    sensitiveWord: [],
    level: {},
    vipLevel: {},
    lvReward: [],
    hero: {},
    heroLevel: {},
    heroQuality: {},
    skill: {},
    skillLevel: {},
    chapter: {},
    dialog: {},
    dialogShop: {},
    equip: {},
    item: {},
    expItem: {},
    shop: {},
    box: {},
    friendship: {},
    box_drop: {},
    box_drop_item: {},
    chapter_box: {},
    chapter_npc: {},
    daily_task: {},
    achievement: {},
    global_var: {},
    goods: {},
    goods2: {},
    goodsDrop: {},
    pkReward: {},
    signIn: {},
    sign: {},
    beast: {},
    buffEffect: {},
    activity: {},
    task: {},
    school: {},
    equip_level: {},
    player_head: {},
    hero_quality_up: {},
    bamen: {},
    ninja_tool: {},
    tower: {},
    skill_effect: {},
    skillEffect: {}
};

function resetConfigTables() {
    for (const k of Object.keys(ConfigGlobalVar)) {
        delete ConfigGlobalVar[k];
    }
    const arrayKeys = ['maleFirstname', 'femaleFirstname', 'sensitiveWord', 'lastname', 'lvReward'];
    for (const k of Object.keys(Config)) {
        Config[k] = arrayKeys.indexOf(k) >= 0 ? [] : {};
    }
}

function loadConfigData() {
    const configPath = path.join(__dirname, 'ConfigData.json');
    if (!fs.existsSync(configPath)) {
        console.warn('[-] ConfigData.json not found at', configPath);
        return;
    }
    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const data = JSON.parse(raw);
        resetConfigTables();

        Config.maleFirstname = data.male_firstname || [];
        Config.femaleFirstname = data.female_firstname || [];
        Config.sensitiveWord = data.sensitive_word || [];
        Config.lastname = data.lastname || [];

        if (Array.isArray(data.level)) {
            for (const sd of data.level) {
                Config.level[sd.level] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.vip_level)) {
            for (const sd of data.vip_level) {
                Config.vipLevel[sd.vip] = Object.assign({}, sd);
            }
        }

        Config.lvReward = [];
        if (Array.isArray(data.lv_reward)) {
            for (const sd of data.lv_reward) {
                Config.lvReward.push(Object.assign({}, sd));
            }
        }

        if (Array.isArray(data.hero)) {
            for (const sd of data.hero) {
                const nd = Object.assign({}, sd);
                const txt = String(sd.intro || "").split(";");
                nd.intro = txt[0] || "";
                nd.intro2 = txt[1] || "";
                Config.hero[nd.id] = nd;
            }
        }

        if (Array.isArray(data.hero_level)) {
            for (const sd of data.hero_level) {
                Config.heroLevel[sd.level] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.hero_quality)) {
            for (const sd of data.hero_quality) {
                if (!Config.heroQuality[sd.quality]) {
                    Config.heroQuality[sd.quality] = {};
                }
                Config.heroQuality[sd.quality][sd.hero_id] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.skill)) {
            for (const sd of data.skill) {
                Config.skill[sd.id] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.skill_level)) {
            for (const sd of data.skill_level) {
                if (!Config.skillLevel[sd.level]) {
                    Config.skillLevel[sd.level] = {};
                }
                Config.skillLevel[sd.level][sd.quality] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.chapter)) {
            for (const sd of data.chapter) {
                Config.chapter[sd.id] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.equip)) {
            for (const sd of data.equip) {
                const nd = Object.assign({}, sd);
                nd.sell_price = sd.offer_pc !== undefined ? sd.offer_pc : sd.sell_price;
                nd.mp_def = sd.mp_def !== undefined ? sd.mp_def : sd.mpdef;
                Config.equip[nd.id] = nd;
            }
        }

        if (Array.isArray(data.item)) {
            for (const sd of data.item) {
                const nd = Object.assign({}, sd);
                nd.func = sd["function"];
                const txt = String(sd.desc || "").split(";");
                nd.intro = txt[0] || "";
                nd.intro2 = txt[1] || "";
                Config.item[nd.id] = nd;
                if (Number(sd.item_type) === 1) {
                    Config.expItem[nd.id] = nd;
                }
            }
        }

        if (Array.isArray(data.shop)) {
            for (const sd of data.shop) {
                Config.shop[sd.id] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.friendship)) {
            for (const sd of data.friendship) {
                Config.friendship[sd.id] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.box)) {
            for (const sd of data.box) {
                Config.box[sd.id] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.box_drop)) {
            for (const sd of data.box_drop) {
                if (!Config.box_drop[sd.box_id]) {
                    Config.box_drop[sd.box_id] = {};
                }
                const nd = Object.assign({}, sd);
                Config.box_drop[sd.box_id][sd.id] = nd;
                Config.box_drop_item[sd.id] = nd;
            }
        }

        if (Array.isArray(data.chapter_box)) {
            for (const sd of data.chapter_box) {
                if (!Config.chapter_box[sd.chapter_id]) {
                    Config.chapter_box[sd.chapter_id] = {};
                }
                Config.chapter_box[sd.chapter_id][sd.box_id] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.chapter_npc)) {
            for (const sd of data.chapter_npc) {
                if (!Config.chapter_npc[sd.chapter_id]) Config.chapter_npc[sd.chapter_id] = {};
                if (!Config.chapter_npc[sd.chapter_id][sd.difficult]) Config.chapter_npc[sd.chapter_id][sd.difficult] = {};
                if (!Config.chapter_npc[sd.chapter_id][sd.difficult][sd.wave]) Config.chapter_npc[sd.chapter_id][sd.difficult][sd.wave] = [];
                Config.chapter_npc[sd.chapter_id][sd.difficult][sd.wave].push(Object.assign({}, sd));
            }
        }

        if (Array.isArray(data.daily_task)) {
            for (const sd of data.daily_task) {
                Config.daily_task[sd.task_type] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.achievement)) {
            for (const sd of data.achievement) {
                const nd = Object.assign({}, sd);
                nd.intro = sd.desc;
                Config.achievement[nd.id] = nd;
            }
        }

        if (Array.isArray(data.global_var)) {
            for (const sd of data.global_var) {
                const nd = {
                    name: sd.k,
                    amounts: sd.v_string,
                    remark: sd.remark
                };
                Config.global_var[nd.name] = nd;
                ConfigGlobalVar[nd.name] = nd.amounts;
            }
        }

        if (Array.isArray(data.goods)) {
            for (const sd of data.goods) {
                Config.goods[sd.id] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.goods2)) {
            for (const sd of data.goods2) {
                if (!Config.goods2[sd.id]) {
                    Config.goods2[sd.id] = [];
                }
                Config.goods2[sd.id][sd.buy_count] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.goods_drop)) {
            for (const sd of data.goods_drop) {
                Config.goodsDrop[sd.goods_id] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.arena_rank_box)) {
            for (let i = 0; i < data.arena_rank_box.length; i++) {
                Config.pkReward[i] = Object.assign({}, data.arena_rank_box[i]);
            }
        }

        if (Array.isArray(data.sign_in)) {
            for (const sd of data.sign_in) {
                if (!Config.signIn[sd.month]) {
                    Config.signIn[sd.month] = [];
                }
                Config.signIn[sd.month][sd.day] = Object.assign({}, sd);
            }
            Config.sign = Config.signIn;
        }

        if (Array.isArray(data.beast)) {
            for (const sd of data.beast) {
                if (!Config.beast[sd.id]) {
                    Config.beast[sd.id] = [];
                }
                Config.beast[sd.id][sd.level] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.server_activity)) {
            for (const sd of data.server_activity) {
                if (!sd.name || sd.name.length < 2) continue;
                const nd = Object.assign({}, sd);
                let idx = sd.name.indexOf(";");
                if (idx <= 0) idx = sd.name.length;
                nd.title = sd.name.substr(0, idx);
                nd.name = sd.name.replace(/;/ig, "\n");
                nd.intro = String(sd.desc || "").replace(/;/ig, "\n");
                Config.activity[nd.activity_id] = nd;
            }
        }

        if (Array.isArray(data.task)) {
            for (const sd of data.task) {
                Config.task[sd.id] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.school)) {
            for (const sd of data.school) {
                Config.school[sd.id] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.equip_level)) {
            for (const sd of data.equip_level) {
                if (!Config.equip_level[sd.lv]) {
                    Config.equip_level[sd.lv] = {};
                }
                Config.equip_level[sd.lv][sd.quality] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.player_head)) {
            for (const sd of data.player_head) {
                const nd = Object.assign({}, sd);
                nd.item_id = sd.itme_id !== undefined ? sd.itme_id : sd.item_id;
                Config.player_head[sd.icon_id] = nd;
            }
        }

        if (Array.isArray(data.hero_quality_up)) {
            for (const sd of data.hero_quality_up) {
                Config.hero_quality_up[sd.quality] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.ba_men)) {
            for (const sd of data.ba_men) {
                Config.bamen[sd.level] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.ninja_tool)) {
            for (const sd of data.ninja_tool) {
                Config.ninja_tool[sd.id] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.tower)) {
            for (const sd of data.tower) {
                Config.tower[sd.id] = Object.assign({}, sd);
            }
        }

        if (Array.isArray(data.skill_effect)) {
            for (const sd of data.skill_effect) {
                Config.skill_effect[sd.id] = Object.assign({}, sd);
                Config.skillEffect[sd.id] = Object.assign({}, sd);
            }
        }

        console.log(`[+] Loaded ConfigData.json (Heroes: ${Object.keys(Config.hero).length}, Items: ${Object.keys(Config.item).length}, Equips: ${Object.keys(Config.equip).length}, Shops: ${Object.keys(Config.shop).length})`);
    } catch (e) {
        console.error('[-] Failed to parse ConfigData.json:', e.message);
    }
}

const UPSTREAM_CONFIG_URL = process.env.UPSTREAM_CONFIG_URL || 'http://103.90.227.124:8080/static/hotfix/android/res/ConfigData.json';
const GITHUB_REPO = process.env.GITHUB_REPO || 'nguyenkhoi21/NinjaDaiChien';
const GITHUB_MIRROR_BRANCH = process.env.GITHUB_MIRROR_BRANCH || 'hotfix-mirror';
const MIRROR_CONFIG_URL = process.env.MIRROR_CONFIG_URL || `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_MIRROR_BRANCH}/hotfix/android/res/ConfigData.json`;
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;
let _ddsKeyTable = null;
let _lastUpstreamSyncAt = 0;
let _syncInFlight = null;

function getDdsKeyTable() {
    if (_ddsKeyTable) return _ddsKeyTable;
    const keyPath = path.join(__dirname, '..', 'battle_engine', 'dds_key.json');
    if (fs.existsSync(keyPath)) {
        _ddsKeyTable = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    }
    return _ddsKeyTable;
}

function decryptDdsBuffer(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 12 || buf.subarray(0, 3).toString('ascii') !== 'DDS') {
        return buf;
    }
    const keyTable = getDdsKeyTable();
    if (!Array.isArray(keyTable) || keyTable.length === 0) {
        throw new Error('Missing dds_key.json for DDS decryption');
    }
    const flag = buf[3];
    const numWords = Math.floor((buf.length - 8) / 4);
    const decHeaderAndWords = Buffer.allocUnsafe(numWords * 4);
    buf.copy(decHeaderAndWords, 0, 8, 8 + numWords * 4);

    let keyIdx = 0;
    const n1 = Math.min(numWords, 512);
    for (let i = 0; i < n1; i++) {
        const w = decHeaderAndWords.readUInt32LE(i * 4);
        decHeaderAndWords.writeUInt32LE((w ^ keyTable[keyIdx]) >>> 0, i * 4);
        keyIdx = (keyIdx + 1) % keyTable.length;
    }
    for (let i = 512; i < numWords; i += 64) {
        const w = decHeaderAndWords.readUInt32LE(i * 4);
        decHeaderAndWords.writeUInt32LE((w ^ keyTable[keyIdx]) >>> 0, i * 4);
        keyIdx = (keyIdx + 1) % keyTable.length;
    }

    const tailStart = 8 + numWords * 4;
    const payload = tailStart < buf.length
        ? Buffer.concat([decHeaderAndWords.subarray(4), buf.subarray(tailStart)])
        : decHeaderAndWords.subarray(4);
    return flag === 1 ? zlib.inflateSync(payload) : payload;
}

function syncConfigFromUpstream(options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    options = options || {};
    const done = (err, result) => {
        if (typeof callback === 'function') callback(err, result);
    };

    const now = Date.now();
    if (!options.force && _lastUpstreamSyncAt > 0 && (now - _lastUpstreamSyncAt) < SYNC_COOLDOWN_MS) {
        return done(null, {
            skipped: true,
            updated: false,
            heroCount: Object.keys(Config.hero).length,
            itemCount: Object.keys(Config.item).length
        });
    }

    if (_syncInFlight) {
        _syncInFlight.push(done);
        return;
    }
    _syncInFlight = [done];
    const finishAll = (err, result) => {
        const listeners = _syncInFlight || [];
        _syncInFlight = null;
        for (const fn of listeners) {
            try { fn(err, result); } catch (_) {}
        }
    };

    const candidateUrls = options.url ? [options.url] : [UPSTREAM_CONFIG_URL, MIRROR_CONFIG_URL];
    const tryFetchConfig = (idx) => {
        if (idx >= candidateUrls.length) {
            return finishAll(new Error('All ConfigData sources failed'), null);
        }
        const targetUrl = candidateUrls[idx];
        const transport = targetUrl.startsWith('https://') ? https : http;
        const req = transport.get(targetUrl, { timeout: 15000 }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                if (idx + 1 < candidateUrls.length) {
                    console.warn(`[-] ConfigData HTTP ${res.statusCode} from ${targetUrl}, trying fallback...`);
                    return tryFetchConfig(idx + 1);
                }
                return finishAll(new Error(`Upstream ConfigData HTTP ${res.statusCode}`), null);
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                try {
                    const rawBuf = Buffer.concat(chunks);
                    const plainBuf = decryptDdsBuffer(rawBuf);
                    const plainStr = plainBuf.toString('utf8');
                    const parsed = JSON.parse(plainStr);
                    if (!parsed || !Array.isArray(parsed.hero) || !Array.isArray(parsed.item)) {
                        throw new Error('Upstream ConfigData JSON missing hero/item tables');
                    }
                    const configPath = path.join(__dirname, 'ConfigData.json');
                    const newHash = crypto.createHash('md5').update(plainBuf).digest('hex');
                    let oldHash = '';
                    if (fs.existsSync(configPath)) {
                        oldHash = crypto.createHash('md5').update(fs.readFileSync(configPath)).digest('hex');
                    }
                    _lastUpstreamSyncAt = Date.now();
                    let updated = false;
                    if (newHash !== oldHash) {
                        fs.writeFileSync(configPath, plainStr, 'utf8');
                        loadConfigData();
                        updated = true;
                        console.log(`[+] Synced ConfigData.json from ${targetUrl} (Heroes: ${Object.keys(Config.hero).length}, Items: ${Object.keys(Config.item).length})`);
                    }
                    finishAll(null, {
                        skipped: false,
                        updated: updated,
                        source: targetUrl,
                        heroCount: Object.keys(Config.hero).length,
                        itemCount: Object.keys(Config.item).length
                    });
                } catch (err) {
                    if (idx + 1 < candidateUrls.length) {
                        console.warn(`[-] ConfigData parse failed from ${targetUrl}: ${err.message}, trying fallback...`);
                        return tryFetchConfig(idx + 1);
                    }
                    finishAll(err, null);
                }
            });
        });
        req.on('timeout', () => {
            req.destroy(new Error('Upstream ConfigData request timed out'));
        });
        req.on('error', (err) => {
            if (idx + 1 < candidateUrls.length) {
                console.warn(`[-] ConfigData fetch failed from ${targetUrl}: ${err.message}, trying fallback...`);
                return tryFetchConfig(idx + 1);
            }
            finishAll(err, null);
        });
    };
    tryFetchConfig(0);
}

loadConfigData();

if (typeof global !== 'undefined') {
    global.Config = Config;
    global.ConfigGlobalVar = ConfigGlobalVar;
}

module.exports = {
    Config,
    ConfigGlobalVar,
    loadConfigData,
    decryptDdsBuffer,
    syncConfigFromUpstream
};
