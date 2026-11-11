/**
 * Config Loader (Load ConfigData.json, SVRCMD, Cache, OnlineEvents, OnlineLucky)
 */

const fs = require('fs');
const path = require('path');

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
    tower: {}
};

function loadConfigData() {
    const configPath = path.join(__dirname, 'ConfigData.json');
    if (!fs.existsSync(configPath)) {
        console.warn('[-] ConfigData.json not found at', configPath);
        return;
    }
    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const data = JSON.parse(raw);

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

        console.log(`[+] Loaded ConfigData.json (Heroes: ${Object.keys(Config.hero).length}, Items: ${Object.keys(Config.item).length}, Equips: ${Object.keys(Config.equip).length}, Shops: ${Object.keys(Config.shop).length})`);
    } catch (e) {
        console.error('[-] Failed to parse ConfigData.json:', e.message);
    }
}

loadConfigData();

if (typeof global !== 'undefined') {
    global.Config = Config;
    global.ConfigGlobalVar = ConfigGlobalVar;
}

module.exports = {
    Config,
    ConfigGlobalVar,
    loadConfigData
};
