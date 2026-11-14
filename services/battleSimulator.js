// ============================================================================
// HEADLESS BATTLE SIMULATOR (runs client battle logic on Node.js server)
// ============================================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const CLIENT_BATTLE_DIR = path.join(__dirname, "..", "..", "v63_base_clean", "modules", "battle");

let _simContext = null;

function createCcClass() {
    const Class = function () {};
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
        log: function () {},
        warn: function () {},
        error: function () {},
        assert: function (cond, msg) { if (!cond) throw new Error(msg || "Assertion failed"); },
        director: {
            getScheduler: function () {
                return {
                    scheduleUpdateForTarget: function () {},
                    unscheduleUpdateForTarget: function () {}
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
            addListener: function () {},
            removeListenerByDelgate: function () {},
            dispatchEvent: function () {}
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
            getServerTime: function () { return Date.now(); }
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
        AudioManager: { playEffect: function () {} },
        SoundManager: { playEffect: function () {} },
        LANSTR: new Proxy({}, { get: function (_, k) { return String(k); } }),
        clearSkillCacheList: function () {},
        UBYTE_MAX: 256,
        USHORT_MAX: 65536,
        UINT_MAX: 4294967296
    };
    sandbox.window = sandbox;
    sandbox.global = sandbox;

    const ctx = vm.createContext(sandbox);

    const baseModelFiles = [
        path.join(__dirname, "..", "..", "v63_base_clean", "utils", "SCRandom.js"),
        path.join(__dirname, "..", "..", "v63_base_clean", "baseModel", "Hero.js"),
        path.join(__dirname, "..", "..", "v63_base_clean", "baseModel", "Skill.js"),
        path.join(__dirname, "..", "..", "v63_base_clean", "netWork", "PackageReader.js"),
        path.join(__dirname, "..", "..", "v63_base_clean", "netWork", "PackageWriter.js")
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
    const bmArr = bmStr.split(",");
    const bm = ctx.BattleModle.getModleFromString(bmArr);
    const replay = new ctx.ReplayData(bm);
    bm.replaydata = replay;
    bm.seed = seed || Math.floor(Math.random() * 900000) + 100000;

    const mgr = ctx.BattleManager.shared();
    mgr.openlog = false;
    mgr.beginWithModle(bm, null, bm.seed, null);
    mgr.runOutBattle();

    const maxframetime = mgr.runtime || 12000;
    return {
        isWin: !!bm.result,
        replay: {
            bm: bmStr,
            result: !!bm.result,
            seed: bm.seed,
            arena_protocol: 2,
            maxframetime: maxframetime,
            d: replay.data || {}
        }
    };
}

module.exports = {
    initSimContext,
    simulateBattleFromBm
};
