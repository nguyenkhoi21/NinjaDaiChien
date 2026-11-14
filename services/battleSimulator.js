// ============================================================================
// HEADLESS BATTLE SIMULATOR (runs client battle logic on Node.js server)
// ============================================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const http = require("http");
const zlib = require("zlib");

const CLIENT_BATTLE_DIR = path.join(__dirname, "..", "battle_engine", "modules", "battle");

let _simContext = null;

function createCcClass() {
    const Class = function () { };
    Class.extend = function (prop) {
        const _super = this.prototype;
        const prototype = Object.create(_super);
        for (const name in prop) {
            if (typeof prop[name] === "function" && typeof _super[name] === "function") {
                prototype[name] = (function (name, fn) {
                    return function () {
                        const tmp = this._super;
                        this._super = _super[name];
                        const ret = fn.apply(this, arguments);
                        this._super = tmp;
                        return ret;
                    };
                })(name, prop[name]);
            } else {
                prototype[name] = prop[name];
            }
        }
        function SubClass() {
            if (this.ctor) {
                this.ctor.apply(this, arguments);
            }
        }
        SubClass.prototype = prototype;
        SubClass.prototype.constructor = SubClass;
        SubClass.extend = Class.extend;
        return SubClass;
    };
    return Class;
}

function initSimContext() {
    if (_simContext) return _simContext;

    const ccClass = createCcClass();
    const ccShim = {
        Class: ccClass,
        p: function (x, y) { return { x: x || 0, y: y || 0 }; },
        rect: function (x, y, w, h) { return { x: x || 0, y: y || 0, width: w || 0, height: h || 0 }; },
        rectContainsPoint: function (rect, pt) {
            return pt.x >= rect.x && pt.x <= rect.x + rect.width && pt.y >= rect.y && pt.y <= rect.y + rect.height;
        },
        pDistance: function (p1, p2) {
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            return Math.sqrt(dx * dx + dy * dy);
        },
        pSub: function (p1, p2) { return { x: p1.x - p2.x, y: p1.y - p2.y }; },
        pAdd: function (p1, p2) { return { x: p1.x + p2.x, y: p1.y + p2.y }; },
        pMult: function (p, s) { return { x: p.x * s, y: p.y * s }; },
        pNormalize: function (p) {
            const len = Math.sqrt(p.x * p.x + p.y * p.y);
            return len > 0 ? { x: p.x / len, y: p.y / len } : { x: 0, y: 0 };
        },
        log: function () { },
        warn: function () { },
        error: function () { },
        assert: function (cond, msg) { if (!cond) throw new Error(msg || "Assertion failed"); },
        director: {
            getScheduler: function () {
                return {
                    scheduleUpdateForTarget: function () { },
                    unscheduleUpdateForTarget: function () { }
                };
            }
        },
        sys: { isNative: false },
        defineGetterSetter: function (proto, prop, getter, setter) {
            var desc = { enumerable: true, configurable: true };
            if (getter) desc.get = getter;
            if (setter) desc.set = setter;
            Object.defineProperty(proto, prop, desc);
        }
    };

    const eventDispatcherShim = {
        _shared: {
            addListener: function () { },
            removeListenerByDelgate: function () { },
            dispatchEvent: function () { }
        },
        shared: function () { return this._shared; }
    };

    const sandbox = {
        console: console,
        Math: Math,
        Date: Date,
        Array: Array,
        Object: Object,
        Number: Number,
        String: String,
        Boolean: Boolean,
        JSON: JSON,
        parseInt: parseInt,
        parseFloat: parseFloat,
        isNaN: isNaN,
        cc: ccShim,
        EventDispatcher: eventDispatcherShim,
        Config: global.Config || {},
        Cache: {
            getServerTime: function () { return 0; }
        },
        gamePlayer: {
            heros: {},
            team_lv: 80
        },
        NumUnit: {
            random: function (min, max) {
                return Math.floor(Math.random() * (max - min + 1)) + min;
            },
            getBamenAddSpeed: function () { return 0; }
        },
        AudioManager: { playEffect: function () { } },
        SoundManager: { playEffect: function () { } },
        LANSTR: new Proxy({}, { get: function (_, k) { return String(k); } }),
        clearSkillCacheList: function () { },
        stat_add: function (target, prop, val) {
            if (target && target[prop] !== undefined) target[prop] += Number(val || 0);
        },
        zip_deflate: function (str) {
            return zlib.deflateRawSync(Buffer.from(String(str), "utf8")).toString("base64");
        },
        zip_inflate: function (str) {
            return zlib.inflateRawSync(Buffer.from(String(str), "base64")).toString("utf8");
        },
        UBYTE_MAX: 256,
        USHORT_MAX: 65536,
        UINT_MAX: 4294967296,
        SKILLTYPE_PASSIVE: 1,
        SKILLTYPE_DRIVING: 2,
        SKILLTYPE_RATE: 3,
        SKILLTYPE_COOLDOWN: 4,
        SKILLTYPE_ONSTART: 5,
        SKILLTYPE_CDRANDOMLINK: 6,
        SKILLTYPE_SKILLLINK: 7
    };
    sandbox.window = sandbox;
    sandbox.global = sandbox;

    const ctx = vm.createContext(sandbox);
    vm.runInContext(`
        if (!Object.prototype.getValByKey) {
            Object.defineProperty(Object.prototype, "getValByKey", {
                value: function (k) { return this[k]; },
                enumerable: false,
                configurable: true,
                writable: true
            });
        }
    `, ctx);

    const baseModelFiles = [
        path.join(__dirname, "..", "battle_engine", "skill_constants.js"),
        path.join(__dirname, "..", "battle_engine", "utils", "SCRandom.js"),
        path.join(__dirname, "..", "battle_engine", "baseModel", "Hero.js"),
        path.join(__dirname, "..", "battle_engine", "baseModel", "Skill.js"),
        path.join(__dirname, "..", "battle_engine", "netWork", "PackageReader.js"),
        path.join(__dirname, "..", "battle_engine", "netWork", "PackageWriter.js")
    ];
    for (const f of baseModelFiles) {
        if (fs.existsSync(f)) {
            vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: path.basename(f) });
        }
    }

    const filesToLoad = [
        "BattleEvent.js",
        "Juggler.js",
        "DelayedCall.js",
        "BattleIdea.js",
        "BattleAI.js",
        "BattleSkillEffect.js",
        "BattleAction.js",
        "BattleActionGenerater.js",
        "BattleUnit.js",
        "BattleModle.js",
        "ReplayData.js",
        "BattleManager.js"
    ];

    for (const file of filesToLoad) {
        const fullPath = path.join(CLIENT_BATTLE_DIR, file);
        if (fs.existsSync(fullPath)) {
            const code = fs.readFileSync(fullPath, "utf8");
            vm.runInContext(code, ctx, { filename: file });
        }
    }

    _simContext = ctx;
    return ctx;
}

function simulateBattleFromBm(bmStr, seed) {
    const ctx = initSimContext();
    ctx.Config = global.Config || ctx.Config;
    const BattleModleRef = ctx.BattleModle || (ctx.window && ctx.window.BattleModle);
    if (!BattleModleRef || typeof BattleModleRef.getModleFromString !== "function") {
        throw new Error("BattleModle is not initialized in battleSimulator context");
    }
    const bmArr = bmStr.split(",");
    const bm = BattleModleRef.getModleFromString(bmArr);
    const replay = new ctx.ReplayData(bm);
    bm.replaydata = replay;
    bm.seed = seed || Math.floor(Math.random() * 900000) + 100000;

    const ensureGroupHp = (grp) => {
        if (!Array.isArray(grp)) return;
        for (const u of grp) {
            if (u && typeof u.getHp === "function" && u.getHp() <= 0) {
                const maxHp = (u.hero && (u.hero.maxHp || u.hero.hp)) ? Number(u.hero.maxHp || u.hero.hp) : 100000;
                u.setHp(Math.max(1000, maxHp));
            }
        }
    };
    ensureGroupHp(bm.attackGroup);
    ensureGroupHp(bm.defenceGroup);

    const mgr = ctx.BattleManager.shared();
    mgr.openlog = false;
    mgr.beginWithModle(bm, true, bm.seed, null);
    mgr.runOutBattle();

    const finalReplay = bm.replaydata || mgr.replaydata || replay;
    const rawData = (finalReplay && finalReplay.data) ? finalReplay.data : {};
    const maxframetime = rawData.maxframetime || mgr.runtime || 12000;
    console.log("[BattleSim] atk:", bm.attackGroup.length, "def:", bm.defenceGroup.length, "frames:", Object.keys(rawData).length, "maxframetime:", maxframetime, "isWin:", !!bm.result);
    const replayObj = Object.assign({}, rawData, {
        bm: bmStr,
        result: !!bm.result,
        seed: bm.seed,
        arena_protocol: 2,
        maxframetime: maxframetime
    });
    return {
        isWin: !!bm.result,
        replay: replayObj
    };
}

module.exports = {
    initSimContext,
    simulateBattleFromBm,
    checkAndUpdateBattleEngine
};

const BATTLE_ENGINE_RELS = [
    "utils/SCRandom.js",
    "baseModel/Hero.js",
    "baseModel/Skill.js",
    "netWork/PackageReader.js",
    "netWork/PackageWriter.js",
    "modules/battle/BattleEvent.js",
    "modules/battle/Juggler.js",
    "modules/battle/DelayedCall.js",
    "modules/battle/BattleIdea.js",
    "modules/battle/BattleAI.js",
    "modules/battle/BattleSkillEffect.js",
    "modules/battle/BattleAction.js",
    "modules/battle/BattleActionGenerater.js",
    "modules/battle/BattleUnit.js",
    "modules/battle/BattleModle.js",
    "modules/battle/ReplayData.js",
    "modules/battle/BattleManager.js"
];

function decryptDdsBuffer(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 12 || buf.slice(0, 3).toString("ascii") !== "DDS") {
        return buf;
    }
    const keyFile = path.join(__dirname, "..", "battle_engine", "dds_key.json");
    if (!fs.existsSync(keyFile)) return buf;
    const KEY_TABLE = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    const out = Buffer.from(buf);
    const numWords = Math.floor((out.length - 8) / 4);
    let keyIdx = 0;
    const n1 = Math.min(numWords, 512);
    for (let i = 0; i < n1; i++) {
        const off = 8 + i * 4;
        const w = (out.readUInt32LE(off) ^ (KEY_TABLE[keyIdx] >>> 0)) >>> 0;
        out.writeUInt32LE(w, off);
        keyIdx = (keyIdx + 1) % 1024;
    }
    for (let i = 512; i < numWords; i += 64) {
        const off = 8 + i * 4;
        const w = (out.readUInt32LE(off) ^ (KEY_TABLE[keyIdx] >>> 0)) >>> 0;
        out.writeUInt32LE(w, off);
        keyIdx = (keyIdx + 1) % 1024;
    }
    return out.slice(8);
}

function fetchBuffer(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error("HTTP " + res.statusCode));
            }
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve(Buffer.concat(chunks)));
        }).on("error", reject);
    });
}

async function checkAndUpdateBattleEngine() {
    try {
        const manifestUrl = "http://103.90.227.124:8080/static/hotfix/android/project.manifest";
        const raw = await fetchBuffer(manifestUrl);
        const manifest = JSON.parse(raw.toString("utf8"));
        const assets = manifest.assets || {};
        const pkgUrl = manifest.packageUrl || "http://103.90.227.124:8080/static/hotfix/android/";
        const md5File = path.join(__dirname, "..", "battle_engine", ".manifest_md5.json");
        let savedMd5 = {};
        if (fs.existsSync(md5File)) {
            try { savedMd5 = JSON.parse(fs.readFileSync(md5File, "utf8")) || {}; } catch (e) { }
        }
        let updated = 0;
        for (const rel of BATTLE_ENGINE_RELS) {
            const key = "src/" + rel;
            const entry = assets[key];
            if (!entry || !entry.md5) continue;
            if (savedMd5[key] === entry.md5) continue;
            const fileBuf = await fetchBuffer(pkgUrl + key);
            const decBuf = decryptDdsBuffer(fileBuf);
            const outPath = path.join(__dirname, "..", "battle_engine", rel);
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            fs.writeFileSync(outPath, decBuf);
            savedMd5[key] = entry.md5;
            updated++;
        }
        if (updated > 0) {
            fs.writeFileSync(md5File, JSON.stringify(savedMd5, null, 2), "utf8");
            _simContext = null; // Reload battle engine on next simulation
            console.log("[BattleSimulator] Auto-updated " + updated + " battle engine files from hotfix.");
        }
    } catch (e) {
        // Ignore network errors so server keeps running with local battle_engine
    }
}

setTimeout(checkAndUpdateBattleEngine, 5000);
setInterval(checkAndUpdateBattleEngine, 30 * 60 * 1000);
