// ============================================================================
// HANDLER: ĐẤU TRƯỜNG, LÔI ĐÀI, TRANH BÁ, THÁP VÔ TẬN, CỨ ĐIỂM & LIÊN SERVER
// (Arena, DarkArena, LimitedArena, Tower, NoEndTower, NinjaFight/Expedition, Treasure/Mining, CrossServer Boss/Arena/DarkArena)
// ============================================================================

class PackageWriter {
    constructor() { this.buf = []; }
    appendByte(v) { this.buf.push(v & 0xFF); }
    appendShort(v) { this.buf.push((v >> 8) & 0xFF, v & 0xFF); }
    appendInt(v) {
        this.buf.push((v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF);
    }
    getPackage() { return this.buf; }
}

function getHeroSkillIds(hid) {
    if (typeof Config !== "undefined" && Config.hero && Config.hero[hid]) {
        var hCfg = Config.hero[hid];
        var sks = [];
        for (var k = 1; k <= 4; k++) {
            var skid = hCfg["skill_id_" + k] || hCfg["skill_" + k];
            if (skid && Config.skill && Config.skill[skid]) {
                sks.push({ id: skid, lv: 80, status: 1 });
            }
        }
        return sks;
    }
    return [];
}

function writeHeroToBuffer(pw, uid, hid) {
    var sks = getHeroSkillIds(hid);
    pw.appendInt(uid);
    pw.appendInt(hid);
    pw.appendInt(100000); // hp
    pw.appendInt(80);     // level
    pw.appendInt(10);     // quality
    pw.appendInt(100000); // maxHp
    pw.appendInt(5000);   // physicDmg
    pw.appendInt(2000);   // physicDef
    pw.appendInt(2000);   // physicCirt * 100
    pw.appendInt(100);    // power
    pw.appendInt(1000);   // maxPower
    pw.appendInt(5000);   // magicDmg
    pw.appendInt(2000);   // magicDef
    pw.appendInt(2000);   // magicCirt * 100
    pw.appendInt(300);    // moveSpeed
    pw.appendInt(150);    // attackRange
    pw.appendInt(100);    // attackSpeed
    pw.appendInt(10);     // powerSpeed
    pw.appendInt(0);      // randomsRec.length
    pw.appendByte(sks.length);
    for (var s = 0; s < sks.length; s++) {
        pw.appendInt(sks[s].id);
        pw.appendInt(sks[s].lv);
        pw.appendInt(sks[s].status);
    }
    pw.appendByte(0);     // has_awake
}

function generateBattleReplayJson(atkHeros, defHeros, isWin, durationSec, seed) {
    var pw = new PackageWriter();
    pw.appendShort(0);
    pw.appendByte(0);
    pw.appendByte(atkHeros.length);
    for (var i = 0; i < atkHeros.length; i++) {
        writeHeroToBuffer(pw, 1000 + i, atkHeros[i]);
    }
    pw.appendByte(defHeros.length);
    for (var j = 0; j < defHeros.length; j++) {
        writeHeroToBuffer(pw, 2000 + j, defHeros[j]);
    }
    pw.appendByte(isWin ? 1 : 0);

    var bmStr = pw.getPackage().join(",");
    var replaySeed = (seed !== undefined && seed !== null) ? Number(seed) : Math.floor(Math.random() * 1000000) + 1;
    var dmgMap = {};
    for (var i = 0; i < atkHeros.length; i++) {
        dmgMap[String(1000 + i)] = isWin ? 50000 : 10000;
    }
    for (var j = 0; j < defHeros.length; j++) {
        dmgMap[String(2000 + j)] = isWin ? 10000 : 50000;
    }
    var replayObj = {
        bm: bmStr,
        result: !!isWin,
        seed: replaySeed,
        arena_protocol: 2,
        maxframetime: (durationSec || 5) * 1000,
        d: dmgMap
    };
    return JSON.stringify(replayObj);
}

const ArenaAndTowerHandler = {
    handleArenaAndTowerCommand: function(cmd, params, respond, queuePush) {
        var self = this;

        if (cmd === SVRCMD.BeforeNoEndTowerFight) {
            var diff = Number((params && params[1]) || 10);
            this.data.last_noend_diff = diff;
            respond({ sign: "NOEND_" + diff, seed: 123456789, difficulty: diff });
            return true;
        }

        // 1. Tháp Mất Tích & Tháp Vô Tận (LostTowerView.js, NOEndTowerView.js)
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
                var enemyIds = [10020, 10040, 10250];
                var enemyHeros = [];
                var enemyName = "Thủ Vệ Tầng " + reqLayer;
                var enemyIcon = 80110020;
                var enemyLv = Math.max(10, reqLayer * 3);

                // Nếu là Tầng 1: Lấy thông tin người chơi top Đấu Trường, nếu không có lấy bot
                if (reqLayer === 1) {
                    var topPlayer = null;
                    if (typeof playerDb !== "undefined") {
                        for (var pk in playerDb) {
                            var pd = playerDb[pk];
                            if (pd && Number(pd.uid) !== this.getNumericId() && pd.heros && Object.keys(pd.heros).length > 0) {
                                topPlayer = pd;
                                break;
                            }
                        }
                    }
                    if (topPlayer) {
                        enemyName = topPlayer.team_name || "Vô Địch Lôi Đài";
                        enemyIcon = Number(topPlayer.icon || 80110020);
                        enemyLv = Number(topPlayer.team_lv || 60);
                        var hKeys = Object.keys(topPlayer.heros).slice(0, 5);
                        for (var hi = 0; hi < hKeys.length; hi++) {
                            enemyHeros.push(this.computeHeroPayload(hKeys[hi]));
                        }
                    }
                }

                if (enemyHeros.length === 0) {
                    var candidatePool = [10020, 10030, 10040, 10050, 10010, 10060, 10070, 10080, 10090, 10100, 10110, 10120, 10130, 10140, 10150];
                    var shift = ((reqLayer - 1) * 3) % candidatePool.length;
                    for (var ei = 0; ei < 5; ei++) {
                        var ehId = candidatePool[(shift + ei) % candidatePool.length];
                        var eh = this.createDefaultHeroRecord(ehId);
                        eh.lv = Math.min(100, Math.max(10, reqLayer * 3));
                        eh.level = eh.lv;
                        eh.quality = Math.min(15, 1 + Math.floor(reqLayer / 3));
                        eh.hp = 2000 + reqLayer * 800;
                        eh.maxhp = eh.hp;
                        eh.atk = 200 + reqLayer * 60;
                        eh.def = 80 + reqLayer * 25;
                        eh.mp = 150 + reqLayer * 40;
                        eh.mp_def = 80 + reqLayer * 25;
                        eh.cri = 10;
                        eh.mp_cri = 10;
                        eh.power = 0;
                        enemyHeros.push(eh);
                    }
                }

                this.data.tower_layers[reqLayer] = {
                    player_id: this.getNumericId(),
                    layer: reqLayer,
                    has_pass: 0,
                    player_icon: enemyIcon,
                    player_lv: enemyLv,
                    player_name: enemyName,
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
                    player_id: this.getNumericId(),
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
            if (!this.data.tower_layers) this.data.tower_layers = {};
            if (!this.data.tower_layers[curLayer]) {
                this.data.tower_layers[curLayer] = { layer: curLayer };
            }
            var curLData = this.data.tower_layers[curLayer];
            curLData.has_pass = 1;

            // Thiết lập 4 rương quà hợp lệ từ Config.box_drop nếu chưa có
            var pickDrop = function(boxId, defaultItem) {
                if (typeof Config !== "undefined" && Config.box_drop && Config.box_drop[boxId]) {
                    var pool = Object.keys(Config.box_drop[boxId]);
                    if (pool.length > 0) {
                        return Number(pool[Math.floor(Math.random() * pool.length)]);
                    }
                }
                return defaultItem;
            };

            if (!curLData.box_1_id || curLData.box_1_id === 0) curLData.box_1_id = pickDrop(82001, 80101);
            if (!curLData.box_2_id || curLData.box_2_id === 0) curLData.box_2_id = pickDrop(82002, 80201);
            if (!curLData.box_3_id || curLData.box_3_id === 0) curLData.box_3_id = pickDrop(82003, 80301);
            if (!curLData.box_4_id || curLData.box_4_id === 0) curLData.box_4_id = pickDrop(82003, 80302);

            // Chuẩn bị tầng tiếp theo với đội hình thủ vệ hoàn chỉnh (không để trống heros)
            if (curLayer < 35) {
                var nextLayer = curLayer + 1;
                if (!this.data.tower_layers[nextLayer] || this.data.tower_layers[nextLayer].heros === "[]") {
                    var candidatePool = [10020, 10030, 10040, 10050, 10010, 10060, 10070, 10080, 10090, 10100, 10110, 10120, 10130, 10140, 10150];
                    var nextHeros = [];
                    var shift = ((nextLayer - 1) * 3) % candidatePool.length;
                    for (var ei = 0; ei < 5; ei++) {
                        var ehId = candidatePool[(shift + ei) % candidatePool.length];
                        var eh = this.createDefaultHeroRecord(ehId);
                        eh.lv = Math.min(100, Math.max(10, nextLayer * 3));
                        eh.level = eh.lv;
                        eh.quality = Math.min(15, 1 + Math.floor(nextLayer / 3));
                        eh.hp = 2000 + nextLayer * 800;
                        eh.maxhp = eh.hp;
                        eh.atk = 200 + nextLayer * 60;
                        eh.def = 80 + nextLayer * 25;
                        eh.mp = 150 + nextLayer * 40;
                        eh.mp_def = 80 + nextLayer * 25;
                        eh.cri = 10;
                        eh.mp_cri = 10;
                        eh.power = 0;
                        nextHeros.push(eh);
                    }
                    this.data.tower_layers[nextLayer] = {
                        player_id: this.getNumericId(),
                        layer: nextLayer,
                        has_pass: 0,
                        player_icon: 80110020,
                        player_lv: Math.max(10, nextLayer * 3),
                        player_name: "Thủ Vệ Tầng " + nextLayer,
                        box_1_id: 0,
                        box_2_id: 0,
                        box_3_id: 0,
                        box_4_id: 0,
                        heros: JSON.stringify(nextHeros)
                    };
                }
            }

            this.data.daily_counts["PLAYER_DIALY_TASK_9"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_9"] || 0) + 1;
            this.save();
            respond({ status: 1 });
            return true;
        }

        if (cmd === SVRCMD.OpenTowerBox) {
            var targetLayer = Number((params && params[0]) || this.data.tower_cur_layer || 1);
            if (!this.data.tower_layers) this.data.tower_layers = {};
            if (!this.data.tower_layers[targetLayer]) {
                var candidatePool = [10020, 10030, 10040, 10050, 10010];
                var enemyHeros = [];
                for (var ei = 0; ei < candidatePool.length; ei++) {
                    enemyHeros.push({
                        id: candidatePool[ei],
                        hero_id: candidatePool[ei],
                        lv: Math.min(100, 30 + targetLayer * 2),
                        quality: Math.min(13, 7 + Math.floor(targetLayer / 5))
                    });
                }
                this.data.tower_layers[targetLayer] = {
                    player_id: this.getNumericId(),
                    layer: targetLayer,
                    has_pass: 1,
                    player_name: "Thủ Vệ Tầng " + targetLayer,
                    player_lv: Math.min(100, 40 + targetLayer * 2),
                    player_icon: 80110010,
                    box_1_id: 80101,
                    box_2_id: 80201,
                    box_3_id: 80301,
                    box_4_id: 80302,
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
                chosenKey = 80101;
                boxIndex = 1;
            }
            lData["box_" + boxIndex + "_id"] = 0;

            // Cập nhật tower_cur_layer khi mở quà
            if (this.data.tower_cur_layer < 35 && this.data.tower_cur_layer <= targetLayer) {
                this.data.tower_cur_layer = targetLayer + 1;
            }

            var bdItem = (typeof Config !== "undefined" && Config.box_drop_item && Config.box_drop_item[chosenKey]) ? Config.box_drop_item[chosenKey] : null;
            var itemData = null;
            if (bdItem) {
                var granted = this.grantBoxDropReward(bdItem, queuePush);
                itemData = granted || {
                    type: Number(bdItem.type || 1),
                    item_id: Number(bdItem.item_id || 10030),
                    amount: Math.max(1, Number(bdItem.amount || 2))
                };
            } else {
                itemData = { type: 1, item_id: 10030, amount: 10 };
                this.changeItemAmount(10030, 10, queuePush);
            }
            this.save();

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
                nt.status = 1;
            }
            this.data.daily_counts["PLAYER_DIALY_TASK_20"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_20"] || 0) + 1;
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
                this.data.daily_counts["PLAYER_DIALY_TASK_20"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_20"] || 0) + 1;
            } else {
                nt.status = 0;
            }
            this.addGold(100000, queuePush);
            this.changeItemAmount(10030, 10, queuePush);
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

        // 2. Tranh Bá Nhẫn Giới (ExpeditionMain.js -> NinjaFight*)
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
            // params: [signCode, is_win, hero_obj, npc_obj, hire_obj]
            // hero_obj (params[2]): player's heroes HP & Power
            var playerHeroes = (params && (params[2] || (params[3] && !params[2] ? params[3] : null))) || null;
            if (playerHeroes && typeof playerHeroes === "object") {
                var currentHeroInfo = {};
                try {
                    if (this.data.expedition_hero_info) {
                        currentHeroInfo = JSON.parse(this.data.expedition_hero_info) || {};
                    }
                } catch (e) {
                    currentHeroInfo = {};
                }
                for (var hid in playerHeroes) {
                    var h = playerHeroes[hid];
                    if (h && typeof h === "object") {
                        currentHeroInfo[hid] = {
                            id: Number(h.id || hid),
                            hp: Math.max(0, Math.floor(Number(h.hp || 0))),
                            power: Math.max(0, Math.floor(Number(h.power || 0)))
                        };
                    }
                }
                this.data.expedition_hero_info = JSON.stringify(currentHeroInfo);
            }
            if (isWin) {
                this.data.expedition_wave = Math.min(maxWaves + 1, Number(this.data.expedition_wave || 1) + 1);
                this.addTeamExp(20);
                this.data.daily_counts["PLAYER_DIALY_TASK_11"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_11"] || 0) + 1;
            }
            this.save();
            respond({ is_win: isWin ? 1 : 0 });
            return true;
        }

        if (cmd === SVRCMD.OpenNinjaFightBox || cmd === SVRCMD.SweepNinja) {
            var curDiff = Number(this.data.expedition_diff || 1);
            var waveIdx = Number((params && params[0]) || 1);
            if (!this.data.expedition_picked) this.data.expedition_picked = {};
            this.data.expedition_picked[waveIdx] = 1;
            if (cmd === SVRCMD.SweepNinja) {
                this.data.daily_counts["PLAYER_DIALY_TASK_11"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_11"] || 0) + 1;
            }

            if (curDiff === 4) {
                respond({ items: [] });
                return true;
            }

            var goldGain = 150000 * waveIdx;
            this.addGold(goldGain, queuePush);
            var dropEquip = 20000 + waveIdx;
            this.changeEquipAmount(dropEquip, 3, queuePush);
            this.addCurrency(11, 500 * waveIdx, queuePush);
            this.changeItemAmount(50040, 500 * waveIdx, queuePush);
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
                return respond({}, { code: 1, msg: "Không đủ Kim Cương để làm mới Tranh Bá!" }), true;
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

        // 3. Đấu Trường Giới Hạn (LimitedArena*)
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
            this.changeItemAmount(10150, 50, queuePush);
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
                    { rank: 1, fighter_id: this.getNumericId(), player_id: this.getNumericId(), player_name: this.data.team_name || "Nhẫn Giả", player_lv: Number(this.data.team_lv || 1), icon: Number(this.data.icon || 80110070), fight_value: 15000, win_count: 5, def_heros: botDef }
                ],
                history: []
            });
            return true;
        }

        // 4. Đấu Trường & Lôi Đài Ám Bộ (ArenaInfo, DarkArenaInfo, MatchFighters, ArenaFight, etc.)
        if (cmd === SVRCMD.ArenaInfo) {
            var myHerosArr = [];
            for (var hid in this.data.heros) {
                myHerosArr.push(this.computeHeroPayload(hid));
                if (myHerosArr.length >= 5) break;
            }
            respond({
                rank: {
                    rank: Number(this.data.arena_rank || 10),
                    icon: Number(this.data.icon || 80110070),
                    win_count: 15,
                    player_lv: Number(this.data.team_lv || 1),
                    player_name: this.data.team_name || "Nhẫn Giả",
                    player_id: this.getNumericId(),
                    fighter_id: this.getNumericId(),
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
            var isDark = (cmd === SVRCMD.MatcDarkhFighters);
            var myRank = Number(isDark ? (this.data.dark_arena_rank || 100) : (this.data.arena_rank || 50));
            var botHero1 = this.createDefaultHeroRecord(10020);
            var botHero2 = this.createDefaultHeroRecord(10040);
            var botHero3 = this.createDefaultHeroRecord(10070);
            var botHero4 = this.createDefaultHeroRecord(10010);
            var botHero5 = this.createDefaultHeroRecord(10030);
            var defStr = JSON.stringify([botHero1, botHero2, botHero3, botHero4, botHero5]);

            var r1, r2, r3;
            if (myRank === 1) {
                // Người chơi đang ở Top 1 -> hiển thị các đối thủ hạng 2, 3, 4 để khiêu chiến
                r1 = 2;
                r2 = 3;
                r3 = 4;
            } else if (myRank === 2) {
                r1 = 1;
                r2 = 3;
                r3 = 4;
            } else if (myRank === 3) {
                r1 = 1;
                r2 = 2;
                r3 = 4;
            } else {
                r1 = Math.max(1, myRank - 15);
                r2 = Math.max(1, myRank - 8);
                r3 = Math.max(1, myRank - 3);
            }

            var f1 = { rank: r1, icon: 30610460, win_count: 50, player_lv: 85, player_name: "Kakashi Hatake", player_id: 101, fighter_id: 101, fight_value: 696039, server_id: 1, def_heros: defStr, def_heros_1: defStr, def_heros_2: defStr, def_heros_3: defStr };
            var f2 = { rank: r2, icon: 80110020, win_count: 30, player_lv: 80, player_name: "Naruto Uzumaki", player_id: 102, fighter_id: 102, fight_value: 580000, server_id: 1, def_heros: defStr, def_heros_1: defStr, def_heros_2: defStr, def_heros_3: defStr };
            var f3 = { rank: r3, icon: 80110040, win_count: 10, player_lv: 75, player_name: "Sakura Haruno", player_id: 103, fighter_id: 103, fight_value: 450000, server_id: 1, def_heros: defStr, def_heros_1: defStr, def_heros_2: defStr, def_heros_3: defStr };

            if (isDark) {
                respond([f1, f2, f3]);
            } else {
                var respObj = {};
                respObj[String(r1)] = f1;
                respObj[String(r2)] = f2;
                respObj[String(r3)] = f3;
                respond(respObj);
            }
            return true;
        }

        if (cmd === SVRCMD.PlayerArenaInfo || cmd === SVRCMD.PlayerDarkArenaInfo) {
            var fId = Number((params && params[0]) || 101);
            var defArr1 = [this.createDefaultHeroRecord(10020), this.createDefaultHeroRecord(10040), this.createDefaultHeroRecord(10070), this.createDefaultHeroRecord(10010), this.createDefaultHeroRecord(10030)];
            var defArr2 = [this.createDefaultHeroRecord(10110), this.createDefaultHeroRecord(10120), this.createDefaultHeroRecord(10140), this.createDefaultHeroRecord(10150), this.createDefaultHeroRecord(10160)];
            var defArr3 = [this.createDefaultHeroRecord(10280), this.createDefaultHeroRecord(10290), this.createDefaultHeroRecord(10310), this.createDefaultHeroRecord(10320), this.createDefaultHeroRecord(10330)];
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
                def_heros: JSON.stringify(defArr1),
                def_heros_1: JSON.stringify(defArr1),
                def_heros_2: JSON.stringify(defArr2),
                def_heros_3: JSON.stringify(defArr3)
            });
            return true;
        }

        if (cmd === SVRCMD.SetArenaLineup || cmd === SVRCMD.SetDarkArenaLineup || cmd === SVRCMD.ClearArenaFightCD || cmd === SVRCMD.ClearDarkArenaFightCD || cmd === SVRCMD.BuyArenaFightNum || cmd === SVRCMD.BuyDarkArenaFightNum) {
            if (cmd === SVRCMD.SetArenaLineup) {
                if (params && params[1]) this.data.arena_lineup = String(params[1]);
                this.save();
            } else if (cmd === SVRCMD.SetDarkArenaLineup) {
                if (params && params[1]) this.data.dark_arena_lineup_1 = String(params[1]);
                if (params && params[2]) this.data.dark_arena_lineup_2 = String(params[2]);
                if (params && params[3]) this.data.dark_arena_lineup_3 = String(params[3]);
                this.save();
            }
            respond({ status: 1 });
            return true;
        }

        if (cmd === SVRCMD.ArenaFight || cmd === SVRCMD.DarkArenaFight) {
            var targetFighterId = Number((params && params[0]) || 101);
            var reqId = (params && params[4]) ? String(params[4]) : "";
            this.addStone(100, queuePush);
            this.addCurrency(10, 200, queuePush);
            if (cmd === SVRCMD.DarkArenaFight) {
                var curRank = Number(this.data.dark_arena_rank || 100);
                var newRank = Math.max(1, curRank - 1);
                this.data.dark_arena_rank = newRank;
                this.data.total_dark_arena_fights = Number(this.data.total_dark_arena_fights || 0) + 1;
                this.data.dark_arena_win_count = Number(this.data.dark_arena_win_count || 0) + 1;
                var myHeroIds = Object.keys(this.data.heros || {}).map(Number);
                if (myHeroIds.length === 0) myHeroIds = [10010, 10020, 10030, 10040, 10050];
                var fData1 = generateBattleReplayJson(myHeroIds.slice(0, 5), [10020, 10040, 10070], true, 6, 1001);
                var fData2 = generateBattleReplayJson(myHeroIds.slice(5, 10), [10010, 10030, 10080], true, 6, 1002);
                var fData3 = generateBattleReplayJson(myHeroIds.slice(10, 15), [10110, 10120, 10140], true, 6, 1003);
                this.data.daily_counts["PLAYER_DIALY_TASK_8"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_8"] || 0) + 1;
                this.save();
                respond({
                    useZip: false,
                    isWin: 1,
                    rank: newRank,
                    fightData1: fData1,
                    fightData2: fData2,
                    fightData3: fData3,
                    settled: true,
                    reward: { gold: 50000, stone: 100 }
                });
                return true;
            } else {
                var curRank = Number(this.data.arena_rank || 50);
                var newRank = Math.max(1, curRank - 1);
                this.data.arena_rank = newRank;
                this.data.total_arena_fights = Number(this.data.total_arena_fights || 0) + 1;
                var myHeroIds = Object.keys(this.data.heros || {}).map(Number);
                if (myHeroIds.length === 0) myHeroIds = [10010, 10020, 10030, 10040, 10050];
                var fightSeed = Math.floor(Math.random() * 900000) + 100000;
                var fData = generateBattleReplayJson(myHeroIds.slice(0, 5), [10020, 10040, 10070], true, 6, fightSeed);
                this.data.daily_counts["PLAYER_DIALY_TASK_8"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_8"] || 0) + 1;
                this.save();
                respond({
                    skipReply: false,
                    isWin: 1,
                    arena_request_id: reqId,
                    seed: fightSeed,
                    fight_data: fData,
                    rank: newRank,
                    settled: true,
                    reward: { gold: 50000, stone: 100 }
                });
                return true;
            }
        }

        if (cmd === SVRCMD.ArenaFightReport || cmd === SVRCMD.DarkArenaFightReport) {
            this.addStone(100, queuePush);
            this.addCurrency(10, 200, queuePush);
            var isWin = (params && params[1] !== undefined) ? Number(params[1]) : 1;
            respond({
                status: 1,
                isWin: isWin,
                rankChange: 1,
                bestRankChange: 1,
                stone: 100,
                reward: { gold: 50000, stone: 100 }
            });
            return true;
        }

        if (cmd === "DarkArenaFightHistoryInfo") {
            respond({ history: { fight_data: "{}" } });
            return true;
        }

        if (cmd === SVRCMD.ArenaRank || cmd === SVRCMD.DarkArenaRank) {
            var myRank = Number(cmd === SVRCMD.DarkArenaRank ? (this.data.dark_arena_rank || 100) : (this.data.arena_rank || 50));
            var botHero1 = this.createDefaultHeroRecord(10020);
            var botHero2 = this.createDefaultHeroRecord(10040);
            var botHero3 = this.createDefaultHeroRecord(10070);
            var defStr = JSON.stringify([botHero1, botHero2, botHero3]);
            if (cmd === SVRCMD.ArenaRank) {
                var ranksObj = {
                    "1": { fighter_id: 18, player_id: 18, player_name: "Boo", player_lv: 102, icon: 4011040, rank: 1, win_count: 100, fight_value: 1200000, def_heros: defStr },
                    "2": { fighter_id: 38, player_id: 38, player_name: "Bá Khí", player_lv: 100, icon: 80110050, rank: 2, win_count: 85, fight_value: 1100000, def_heros: defStr },
                    "3": { fighter_id: 55, player_id: 55, player_name: "Itachi", player_lv: 98, icon: 9010710, rank: 3, win_count: 70, fight_value: 950000, def_heros: defStr }
                };
                if (myRank > 3) {
                    ranksObj[String(myRank)] = {
                        fighter_id: this.getNumericId(),
                        player_id: this.getNumericId(),
                        player_name: this.data.team_name || "Nhẫn Giả",
                        player_lv: Number(this.data.team_lv || 1),
                        icon: Number(this.data.icon || 2010080),
                        rank: myRank,
                        win_count: Number(this.data.arena_win_count || 10),
                        fight_value: 500000,
                        def_heros: defStr
                    };
                }
                respond({ ranks: ranksObj, logs: [] });
            } else {
                var topRanks = [
                    { fighter_id: 18, player_id: 18, player_name: "Boo", player_lv: 102, icon: 4011040, rank: 1 },
                    { fighter_id: 38, player_id: 38, player_name: "Bá Khí", player_lv: 100, icon: 80110050, rank: 2 },
                    { fighter_id: this.getNumericId(), player_id: this.getNumericId(), player_name: this.data.team_name || "Nhẫn Giả", player_lv: Number(this.data.team_lv || 1), icon: Number(this.data.icon || 2010080), rank: myRank }
                ];
                respond({ ranks: topRanks, logs: [] });
            }
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
                        atk_id: this.getNumericId(),
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
            var myHeroIds = Object.keys(this.data.heros || {}).map(Number);
            myHeroIds.sort(function(a, b) {
                var ha = self.data.heros[a];
                var hb = self.data.heros[b];
                var pwa = Number((ha && ha.power) || (ha && ha.level * 100) || 0);
                var pwb = Number((hb && hb.power) || (hb && hb.level * 100) || 0);
                return pwb - pwa;
            });
            var top15 = myHeroIds.slice(0, 15);
            var f1 = [], f2 = [], f3 = [];
            if (this.data.dark_arena_lineup_1) {
                f1 = this.data.dark_arena_lineup_1.split(",").map(Number).filter(Boolean);
            }
            if (this.data.dark_arena_lineup_2) {
                f2 = this.data.dark_arena_lineup_2.split(",").map(Number).filter(Boolean);
            }
            if (this.data.dark_arena_lineup_3) {
                f3 = this.data.dark_arena_lineup_3.split(",").map(Number).filter(Boolean);
            }
            if (f1.length === 0 && f2.length === 0 && f3.length === 0) {
                f1 = top15.slice(0, 5);
                f2 = top15.slice(5, 10);
                f3 = top15.slice(10, 15);
                this.data.dark_arena_lineup_1 = f1.join(",");
                this.data.dark_arena_lineup_2 = f2.join(",");
                this.data.dark_arena_lineup_3 = f3.join(",");
                this.save();
            }
            var defHeros1 = f1.map(function(hid) { return self.computeHeroPayload(hid); });
            var defHeros2 = f2.map(function(hid) { return self.computeHeroPayload(hid); });
            var defHeros3 = f3.map(function(hid) { return self.computeHeroPayload(hid); });

            var nowSec = Math.floor(Date.now() / 1000);
            var lastTime = Number(this.data.dark_arena_last_point_time || nowSec);
            var elapsedHours = Math.max(0, (nowSec - lastTime) / 3600);
            var hourPt = 50;
            var accumulated = Number(this.data.dark_arena_accumulated_point || 0) + Math.floor(elapsedHours * hourPt);
            this.data.dark_arena_accumulated_point = accumulated;
            this.data.dark_arena_last_point_time = nowSec;

            respond({
                rank: {
                    rank: Number(this.data.dark_arena_rank || 10),
                    icon: Number(this.data.icon || 80110070),
                    win_count: Number(this.data.dark_arena_win_count || 10),
                    player_lv: Number(this.data.team_lv || 1),
                    player_name: this.data.team_name || "Nhẫn Giả",
                    player_id: this.getNumericId(),
                    fighter_id: this.getNumericId(),
                    fight_value: 5000,
                    server_id: 1,
                    def_heros_1: JSON.stringify(defHeros1),
                    def_heros_2: JSON.stringify(defHeros2),
                    def_heros_3: JSON.stringify(defHeros3)
                },
                fightCount: Number(this.data.dark_arena_fight_count || 0),
                lastFightTime: Number(this.data.dark_arena_last_fight_time || 0),
                hour_point: hourPt,
                total_point: accumulated
            });
            return true;
        }

        if (cmd === SVRCMD.ReceiceDarkArenaRecordPoint) {
            var pts = Number(this.data.dark_arena_accumulated_point || 0);
            if (pts > 0) {
                this.addCurrency(13, pts, queuePush);
                this.data.dark_arena_accumulated_point = 0;
                this.save();
                respond({ point: pts, status: 1, total_point: 0 });
            } else {
                respond({ point: 0, status: 1, total_point: 0 });
            }
            return true;
        }

        // 5. Cứ Điểm Khai Khoáng (DugTreasure, SearchTreasure, ReviceTreasure, Plunder)
        if (cmd === SVRCMD.GetTreasureDropMulti) {
            respond({ mulit: 0, multi: 0 });
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
                player_id: this.getNumericId(),
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
            this.data.daily_counts["PLAYER_DIALY_TASK_16"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_16"] || 0) + 1;
            this.save();
            respond({ treasure: newTreasure });
            return true;
        }

        if (cmd === SVRCMD.SearchTreasure) {
            var nowSec = Math.floor(Date.now() / 1000);
            var myUid = this.getNumericId();
            var targetMine = null;

            // Tìm một người chơi khác đang chiếm cứ điểm khai thác (không lấy bản thân)
            if (typeof playerDb !== "undefined") {
                for (var pKey in playerDb) {
                    var pData = playerDb[pKey];
                    if (pData && Number(pData.uid) !== myUid && Array.isArray(pData.treasures) && pData.treasures.length > 0) {
                        for (var ti = 0; ti < pData.treasures.length; ti++) {
                            var tr = pData.treasures[ti];
                            if (tr && tr.status === 1) {
                                targetMine = {
                                    id: tr.id || 1,
                                    status: 1,
                                    types: tr.types || 1,
                                    can_pick: 0,
                                    has_pick: 0,
                                    hero_ids: tr.hero_ids || "10020,10040,10250",
                                    player_id: Number(pData.uid || 201),
                                    player_lv: Number(pData.team_lv || 50),
                                    player_name: pData.team_name || "Nhẫn Giả",
                                    player_icon: Number(pData.icon || 10020),
                                    fight_value: tr.fight_value || 6000,
                                    create_time: tr.create_time || (nowSec - 1800),
                                    plunder_time: nowSec + 10800,
                                    robbed_at: 0,
                                    is_plundered: 0,
                                    heros: tr.heros || "[]"
                                };
                                break;
                            }
                        }
                    }
                    if (targetMine) break;
                }
            }

            // Nếu không có người chơi nào chiếm thì sinh Bot chiếm giữ cứ điểm
            if (!targetMine) {
                var oppId = 200 + Math.floor(Math.random() * 50);
                var botNames = ["Uchiha Shisui", "Hidan", "Kakuzu", "Deidara", "Sasori", "Kisame"];
                var randomName = botNames[Math.floor(Math.random() * botNames.length)];
                targetMine = {
                    id: Math.floor(Math.random() * 10) + 1,
                    status: 1,
                    types: Math.floor(Math.random() * 3) + 1,
                    can_pick: 0,
                    has_pick: 0,
                    hero_ids: "10020,10040,10250,10070,10120",
                    player_id: oppId,
                    player_lv: Math.min(100, Math.max(30, Number(this.data.team_lv || 40))),
                    player_name: randomName,
                    player_icon: 10020,
                    fight_value: 4500 + Math.floor(Math.random() * 2000),
                    create_time: nowSec - 3600,
                    plunder_time: nowSec + 10800,
                    robbed_at: 0,
                    is_plundered: 0,
                    heros: "[]"
                };
            }

            respond({ treasure: targetMine });
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
            this.addGold(50000, queuePush);
            this.data.total_plunder_count = Number(this.data.total_plunder_count || 0) + 1;
            this.save();
            respond({
                tg_num: 5,
                awardedItemIds: [60010, 10210, 40010],
                gold: 50000,
                items: lootItems,
                itemBalances: lootItems.map(function(it) {
                    var curCnt = self.getItemAmount(it.item_id);
                    return { id: it.item_id, item_id: it.item_id, count: curCnt, amount: curCnt };
                })
            });
            return true;
        }

        if (cmd === SVRCMD.PlunderHistorys) {
            respond({ historys: [] });
            return true;
        }

        if (cmd === SVRCMD.ReviceTreasure) {
            var addGold = 140000;
            var addDiamond = 60;
            this.addGold(addGold, queuePush);
            this.addStone(addDiamond, queuePush);
            this.changeItemAmount(40010, 20, queuePush);
            this.changeItemAmount(10210, 10, queuePush);
            this.changeItemAmount(60010, 100, queuePush);
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
                    { id: 40010, item_id: 40010, count: this.getItemAmount(40010) },
                    { id: 10210, item_id: 10210, count: this.getItemAmount(10210) },
                    { id: 60010, item_id: 60010, count: this.getItemAmount(60010) }
                ]
            });
            return true;
        }

        if (cmd === "HeroRecall" || cmd === "ResetTreasureLinneup" || cmd === SVRCMD.HeroRecall || cmd === SVRCMD.ResetTreasureLinneup) {
            respond({ status: 1 });
            return true;
        }

        // 6. Liên Server (CrossServerStatus, CrossBoss*, CrossArena*, CrossDarkArena*)
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
            this.addGold(200000, queuePush);

            var atkHeroIds = lineupStr.split(",").map(Number).filter(Boolean);
            if (atkHeroIds.length === 0) atkHeroIds = [11060, 11000, 10510, 10650, 10710];
            var bossDefIds = [11060, 11000, 10510];
            var fData = generateBattleReplayJson(atkHeroIds, bossDefIds, true, 8);

            respond({
                useZip: false,
                damage: battleDmg,
                rank: 1,
                total_damage: this.data.cross_boss_damage,
                fightData: fData
            });
            return true;
        }

        if (cmd === SVRCMD.CrossBossRank || cmd === "CrossBossRank") {
            respond({
                ranks: [
                    { rank: 1, player_id: this.getNumericId(), player_name: this.data.team_name || "Nhẫn Giả", server_id: 1, icon: 30610141, total_damage: Number(this.data.cross_boss_damage || 134891733), team_lv: Number(this.data.team_lv || 100) },
                    { rank: 2, player_id: 2, player_name: "Chú thợ Điện", server_id: 1, icon: 81110901, total_damage: 125000000, team_lv: 95 },
                    { rank: 3, player_id: 3, player_name: "Sasuke Uchiha", server_id: 2, icon: 10020, total_damage: 110000000, team_lv: 92 }
                ],
                my_rank: 1,
                my_damage: Number(this.data.cross_boss_damage || 134891733)
            });
            return true;
        }

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

        if (cmd === SVRCMD.CrossArenaRank || cmd === "CrossArenaRank" || cmd === "CrossArenaAllRankInfo" || cmd === SVRCMD.CrossArenaAllRankInfo) {
            if (cmd === "CrossArenaAllRankInfo" || cmd === SVRCMD.CrossArenaAllRankInfo) {
                var pLv = Number(this.data.team_lv || 1);
                var minLv = Math.max(1, Math.floor(pLv / 10) * 10);
                var maxLv = minLv + 9;
                var myScore = Number(this.data.cross_arena_score || 1600);
                var allGroupInfo = {
                    my_info: {
                        cur_rank: Number(this.data.cross_arena_rank || 1),
                        lv: 1,
                        min_lv: minLv,
                        max_lv: maxLv,
                        hour_point: 50,
                        total_point: myScore
                    },
                    "1": {
                        lv: 1,
                        min_lv: minLv,
                        max_lv: maxLv,
                        data: {
                            icon: 10020,
                            player_name: this.data.team_name || "Nhẫn Giả",
                            server_id: 1
                        }
                    },
                    "2": {
                        lv: 2,
                        min_lv: 50,
                        max_lv: 69,
                        data: {
                            icon: 11060,
                            player_name: "Madara Uchiha",
                            server_id: 2
                        }
                    },
                    "3": {
                        lv: 3,
                        min_lv: 70,
                        max_lv: 89,
                        data: {
                            icon: 11000,
                            player_name: "Hashirama Senju",
                            server_id: 1
                        }
                    },
                    "4": {
                        lv: 4,
                        min_lv: 90,
                        max_lv: 100,
                        data: {
                            icon: 10710,
                            player_name: "Minato Namikaze",
                            server_id: 3
                        }
                    }
                };
                respond(allGroupInfo);
                return true;
            }

            respond({
                ranks: [
                    { rank: 1, player_id: this.getNumericId(), player_name: this.data.team_name || "Nhẫn Giả", server_id: 1, icon: 10020, score: 2400, team_lv: Number(this.data.team_lv || 100) },
                    { rank: 2, player_id: 4520, player_name: "Madara", server_id: 2, icon: 11060, score: 2350, team_lv: 99 },
                    { rank: 3, player_id: 4521, player_name: "Hashirama", server_id: 1, icon: 11000, score: 2300, team_lv: 98 }
                ]
            });
            return true;
        }

        if (cmd === "CrossMatchArenaFighters" || cmd === SVRCMD.CrossMatchArenaFighters) {
            var defHerosJson1 = JSON.stringify([this.createDefaultHeroRecord(11060), this.createDefaultHeroRecord(11000), this.createDefaultHeroRecord(10510)]);
            var defHerosJson2 = JSON.stringify([this.createDefaultHeroRecord(10650), this.createDefaultHeroRecord(10710), this.createDefaultHeroRecord(10020)]);
            var defHerosJson3 = JSON.stringify([this.createDefaultHeroRecord(10010), this.createDefaultHeroRecord(10030), this.createDefaultHeroRecord(10040)]);
            respond([
                { player_id: 4520, fighter_id: 4520, player_name: "Madara Uchiha", server_id: 2, rank: 2, score: 2350, icon: 11060, team_lv: 99, power: 1500000, fight_value: 1500000, def_heros_1: defHerosJson1, def_heros_2: defHerosJson2, def_heros_3: defHerosJson3 },
                { player_id: 4521, fighter_id: 4521, player_name: "Hashirama Senju", server_id: 1, rank: 3, score: 2300, icon: 11000, team_lv: 98, power: 1450000, fight_value: 1450000, def_heros_1: defHerosJson1, def_heros_2: defHerosJson2, def_heros_3: defHerosJson3 },
                { player_id: 4522, fighter_id: 4522, player_name: "Minato Namikaze", server_id: 3, rank: 4, score: 2250, icon: 10710, team_lv: 97, power: 1400000, fight_value: 1400000, def_heros_1: defHerosJson1, def_heros_2: defHerosJson2, def_heros_3: defHerosJson3 }
            ]);
            return true;
        }

        if (cmd === "CrossPlayerArenaInfo" || cmd === SVRCMD.CrossPlayerArenaInfo) {
            var targetPid = Number((params && params[2]) || (params && params[0]) || 4520);
            var defHerosJson1 = JSON.stringify([this.createDefaultHeroRecord(11060), this.createDefaultHeroRecord(11000), this.createDefaultHeroRecord(10510)]);
            var defHerosJson2 = JSON.stringify([this.createDefaultHeroRecord(10650), this.createDefaultHeroRecord(10710), this.createDefaultHeroRecord(10020)]);
            var defHerosJson3 = JSON.stringify([this.createDefaultHeroRecord(10010), this.createDefaultHeroRecord(10030), this.createDefaultHeroRecord(10040)]);
            respond({
                player_id: targetPid,
                fighter_id: targetPid,
                server_id: 2,
                team_num: 2,
                win_count: 50,
                rank: 2,
                player_name: "Madara Uchiha",
                player_lv: 99,
                icon: 11060,
                fight_value: 1500000,
                def_heros_1: defHerosJson1,
                def_heros_2: defHerosJson2,
                def_heros_3: defHerosJson3
            });
            return true;
        }

        if (cmd === "CrossSetArenaLineup" || cmd === SVRCMD.CrossSetArenaLineup) {
            this.data.cross_arena_lineup = (params && params[0]) ? params[0] : [10010, 10020, 10030, 10040, 10050];
            respond({ status: 1 });
            return true;
        }

        if (cmd === "CrossArenaFight" || cmd === SVRCMD.CrossArenaFight) {
            this.data.cross_arena_rank = 1;
            this.data.cross_arena_score = Number(this.data.cross_arena_score || 1600) + 30;
            this.addCurrency(10, 100, queuePush);

            var myHeroIds = Object.keys(this.data.heros || {}).map(Number);
            var fData1 = generateBattleReplayJson(myHeroIds.slice(0, 5), [11060, 11000, 10510], true, 6);
            var fData2 = generateBattleReplayJson(myHeroIds.slice(5, 10), [10650, 10710, 10020], true, 6);

            respond({
                useZip: false,
                isWin: 1,
                rank: 1,
                score: this.data.cross_arena_score,
                fightData1: fData1,
                fightData2: fData2
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

        if (cmd === "CrossDarkArenaRank" || cmd === "CrossDarkArenaAllRankInfo" || cmd === SVRCMD.CrossDarkArenaAllRankInfo) {
            if (cmd === "CrossDarkArenaAllRankInfo" || cmd === SVRCMD.CrossDarkArenaAllRankInfo) {
                var pLv = Number(this.data.team_lv || 1);
                var minLv = Math.max(1, Math.floor(pLv / 10) * 10);
                var maxLv = minLv + 9;
                var myScore = Number(this.data.cross_dark_score || 1500);
                var allGroupInfo = {
                    my_info: {
                        cur_rank: Number(this.data.cross_dark_rank || 1),
                        lv: 1,
                        min_lv: minLv,
                        max_lv: maxLv,
                        hour_point: 50,
                        total_point: myScore
                    },
                    "1": {
                        lv: 1,
                        min_lv: minLv,
                        max_lv: maxLv,
                        data: {
                            icon: 10020,
                            player_name: this.data.team_name || "Nhẫn Giả",
                            server_id: 1
                        }
                    },
                    "2": {
                        lv: 2,
                        min_lv: 50,
                        max_lv: 69,
                        data: {
                            icon: 11050,
                            player_name: "Obito Lục Đạo",
                            server_id: 2
                        }
                    },
                    "3": {
                        lv: 3,
                        min_lv: 70,
                        max_lv: 89,
                        data: {
                            icon: 10650,
                            player_name: "Jiraiya Tiên Nhân",
                            server_id: 1
                        }
                    },
                    "4": {
                        lv: 4,
                        min_lv: 90,
                        max_lv: 100,
                        data: {
                            icon: 11000,
                            player_name: "Itachi Susanoo",
                            server_id: 3
                        }
                    }
                };
                respond(allGroupInfo);
                return true;
            }

            respond({
                ranks: [
                    { rank: 1, player_id: this.getNumericId(), player_name: this.data.team_name || "Nhẫn Giả", server_id: 1, icon: 10020, score: 2100, team_lv: Number(this.data.team_lv || 100) },
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

        if (cmd === "CrossPlayerDarkArenaInfo" || cmd === SVRCMD.CrossPlayerDarkArenaInfo) {
            var defHeros1 = [
                { hero_id: 10020, lv: 85, quality: 12, bagate_level: 1 },
                { hero_id: 10030, lv: 85, quality: 12, bagate_level: 1 },
                { hero_id: 10040, lv: 85, quality: 12, bagate_level: 1 },
                { hero_id: 10050, lv: 85, quality: 12, bagate_level: 1 },
                { hero_id: 10010, lv: 85, quality: 12, bagate_level: 1 }
            ];
            var defHeros2 = [
                { hero_id: 10060, lv: 82, quality: 11, bagate_level: 1 },
                { hero_id: 10070, lv: 82, quality: 11, bagate_level: 1 },
                { hero_id: 10080, lv: 82, quality: 11, bagate_level: 1 },
                { hero_id: 10090, lv: 82, quality: 11, bagate_level: 1 },
                { hero_id: 10100, lv: 82, quality: 11, bagate_level: 1 }
            ];
            var defHeros3 = [
                { hero_id: 10110, lv: 80, quality: 10, bagate_level: 1 },
                { hero_id: 10120, lv: 80, quality: 10, bagate_level: 1 },
                { hero_id: 10130, lv: 80, quality: 10, bagate_level: 1 },
                { hero_id: 10140, lv: 80, quality: 10, bagate_level: 1 },
                { hero_id: 10150, lv: 80, quality: 10, bagate_level: 1 }
            ];
            respond({
                player_id: 734,
                server_id: 2,
                team_num: 3,
                player_name: "Obito Lục Đạo",
                player_lv: 98,
                player_icon: 80110020,
                def_heros_1: JSON.stringify(defHeros1),
                def_heros_2: JSON.stringify(defHeros2),
                def_heros_3: JSON.stringify(defHeros3),
                player: { player_id: 734, player_name: "Obito Lục Đạo", server_id: 2, rank: 2, score: 2050, icon: 11050, team_lv: 98 },
                heros: defHeros1
            });
            return true;
        }

        if (cmd === "CrossSetDarkArenaLineup" || cmd === SVRCMD.CrossSetDarkArenaLineup) {
            if (params && params.length >= 2) {
                if (!this.data.cross_dark_lineups) this.data.cross_dark_lineups = {};
                for (var li = 1; li < params.length; li++) {
                    if (params[li]) this.data.cross_dark_lineups[li] = String(params[li]);
                }
            }
            this.save();
            respond({ status: 1 });
            return true;
        }

        if (cmd === "CrossDarkArenaFight" || cmd === SVRCMD.CrossDarkArenaFight) {
            this.data.cross_dark_rank = 1;
            this.data.cross_dark_score = Number(this.data.cross_dark_score || 1500) + 25;
            this.data.cross_dark_record_point = Number(this.data.cross_dark_record_point || 0) + 50;
            this.addCurrency(13, 120, queuePush);
            this.addCurrency(14, 120, queuePush);

            var myHeroIds = Object.keys(this.data.heros || {}).map(Number);
            if (myHeroIds.length === 0) myHeroIds = [10020, 10030, 10040, 10050, 10010, 10060, 10070, 10080, 10090, 10100, 10110, 10120, 10130, 10140, 10150];

            var fData1 = generateBattleReplayJson(myHeroIds.slice(0, 5), [10020, 10030, 10040, 10050, 10010], true, 6);
            var fData2 = generateBattleReplayJson(myHeroIds.slice(5, 10), [10060, 10070, 10080, 10090, 10100], true, 6);
            var fData3 = generateBattleReplayJson(myHeroIds.slice(10, 15), [10110, 10120, 10130, 10140, 10150], true, 6);

            this.save();

            respond({
                useZip: false,
                isWin: 1,
                rank: 1,
                score: this.data.cross_dark_score,
                fightData1: fData1,
                fightData2: fData2,
                fightData3: fData3
            });
            return true;
        }

        if (cmd === "CrossReceiceDarkArenaRecordPoint") {
            var bonusKC = 200;
            this.addStone(bonusKC, queuePush);
            this.data.cross_dark_record_point = 0;
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

        if (cmd === "CrossClearArenaFightCD" || cmd === "CrossClearDarkArenaFightCD") {
            respond({ status: 1 });
            return true;
        }

        return false;
    }
};

module.exports = ArenaAndTowerHandler;
