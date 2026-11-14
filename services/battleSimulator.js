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
            _listeners: {},
            addListener: function (evt, fn, delegate) {
                if (!this._listeners[evt]) this._listeners[evt] = [];
                this._listeners[evt].push({ fn: fn, delegate: delegate });
            },
            removeListenerByDelgate: function (delegate) {
                for (const evt in this._listeners) {
                    this._listeners[evt] = this._listeners[evt].filter((item) => item.delegate !== delegate);
                }
            },
            dispatchEventByDelegate: function (delegate, evt) {
                const list = this._listeners[evt];
                if (!list || list.length === 0) return;
                const args = Array.prototype.slice.call(arguments, 2);
                const copy = list.slice(0);
                for (let i = 0; i < copy.length; i++) {
                    if (copy[i].delegate === delegate && typeof copy[i].fn === "function") {
                        copy[i].fn.apply(delegate, args);
                    }
                }
            },
            dispatchEvent: function (evt) {
                const list = this._listeners[evt];
                if (!list || list.length === 0) return;
                const args = Array.prototype.slice.call(arguments, 1);
                const copy = list.slice(0);
                for (let i = 0; i < copy.length; i++) {
                    if (typeof copy[i].fn === "function") {
                        copy[i].fn.apply(copy[i].delegate || null, args);
                    }
                }
            }
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
        EventConst: new Proxy({
            REMOVE_FROM_JUGGLER: "REMOVE_FROM_JUGGLER",
            moneyDroped: "moneyDroped",
            itemDroped: "itemDroped"
        }, {
            get: function (target, k) {
                return (k in target) ? target[k] : String(k);
            }
        }),
        Config: global.Config || {},
        ConfigGlobalVar: (global.Config && global.Config.global) || {},
        WINSIZE: { width: 1136, height: 640 },
        BATTLE_POSITION: { x: -(1920 - 1136) / 2, y: 250 },
        FightDataManager: {
            _inst: null,
            instance: function () {
                if (!this._inst) {
                    this._inst = {
                        getSkillEffectInfo: function (id) {
                            return (sandbox.Config && sandbox.Config.skillEffect && sandbox.Config.skillEffect[id]) || { pause_time: 0 };
                        }
                    };
                }
                return this._inst;
            }
        },
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
        if (!Array.prototype.removeAt) {
            Object.defineProperty(Array.prototype, "removeAt", {
                value: function (index) {
                    if (index >= 0 && index < this.length) {
                        this.splice(index, 1);
                    }
                },
                enumerable: false,
                configurable: true,
                writable: true
            });
        }
        if (!Array.prototype.remove) {
            Object.defineProperty(Array.prototype, "remove", {
                value: function (obj) {
                    var idx = this.indexOf(obj);
                    if (idx >= 0) {
                        this.splice(idx, 1);
                    }
                },
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
        path.join(__dirname, "..", "battle_engine", "baseModel", "Equip.js"),
        path.join(__dirname, "..", "battle_engine", "baseModel", "NinjaTool.js"),
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
        "MonsterUnitGenerater.js",
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

function resolveHeroQuality(cfg, hid, requestedQuality) {
    let qVal = Math.max(1, Number(requestedQuality || 1));
    if (cfg && cfg.heroQuality) {
        for (let q = qVal; q >= 1; q--) {
            if (cfg.heroQuality[q] && cfg.heroQuality[q][hid]) {
                return q;
            }
        }
        return 1;
    }
    return qVal;
}

function buildUnitGeneratorInput(heroOrId, cfg) {
    const h = (heroOrId && typeof heroOrId === "object") ? heroOrId : { hid: Number(heroOrId || 10020) };
    const hid = Number(h.id || h.hero_id || h.hid || h.heroId || 10020);
    const lv = Math.max(1, Number(h.lv || h.level || 80));
    const requestedQ = Number(h.quality || h.heroQuality || 10);
    const quality = resolveHeroQuality(cfg, hid, requestedQ);

    const qty = (cfg && cfg.heroQuality && cfg.heroQuality[quality] && cfg.heroQuality[quality][hid])
        || (cfg && cfg.heroQuality && cfg.heroQuality[1] && cfg.heroQuality[1][hid])
        || {};

    let hp = Number(h.hp || 0);
    let atk = Number(h.atk || h.physicDmg || 0);
    let def = Number(h.def || h.physicDef || 0);
    let mp = Number(h.mp || h.magicDmg || 0);
    let mpDef = Number(h.mp_def || h.magicDef || 0);
    let cri = (h.cri !== undefined) ? Number(h.cri) : (h.physicCirt !== undefined ? Number(h.physicCirt) : NaN);
    let mpCri = (h.mp_cri !== undefined) ? Number(h.mp_cri) : (h.magicCirt !== undefined ? Number(h.magicCirt) : NaN);

    if (hp <= 0 || atk <= 0) {
        hp = Number(qty.hp || 150) + (lv - 1) * Number(qty.hp_inc || 15);
        atk = Number(qty.atk || 20) + (lv - 1) * Number(qty.atk_inc || 3);
        def = Number(qty.def || 5) + (lv - 1) * Number(qty.def_inc || 1);
        mp = Number(qty.mp || 15) + (lv - 1) * Number(qty.mp_inc || 3);
        mpDef = Number(qty.mpdef || 5) + (lv - 1) * Number(qty.mpdef_inc || 1);
        if (isNaN(cri)) cri = Number(qty.cri || 0.05);
        if (isNaN(mpCri)) mpCri = Number(qty.mp_cri || 0.05);

        if (cfg && cfg.equip) {
            for (let s = 1; s <= 6; s++) {
                const eqStatus = Number(h["equip_" + s] || 0);
                if (eqStatus > 0) {
                    const eqId = qty["equip_" + s] || eqStatus;
                    const eqCfg = cfg.equip[eqId];
                    if (eqCfg) {
                        hp += Number(eqCfg.hp || 0);
                        atk += Number(eqCfg.atk || 0);
                        def += Number(eqCfg.def || 0);
                        mp += Number(eqCfg.mp || 0);
                        mpDef += Number(eqCfg.mpdef || 0);
                        cri += Number(eqCfg.cri || 0);
                        mpCri += Number(eqCfg.mp_cri || 0);
                    }
                }
            }
        }

        const bgLv = Number(h.bagate_level || 0);
        if (bgLv > 0 && cfg && cfg.bamen) {
            for (let g = 1; g <= bgLv; g++) {
                const gCfg = cfg.bamen[g];
                if (gCfg) {
                    hp += Number(gCfg.hp || 0);
                    atk += Number(gCfg.atk || 0);
                    def += Number(gCfg.def || 0);
                    mp += Number(gCfg.chak || 0);
                    mpDef += Number(gCfg.chadef || 0);
                }
            }
        }
    }
    if (isNaN(cri)) cri = Number(qty.cri || 0.05);
    if (isNaN(mpCri)) mpCri = Number(qty.mp_cri || 0.05);

    const maxhp = Math.max(Math.floor(hp), Math.floor(Number(h.maxhp || hp)));
    const obj = {
        heroId: hid,
        heroQuality: quality,
        hp: maxhp,
        maxhp: maxhp,
        level: lv,
        physicDmg: Math.max(1, Math.floor(atk)),
        physicDef: Math.max(0, Math.floor(def)),
        mp: 0,
        magicDmg: Math.max(0, Math.floor(mp)),
        magicDef: Math.max(0, Math.floor(mpDef)),
        physicCirt: Number(cri.toFixed(4)),
        magicCirt: Number(mpCri.toFixed(4)),
        has_awake: Number(h.has_awake || 0) ? 1 : 0,
        bagate_level: Number(h.bagate_level || 0),
        skill_1: Math.max(1, Number(h.skill_1_lv || h.skill_1 || lv)),
        skill_2: Math.max(1, Number(h.skill_2_lv || h.skill_2 || lv)),
        skill_3: Math.max(1, Number(h.skill_3_lv || h.skill_3 || Math.max(1, lv - 20))),
        skill_4: Math.max(1, Number(h.skill_4_lv || h.skill_4 || Math.max(1, lv - 40))),
        skill_5: Number(h.skill_5_lv || h.skill_5 || (quality >= 12 ? Math.max(1, lv - 50) : 0)),
        skill_6: Number(h.skill_6_lv || h.skill_6 || 0),
        skill_7: Number(h.skill_7_lv || h.skill_7 || 0),
        skill_8: Number(h.skill_8_lv || h.skill_8 || 0),
        skill_9: Number(h.skill_9_lv || h.skill_9 || 0),
        skill_10: Number(h.skill_10_lv || h.skill_10 || 0),
        skill_11: Math.max(1, Number(h.skill_11_lv || h.skill_11 || 1)),
        skill_12: Math.max(1, Number(h.skill_12_lv || h.skill_12 || 1)),
        sel_tf_skill: Number(h.sel_tf_skill || 0),
        isMonster: 0,
        isBoss: 0
    };
    if (quality >= 12 && obj.skill_5 <= 0) {
        obj.skill_5 = Math.max(1, lv - 50);
    }

    for (let i = 1; i <= 6; i++) {
        const secId = Number(h["secret_" + i + "_id"] || 0);
        const secLv = Number(h["secret_" + i + "_lv"] || 0);
        obj["secret_" + i + "_id"] = (secId > 0 && secLv > 0) ? secId : 0;
        obj["secret_" + i + "_lv"] = (secId > 0 && secLv > 0) ? secLv : 0;

        const sec100Id = Number(h["secret_" + (i + 100) + "_id"] || 0);
        const sec100Lv = Number(h["secret_" + (i + 100) + "_lv"] || 0);
        obj["secret_" + (i + 100) + "_id"] = (sec100Id > 0 && sec100Lv > 0) ? sec100Id : 0;
        obj["secret_" + (i + 100) + "_lv"] = (sec100Id > 0 && sec100Lv > 0) ? sec100Lv : 0;

        const ntId = Number(h["ninja_tool_" + i] || 0);
        const ntValid = ntId > 0 && cfg && cfg.ninja_tool && cfg.ninja_tool[ntId] && cfg.skill && cfg.skill[cfg.ninja_tool[ntId].skill];
        obj["ninja_tool_" + i] = ntValid ? ntId : 0;
    }

    return obj;
}

function runBattleWithModle(ctx, bm, actualSeed, fallbackBmStr) {
    if (ctx.juggler && typeof ctx.juggler.purge === "function") ctx.juggler.purge();
    if (ctx.skillJuggler && typeof ctx.skillJuggler.purge === "function") ctx.skillJuggler.purge();
    if (ctx.departJuggler && typeof ctx.departJuggler.purge === "function") ctx.departJuggler.purge();
    if (ctx.BattleAI && typeof ctx.BattleAI.destroyInstance === "function") ctx.BattleAI.destroyInstance();
    if (ctx.BattleActionGenerater && typeof ctx.BattleActionGenerater.destroyInstance === "function") ctx.BattleActionGenerater.destroyInstance();

    const mgr = ctx.BattleManager.shared();
    mgr.init();
    mgr.openlog = false;
    mgr.beginWithModle(bm, true, actualSeed, null);
    mgr.unscheduleUpdate();
    mgr._runningout = 1;
    mgr.ai.autoFight(true);
    let isbattleended = false;
    let safety = 0;
    while (!isbattleended && safety < 10000) {
        if (ctx.juggler && typeof ctx.juggler.update === "function") ctx.juggler.update(0.016);
        if (ctx.skillJuggler && typeof ctx.skillJuggler.update === "function") ctx.skillJuggler.update(0.016);
        if (ctx.departJuggler && typeof ctx.departJuggler.update === "function") ctx.departJuggler.update(0.016);
        isbattleended = mgr.onProcess();
        safety++;
    }
    if (!isbattleended && !mgr.battleTimeup) {
        mgr.battleEnd();
    } else if (mgr.battleTimeup && (!bm.replaydata || !bm.replaydata.data || !bm.replaydata.data.maxframetime)) {
        mgr.battleEnd();
    }

    const finalReplay = bm.replaydata || mgr.replaydata;
    const rawData = (finalReplay && finalReplay.data) ? finalReplay.data : {};
    const maxframetime = rawData.maxframetime || (mgr._runningout * 16) || 12000;
    const bmOutStr = (finalReplay && finalReplay.modlestr) || fallbackBmStr || ctx.BattleModle.getDataString(bm).join(",");
    console.log("[BattleSim] atk:", bm.attackGroup.length, "def:", bm.defenceGroup.length, "ticks:", safety, "frames:", Object.keys(rawData).length, "maxframetime:", maxframetime, "isWin:", !!bm.result);
    const replayObj = Object.assign({}, rawData, {
        bm: bmOutStr,
        result: !!bm.result,
        seed: actualSeed,
        arena_protocol: 2,
        maxframetime: maxframetime
    });
    return {
        isWin: !!bm.result,
        seed: actualSeed,
        replay: replayObj
    };
}

function simulateBattleFromHeroes(atkHeros, defHeros, seed) {
    const ctx = initSimContext();
    ctx.Config = global.Config || ctx.Config;
    ctx.ConfigGlobalVar = (ctx.Config && ctx.Config.global) || ctx.ConfigGlobalVar || {};

    if (!ctx.UnitGenerater || typeof ctx.UnitGenerater.gen !== "function") {
        throw new Error("UnitGenerater is not initialized in battleSimulator context");
    }

    const atkList = (Array.isArray(atkHeros) && atkHeros.length > 0) ? atkHeros.slice(0, 5) : [{ hid: 10020, lv: 80, quality: 10 }];
    const defList = (Array.isArray(defHeros) && defHeros.length > 0) ? defHeros.slice(0, 5) : [{ hid: 10030, lv: 80, quality: 10 }];
    const actualSeed = (seed !== undefined && seed !== null) ? Number(seed) : Math.floor(Math.random() * 900000) + 100000;

    const bm = new ctx.BattleModle();
    bm.seed = actualSeed;
    bm.attackGroup = [];
    bm.defenceGroup = [];

    for (let i = 0; i < atkList.length; i++) {
        const uObj = buildUnitGeneratorInput(atkList[i], ctx.Config);
        const unit = ctx.UnitGenerater.gen(uObj);
        unit.id = i + 1;
        unit.setCurPosition(ctx.cc.p(0, 0));
        bm.attackGroup.push(unit);
    }

    for (let j = 0; j < defList.length; j++) {
        const uObj = buildUnitGeneratorInput(defList[j], ctx.Config);
        const unit = ctx.UnitGenerater.gen(uObj);
        unit.id = 6 + j;
        unit.setCurPosition(ctx.cc.p(0, 0));
        bm.defenceGroup.push(unit);
    }

    return runBattleWithModle(ctx, bm, actualSeed);
}

function simulateBattleFromBm(bmStr, seed) {
    const ctx = initSimContext();
    ctx.Config = global.Config || ctx.Config;
    ctx.ConfigGlobalVar = (ctx.Config && ctx.Config.global) || ctx.ConfigGlobalVar || {};
    const BattleModleRef = ctx.BattleModle || (ctx.window && ctx.window.BattleModle);
    if (!BattleModleRef || typeof BattleModleRef.getModleFromString !== "function") {
        throw new Error("BattleModle is not initialized in battleSimulator context");
    }
    const bmArr = bmStr.split(",");
    const bm = BattleModleRef.getModleFromString(bmArr);
    const actualSeed = (seed !== undefined && seed !== null) ? Number(seed) : Math.floor(Math.random() * 900000) + 100000;
    bm.seed = actualSeed;

    const ensureGroupHp = (grp) => {
        if (!Array.isArray(grp)) return;
        for (const u of grp) {
            if (u && typeof u.getHp === "function" && u.getHp() <= 0) {
                const maxHp = (typeof u.getMaxHp === "function" && u.getMaxHp() > 0) ? u.getMaxHp() : 100000;
                if (u.hero) u.hero.maxhp = maxHp;
                u.setHp(Math.max(1000, maxHp));
            }
        }
    };
    ensureGroupHp(bm.attackGroup);
    ensureGroupHp(bm.defenceGroup);

    return runBattleWithModle(ctx, bm, actualSeed, bmStr);
}

module.exports = {
    initSimContext,
    simulateBattleFromBm,
    simulateBattleFromHeroes,
    checkAndUpdateBattleEngine
};

const BATTLE_ENGINE_RELS = [
    "utils/SCRandom.js",
    "baseModel/Hero.js",
    "baseModel/Skill.js",
    "baseModel/Equip.js",
    "baseModel/NinjaTool.js",
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
    "modules/battle/MonsterUnitGenerater.js",
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
    const isZlibFlag = buf[3] === 1;
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
    const payload = out.slice(8);
    if (isZlibFlag && payload.length > 6 && payload[4] === 0x78) {
        try {
            return zlib.inflateSync(payload.slice(4));
        } catch (e) { }
    }
    return payload;
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
            const keyJs = "src/" + rel;
            const keyJsc = keyJs + "c";
            const actualKey = assets[keyJs] ? keyJs : (assets[keyJsc] ? keyJsc : null);
            const entry = actualKey ? assets[actualKey] : null;
            if (!entry || !entry.md5) continue;
            if (savedMd5[actualKey] === entry.md5) continue;
            const fileBuf = await fetchBuffer(pkgUrl + actualKey);
            const decBuf = decryptDdsBuffer(fileBuf);
            const outPath = path.join(__dirname, "..", "battle_engine", rel);
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            fs.writeFileSync(outPath, decBuf);
            savedMd5[actualKey] = entry.md5;
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

const _t1 = setTimeout(checkAndUpdateBattleEngine, 5000);
if (_t1.unref) _t1.unref();
const _t2 = setInterval(checkAndUpdateBattleEngine, 30 * 60 * 1000);
if (_t2.unref) _t2.unref();
