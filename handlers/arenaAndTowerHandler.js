// ============================================================================
// HANDLER: ĐẤU TRƯỜNG, LÔI ĐÀI, TRANH BÁ, THÁP VÔ TẬN, CỨ ĐIỂM & LIÊN SERVER
// (Arena, DarkArena, LimitedArena, Tower, NoEndTower, NinjaFight/Expedition, Treasure/Mining, CrossServer Boss/Arena/DarkArena)
// ============================================================================

var fs = require("fs");
var path = require("path");
var battleSimulator = require("../services/battleSimulator");
var db = require("../db/database");
var playerDb = db.playerDb;
var markDirty = db.markDirty;
var saveDb = db.saveDb;
var getOrAssignUid = db.getOrAssignUid;
var findPlayerByIdOrUid = db.findPlayerByIdOrUid;

var REPLAY_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours
var REPLAY_DB_FILE = path.join(__dirname, "..", "data", "arena_replays.json");
var _arenaReplays = {};

function loadArenaReplays() {
    try {
        if (fs.existsSync(REPLAY_DB_FILE)) {
            var raw = fs.readFileSync(REPLAY_DB_FILE, "utf8");
            _arenaReplays = JSON.parse(raw || "{}") || {};
        }
    } catch (e) {
        _arenaReplays = {};
    }
    purgeExpiredReplays();
}

function purgeExpiredReplays() {
    var now = Date.now();
    var changed = false;
    for (var id in _arenaReplays) {
        if (!_arenaReplays[id] || (now - (_arenaReplays[id].createdAt || 0)) > REPLAY_TTL_MS) {
            delete _arenaReplays[id];
            changed = true;
        }
    }
    if (changed) saveArenaReplays();
    return changed;
}

function saveArenaReplays() {
    try {
        var dir = path.dirname(REPLAY_DB_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(REPLAY_DB_FILE, JSON.stringify(_arenaReplays), "utf8");
    } catch (e) { }
}

function storeArenaReplay(replayId, playerId, targetId, isWin, fightData, roundFightDatas) {
    purgeExpiredReplays();
    var rounds = Array.isArray(roundFightDatas) ? roundFightDatas : [];
    var f1 = fightData || rounds[0] || "";
    _arenaReplays[String(replayId)] = {
        id: String(replayId),
        playerId: playerId,
        targetId: targetId,
        isWin: isWin ? 1 : 0,
        fight_data: f1,
        fight_data_1: rounds[0] || f1,
        fight_data_2: rounds[1] || "",
        fight_data_3: rounds[2] || "",
        createdAt: Date.now()
    };
    saveArenaReplays();
}

function getArenaReplay(replayId) {
    purgeExpiredReplays();
    return _arenaReplays[String(replayId)] || null;
}

loadArenaReplays();
setInterval(purgeExpiredReplays, 30 * 60 * 1000); // Auto-clean every 30 mins


class PackageWriter {
    constructor() { this.buf = []; }
    appendByte(v) { this.buf.push(v & 0xFF); }
    appendShort(v) { this.buf.push((v >> 8) & 0xFF, v & 0xFF); }
    appendInt(v) {
        this.buf.push((v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF);
    }
    getPackage() { return this.buf; }
}

function getHeroSkillIds(heroOrId) {
    var hid = (typeof heroOrId === "object" && heroOrId) ? Number(heroOrId.id || heroOrId.hero_id) : Number(heroOrId);
    var hObj = (typeof heroOrId === "object" && heroOrId) ? heroOrId : null;
    var sks = [];
    if (typeof Config !== "undefined" && Config.hero && Config.hero[hid]) {
        var hCfg = Config.hero[hid];
        var defaultLv = (hObj && (hObj.lv || hObj.level)) ? Number(hObj.lv || hObj.level) : 80;
        if (Config.skill && Config.skill[hid]) {
            sks.push({ id: hid, lv: 1, status: 0 });
        }
        for (var k = 1; k <= 4; k++) {
            var skid = hCfg["skill_id_" + k] || hCfg["skill_" + k];
            if (skid && Config.skill && Config.skill[skid]) {
                var skLv = defaultLv;
                if (hObj && hObj["skill_" + k + "_lv"] !== undefined) {
                    skLv = Number(hObj["skill_" + k + "_lv"]) || 1;
                }
                sks.push({ id: skid, lv: skLv, status: 0 });
            }
        }
    }
    return sks;
}

function writeHeroToBuffer(pw, uid, heroOrId) {
    var hid = (typeof heroOrId === "object" && heroOrId) ? Number(heroOrId.id || heroOrId.hero_id) : Number(heroOrId);
    var hObj = (typeof heroOrId === "object" && heroOrId) ? heroOrId : null;
    var lv = (hObj && (hObj.lv || hObj.level)) ? Number(hObj.lv || hObj.level) : 80;
    var quality = (hObj && hObj.quality) ? Number(hObj.quality) : 10;

    // Đảm bảo quality tồn tại trong Config.heroQuality cho hero hid
    if (typeof Config !== "undefined" && Config.heroQuality) {
        var foundQ = false;
        for (var q = quality; q >= 1; q--) {
            if (Config.heroQuality[q] && Config.heroQuality[q][hid]) {
                quality = q;
                foundQ = true;
                break;
            }
        }
        if (!foundQ) quality = 1;
    }

    var hp = (hObj && (hObj.hp || hObj.maxhp)) ? Number(hObj.hp || hObj.maxhp) : 100000;
    var maxHp = (hObj && hObj.maxhp) ? Number(hObj.maxhp) : hp;
    var atk = (hObj && hObj.atk) ? Number(hObj.atk) : 5000;
    var def = (hObj && hObj.def) ? Number(hObj.def) : 2000;
    var mp = (hObj && hObj.mp) ? Number(hObj.mp) : 5000;
    var mpDef = (hObj && hObj.mp_def) ? Number(hObj.mp_def) : 2000;
    var cri = (hObj && hObj.cri !== undefined) ? Math.round(Number(hObj.cri) * 100) : 10;
    var mpCri = (hObj && hObj.mp_cri !== undefined) ? Math.round(Number(hObj.mp_cri) * 100) : 10;
    var hasAwake = (hObj && hObj.has_awake) ? Number(hObj.has_awake) : (quality >= 11 ? 1 : 0);
    var atkSpeed = (typeof Config !== "undefined" && Config.hero && Config.hero[hid] && Config.hero[hid].speed)
        ? Number(Config.hero[hid].speed)
        : 7;

    var sks = getHeroSkillIds(heroOrId);
    pw.appendInt(uid);
    pw.appendInt(hid);
    pw.appendInt(Math.max(1000, hp));     // hp
    pw.appendInt(lv);                     // level
    pw.appendInt(quality);                // quality
    pw.appendInt(Math.max(1000, maxHp));  // maxHp
    pw.appendInt(atk);                    // physicDmg
    pw.appendInt(def);                    // physicDef
    pw.appendInt(cri);                    // physicCirt * 100
    pw.appendInt(0);                      // power
    pw.appendInt(100);                    // maxPower
    pw.appendInt(mp);                     // magicDmg
    pw.appendInt(mpDef);                  // magicDef
    pw.appendInt(mpCri);                  // magicCirt * 100
    pw.appendInt(300);                    // moveSpeed
    pw.appendInt(150);                    // attackRange
    pw.appendInt(atkSpeed);               // attackSpeed
    pw.appendInt(10);                     // powerSpeed
    pw.appendInt(0);                      // randomsRec.length
    pw.appendByte(sks.length);
    for (var s = 0; s < sks.length; s++) {
        pw.appendInt(sks[s].id);
        pw.appendInt(sks[s].lv);
        pw.appendInt(sks[s].status);
    }
    pw.appendByte(hasAwake);              // has_awake
}

function generateCompetentHeroRecord(hid, level, quality, star, opts) {
    hid = Number(hid);
    if (typeof Config !== "undefined" && Config.hero && !Config.hero[hid]) {
        hid = 10010;
    }
    level = Math.max(1, Number(level || 20));
    quality = Math.max(1, Math.min(18, Number(quality || 1)));
    star = Math.max(1, Number(star || 1));
    if (typeof Config !== "undefined" && Config.hero && Config.hero[hid] && Config.hero[hid].star) {
        star = Math.max(star, Number(Config.hero[hid].star));
    }

    var qVal = quality;
    var qCfg = {};
    if (typeof Config !== "undefined" && Config.heroQuality) {
        for (var q = quality; q >= 1; q--) {
            if (Config.heroQuality[String(q)] && Config.heroQuality[String(q)][String(hid)]) {
                qVal = q;
                qCfg = Config.heroQuality[String(q)][String(hid)];
                break;
            }
        }
    }

    var bagateLv = level < 85
        ? 0
        : ((opts && opts.bagateLv !== undefined)
            ? Math.max(0, Math.min(8, Number(opts.bagateLv)))
            : Math.min(8, Math.floor((level - 80) / 5)));
    var equipCount = (opts && opts.equipCount !== undefined)
        ? Math.max(0, Math.min(6, Number(opts.equipCount)))
        : (quality <= 1 && level < 10
            ? Math.min(6, Math.floor(level / 2))
            : Math.min(6, Math.max(2, Math.floor(level / 10) + 1)));

    var hp = Number(qCfg.hp || 150) + (level - 1) * Number(qCfg.hp_inc || 15);
    var atk = Number(qCfg.atk || 20) + (level - 1) * Number(qCfg.atk_inc || 3);
    var def = Number(qCfg.def || 5) + (level - 1) * Number(qCfg.def_inc || 1);
    var mp = Number(qCfg.mp || 15) + (level - 1) * Number(qCfg.mp_inc || 3);
    var mpDef = Number(qCfg.mpdef || 5) + (level - 1) * Number(qCfg.mpdef_inc || 1);
    var cri = Number(qCfg.cri || 0.05);
    var mpCri = Number(qCfg.mp_cri || 0.05);

    if (typeof Config !== "undefined" && Config.equip) {
        for (var s = 1; s <= equipCount; s++) {
            var eqId = qCfg["equip_" + s];
            var eqCfg = eqId ? Config.equip[eqId] : null;
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

    if (bagateLv > 0 && typeof Config !== "undefined" && Config.bamen) {
        for (var g = 1; g <= bagateLv; g++) {
            var gCfg = Config.bamen[g];
            if (gCfg) {
                hp += Number(gCfg.hp || 0);
                atk += Number(gCfg.atk || 0);
                def += Number(gCfg.def || 0);
                mp += Number(gCfg.chak || 0);
                mpDef += Number(gCfg.chadef || 0);
            }
        }
    }

    var finalHp = Math.max(150, Math.floor(hp));
    var finalAtk = Math.max(20, Math.floor(atk));
    var finalDef = Math.max(5, Math.floor(def));
    var finalMp = Math.max(15, Math.floor(mp));
    var finalMpDef = Math.max(5, Math.floor(mpDef));
    var finalCri = Number(cri.toFixed(2));
    var finalMpCri = Number(mpCri.toFixed(2));

    var sk1 = level;
    var sk2 = qVal >= 2 ? level : 0;
    var sk3 = qVal >= 4 ? Math.max(1, level - 15) : 0;
    var sk4 = qVal >= 7 ? Math.max(1, level - 30) : 0;
    var sk5 = qVal >= 12 ? Math.max(1, level - 45) : 0;
    var totalPower = Math.floor(
        finalHp * 0.1 + finalAtk * 0.6 + finalDef * 0.3 +
        finalMp * 0.6 + finalMpDef * 0.3 +
        finalCri * 25 + finalMpCri * 25 +
        (sk1 + sk2 + sk3 + sk4 + sk5) * 4
    );

    return {
        id: hid,
        hero_id: hid,
        lv: level,
        level: level,
        exp: 0,
        quality: qVal,
        star: star,
        status: 0,
        beast: 0,
        has_awake: (qVal >= 12) ? 1 : 0,
        bagate_level: bagateLv,
        hp: finalHp,
        maxhp: finalHp,
        atk: finalAtk,
        def: finalDef,
        mp: finalMp,
        mp_def: finalMpDef,
        cri: finalCri,
        mp_cri: finalMpCri,
        power: totalPower,
        equip_1: equipCount >= 1 ? 1 : 0,
        equip_2: equipCount >= 2 ? 1 : 0,
        equip_3: equipCount >= 3 ? 1 : 0,
        equip_4: equipCount >= 4 ? 1 : 0,
        equip_5: equipCount >= 5 ? 1 : 0,
        equip_6: equipCount >= 6 ? 1 : 0,
        ninja_tool_1: 0,
        ninja_tool_2: 0,
        ninja_tool_3: 0,
        ninja_tool_4: 0,
        ninja_tool_5: 0,
        ninja_tool_6: 0,
        skill_1_lv: Math.min(80, sk1),
        skill_2_lv: Math.min(80, sk2),
        skill_3_lv: Math.min(60, sk3),
        skill_4_lv: Math.min(40, sk4),
        skill_5_lv: Math.min(40, sk5),
        skill_6_lv: (qVal >= 13) ? Math.min(80, level) : 0,
        skill_7_lv: (qVal >= 14) ? Math.min(80, level) : 0,
        skill_8_lv: (qVal >= 15) ? Math.min(60, Math.max(1, level - 20)) : 0,
        skill_9_lv: (qVal >= 16) ? Math.min(40, Math.max(1, level - 40)) : 0,
        skill_10_lv: (qVal >= 17) ? Math.min(40, Math.max(1, level - 50)) : 0,
        skill_11_lv: Math.min(6, Math.max(1, Math.floor(level / 15) + 1)),
        skill_12_lv: Math.min(6, Math.max(1, Math.floor(level / 15) + 1)),
        sel_tf_skill: 0,
        secret_1_id: 0, secret_1_lv: 0,
        secret_2_id: 0, secret_2_lv: 0,
        secret_3_id: 0, secret_3_lv: 0,
        secret_4_id: 0, secret_4_lv: 0,
        secret_5_id: 0, secret_5_lv: 0,
        secret_6_id: 0, secret_6_lv: 0,
        secret_101_id: 0, secret_101_lv: 0,
        secret_102_id: 0, secret_102_lv: 0,
        secret_103_id: 0, secret_103_lv: 0,
        secret_104_id: 0, secret_104_lv: 0,
        secret_105_id: 0, secret_105_lv: 0,
        secret_106_id: 0, secret_106_lv: 0
    };
}

function getTodayDateKey() {
    var nowPlus7 = new Date(Date.now() + 7 * 3600 * 1000);
    return nowPlus7.toISOString().slice(0, 10);
}

function resetDailyArenaCountersIfNeeded(playerData, prefix) {
    if (!playerData) return getTodayDateKey();
    var today = getTodayDateKey();
    var dateField = prefix + "_date";
    if (playerData[dateField] !== today) {
        playerData[dateField] = today;
        playerData[prefix + "_fight_count"] = 0;
        playerData[prefix + "_buy_count"] = 0;
        playerData[prefix + "_last_fight_time"] = 0;
    }
    return today;
}

function computeArenaHeroPower(h) {
    if (!h) return 0;
    if (Number(h.power || 0) > 0) return Number(h.power);
    var skSum = Number(h.skill_1_lv || 1) + Number(h.skill_2_lv || 0) + Number(h.skill_3_lv || 0) + Number(h.skill_4_lv || 0) + Number(h.skill_5_lv || 0);
    return Math.floor(
        Number(h.hp || h.maxhp || 0) * 0.1 +
        Number(h.atk || 0) * 0.6 +
        Number(h.def || 0) * 0.3 +
        Number(h.mp || 0) * 0.6 +
        Number(h.mp_def || 0) * 0.3 +
        Number(h.cri || 0) * 25 +
        Number(h.mp_cri || 0) * 25 +
        skSum * 4
    );
}

function calcArenaTeamPower(heroList) {
    if (!Array.isArray(heroList) || heroList.length === 0) return 0;
    var sum = 0;
    for (var i = 0; i < heroList.length; i++) {
        sum += computeArenaHeroPower(heroList[i]);
    }
    return sum;
}

function computeOtherPlayerHeroPayload(session, pd, hid) {
    hid = Number(hid);
    if (pd && pd.heros && pd.heros[hid] && session && typeof session.computeHeroPayload === "function") {
        try {
            var clonedHeros = {};
            clonedHeros[hid] = Object.assign({}, pd.heros[hid]);
            var fakeCtx = {
                data: {
                    heros: clonedHeros,
                    beasts: pd.beasts || {},
                    secrets: pd.secrets || []
                },
                createDefaultHeroRecord: session.createDefaultHeroRecord
            };
            return session.computeHeroPayload.call(fakeCtx, hid);
        } catch (e) { }
    }
    return generateCompetentHeroRecord(hid, pd ? Number(pd.team_lv || 20) : 20, 1, 1);
}

function parseHeroIdInput(rawInput) {
    var arr = [];
    if (!rawInput) return arr;
    if (typeof rawInput === "string") {
        var trimmed = rawInput.trim();
        if (!trimmed) return arr;
        if (trimmed[0] === "[") {
            try {
                var parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parseHeroIdInput(parsed);
            } catch (e) { }
        }
        var parts = trimmed.split(",");
        for (var i = 0; i < parts.length; i++) {
            var v = Number(String(parts[i]).trim());
            if (v > 0 && arr.indexOf(v) === -1) arr.push(v);
        }
        return arr;
    }
    if (Array.isArray(rawInput)) {
        for (var j = 0; j < rawInput.length; j++) {
            var item = rawInput[j];
            var num = (item && typeof item === "object") ? Number(item.id || item.hero_id || 0) : Number(item);
            if (num > 0 && arr.indexOf(num) === -1) arr.push(num);
        }
    }
    return arr;
}

function getSortedOwnedHeroIdsForData(session, playerData) {
    var heros = (playerData && playerData.heros) ? playerData.heros : {};
    var keys = Object.keys(heros).map(Number).filter(function (id) { return id > 0; });
    if (keys.length === 0) return [10010, 10020, 10030, 10040, 10050];
    var scored = [];
    var useSelf = session && session.data === playerData && typeof session.computeHeroPayload === "function";
    for (var i = 0; i < keys.length; i++) {
        var hid = keys[i];
        var payload = useSelf
            ? session.computeHeroPayload(hid)
            : computeOtherPlayerHeroPayload(session, playerData, hid);
        scored.push({
            id: hid,
            power: computeArenaHeroPower(payload),
            quality: Number(payload.quality || 1),
            lv: Number(payload.lv || 1)
        });
    }
    scored.sort(function (a, b) {
        if (b.power !== a.power) return b.power - a.power;
        if (b.quality !== a.quality) return b.quality - a.quality;
        if (b.lv !== a.lv) return b.lv - a.lv;
        return a.id - b.id;
    });
    return scored.map(function (it) { return it.id; });
}

function getSortedOwnedHeroIds(session) {
    return getSortedOwnedHeroIdsForData(session, session ? session.data : null);
}

function resolveHeroIdList(session, rawInput, maxCount, fallbackIds) {
    maxCount = Math.max(1, Number(maxCount || 5));
    var heros = (session && session.data && session.data.heros) ? session.data.heros : {};
    var hasOwned = Object.keys(heros).length > 0;
    var parsed = parseHeroIdInput(rawInput);
    var out = [];
    for (var i = 0; i < parsed.length; i++) {
        var hid = parsed[i];
        if (!hasOwned || heros[hid]) {
            out.push(hid);
            if (out.length >= maxCount) break;
        }
    }
    if (out.length === 0) {
        var fb = (fallbackIds && fallbackIds.length > 0) ? fallbackIds : getSortedOwnedHeroIds(session);
        out = fb.slice(0, maxCount);
    }
    return out;
}

function resolveMultiTeamLineupsForData(session, playerData, savedTeams, numTeams, teamSize, allowUnowned) {
    numTeams = Math.max(1, Number(numTeams || 3));
    teamSize = Math.max(1, Number(teamSize || 5));
    var heros = (playerData && playerData.heros) ? playerData.heros : {};
    var hasOwned = Object.keys(heros).length > 0;

    var teams = [];
    var hasAnySaved = false;
    if (Array.isArray(savedTeams)) {
        for (var t = 0; t < numTeams; t++) {
            var parsed = parseHeroIdInput(savedTeams[t]);
            var filtered = [];
            for (var i = 0; i < parsed.length; i++) {
                var hid = parsed[i];
                var valid = allowUnowned
                    ? (!!heros[hid] || (typeof Config !== "undefined" && Config.hero && !!Config.hero[hid]))
                    : (!hasOwned || !!heros[hid]);
                if (valid) {
                    filtered.push(hid);
                    if (filtered.length >= teamSize) break;
                }
            }
            if (filtered.length > 0) hasAnySaved = true;
            teams.push(filtered);
        }
    }
    if (hasAnySaved) {
        while (teams.length < numTeams) teams.push([]);
        return teams;
    }

    var sorted = getSortedOwnedHeroIdsForData(session, playerData);
    teams = [];
    if (sorted.length >= numTeams) {
        var idx = 0;
        for (var ti = 0; ti < numTeams; ti++) {
            var remainingTeams = numTeams - ti - 1;
            var available = sorted.length - idx;
            var take = Math.min(teamSize, Math.max(1, available - remainingTeams));
            teams.push(sorted.slice(idx, idx + take));
            idx += take;
        }
    } else {
        for (var tj = 0; tj < numTeams; tj++) {
            teams.push([sorted[tj % sorted.length]]);
        }
    }
    return teams;
}

function resolveMultiTeamLineups(session, savedTeams, numTeams, teamSize) {
    return resolveMultiTeamLineupsForData(session, session ? session.data : null, savedTeams, numTeams, teamSize, false);
}

var ARENA_MODE_META = {
    arena:       { rankField: "arena_rank",       winField: "arena_win_count",       historyField: "arena_history",       defaultRank: 20, teamNum: 1 },
    dark_arena:  { rankField: "dark_arena_rank",  winField: "dark_arena_win_count",  historyField: "dark_arena_history",  defaultRank: 20, teamNum: 3 },
    lim_arena:   { rankField: "lim_arena_rank",   winField: "lim_arena_wins",        historyField: "lim_arena_history",   defaultRank: 20, teamNum: 1 },
    cross_arena: { rankField: "cross_arena_rank", winField: "cross_arena_win_count", historyField: "cross_arena_history", defaultRank: 20, teamNum: 2 },
    cross_dark:  { rankField: "cross_dark_rank",  winField: "cross_dark_win_count",  historyField: "cross_dark_history",  defaultRank: 20, teamNum: 3 }
};

function getArenaModeMeta(modeKey) {
    return ARENA_MODE_META[modeKey] || ARENA_MODE_META.arena;
}

function getOrInitPlayerModeRank(pd, modeKey) {
    var meta = getArenaModeMeta(modeKey);
    if (!pd) return meta.defaultRank;
    if (Number(pd[meta.rankField] || 0) > 0) return Number(pd[meta.rankField]);
    var taken = {};
    if (playerDb) {
        for (var pk in playerDb) {
            var other = playerDb[pk];
            if (other && Number(other[meta.rankField] || 0) > 0) {
                taken[Number(other[meta.rankField])] = true;
            }
        }
    }
    var r = meta.defaultRank;
    while (taken[r]) r++;
    pd[meta.rankField] = r;
    return r;
}

var VN_OFFSET_MS = 7 * 3600 * 1000;
var LIMITED_STATE_FILE = path.join(__dirname, "..", "data", "limited_arena_state.json");

var LIMITED_ARENA_THEMES = [
    {
        id: 1,
        key: "akatsuki",
        aliases: ["1", "akatsuki", "toipham", "srank"],
        name: "Tuần Akatsuki & Tổ Chức Tội Phạm",
        description: "Chỉ cho phép các thành viên Akatsuki, Taka/Orochimaru và Kara.",
        allowedIds: [10120, 10780, 10290, 10150, 10310, 10320, 10330, 10360, 10380, 10660, 10160, 10570, 10560, 10370, 10700, 10110, 10800, 10280, 10340, 10350, 10520, 10890, 11050, 10990]
    },
    {
        id: 2,
        key: "uchiha",
        aliases: ["2", "uchiha", "nhanthuat", "sharingan", "dojutsu"],
        name: "Tuần Gia Tộc Uchiha & Nhãn Thuật",
        description: "Chỉ cho phép tộc Uchiha, Sharingan, Rinnegan và Byakugan.",
        allowedIds: [10030, 10830, 10940, 10120, 10780, 10610, 10160, 10570, 10370, 10700, 10920, 10860, 10050, 10750, 10470, 10380, 10660, 10080, 10220, 10950, 11070]
    },
    {
        id: 3,
        key: "kage",
        aliases: ["3", "kage", "ngukage", "hokage"],
        name: "Tuần Ngũ Đại Kage & Lãnh Đạo",
        description: "Chỉ cho phép các Kage tiền nhiệm/đương nhiệm và thủ lĩnh làng lớn.",
        allowedIds: [10540, 10880, 10460, 10410, 10010, 10820, 10130, 10790, 10750, 10960, 10470, 10090, 10850, 10510, 10670, 10600, 10430, 10720, 10500, 10440, 10630, 10770, 10530, 10680, 10450, 10690, 10480]
    },
    {
        id: 4,
        key: "jinchuriki",
        aliases: ["4", "jinchuriki", "vithu", "lucdao", "sage", "tiennhan"],
        name: "Tuần Vĩ Thú, Tiên Nhân & Lục Đạo",
        description: "Chỉ cho phép Jinchuriki, Hiền Nhân, Lục Đạo và gia tộc Otsutsuki.",
        allowedIds: [10020, 10810, 10960, 11060, 10890, 10490, 10650, 10090, 10850, 10680, 10170, 10570, 10700, 10770, 10100, 10740, 10820, 10880, 10280, 10970, 11020, 10840, 10860, 10900, 10710, 10930, 11030, 11040, 11050, 11070]
    },
    {
        id: 5,
        key: "konoha",
        aliases: ["5", "konoha", "langla", "boruto", "leaf"],
        name: "Tuần Làng Lá & Thế Hệ Mới",
        description: "Chỉ cho phép các Nhẫn Giả Làng Lá Konoha và thế hệ Boruto.",
        allowedIds: [10020, 10030, 10040, 10870, 10050, 10620, 10300, 10100, 10740, 10130, 10790, 10110, 10800, 10070, 10400, 10760, 10080, 10220, 10250, 10200, 10210, 10390, 10550, 10270, 10230, 10640, 10180, 10420, 10910, 10950, 11000, 10980, 10970, 10990]
    },
    {
        id: 6,
        key: "allied",
        aliases: ["6", "allied", "lienminh", "tukho", "ngoailang"],
        name: "Tuần Liên Minh Làng Cát, Sương, Đá & Mây",
        description: "Chỉ cho phép Nhẫn Giả Cát, Sương Mù, Đá, Mây và Âm Thanh.",
        allowedIds: [10090, 10850, 10240, 11010, 10260, 10510, 10670, 10060, 10190, 10290, 10340, 10450, 10530, 10680, 10690, 10430, 10600, 10720, 10440, 10500, 10630, 10170, 10770, 10140, 10590, 10350, 10520, 10730, 10480]
    }
];

var _limArenaState = { overrideKey: null, switchCount: 0 };

function loadLimitedArenaState() {
    try {
        if (fs.existsSync(LIMITED_STATE_FILE)) {
            var parsed = JSON.parse(fs.readFileSync(LIMITED_STATE_FILE, "utf8") || "{}") || {};
            if (parsed && (parsed.overrideKey === null || typeof parsed.overrideKey === "string")) {
                _limArenaState.overrideKey = parsed.overrideKey;
            }
            _limArenaState.switchCount = Number(parsed.switchCount || 0);
        }
    } catch (e) { }
}

function saveLimitedArenaState() {
    try {
        var dir = path.dirname(LIMITED_STATE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(LIMITED_STATE_FILE, JSON.stringify(_limArenaState), "utf8");
    } catch (e) { }
}

loadLimitedArenaState();

function getActiveLimitedArenaTheme(nowMs) {
    var ms = (nowMs !== undefined && nowMs !== null) ? Number(nowMs) : Date.now();
    var vnDate = new Date(ms + VN_OFFSET_MS - 5 * 3600 * 1000);
    var dow = vnDate.getUTCDay(); // 0=Sunday..6=Saturday (aligned to Sunday 05:00 VN weekly cadence)
    var sundayMs = Date.UTC(vnDate.getUTCFullYear(), vnDate.getUTCMonth(), vnDate.getUTCDate() - dow);
    var weekKey = new Date(sundayMs).toISOString().slice(0, 10);
    var weekNumber = Math.floor(sundayMs / (7 * 86400 * 1000));
    var autoIdx = ((weekNumber % LIMITED_ARENA_THEMES.length) + LIMITED_ARENA_THEMES.length) % LIMITED_ARENA_THEMES.length;

    var chosen = LIMITED_ARENA_THEMES[autoIdx];
    var isManual = false;
    if (_limArenaState.overrideKey) {
        for (var i = 0; i < LIMITED_ARENA_THEMES.length; i++) {
            if (LIMITED_ARENA_THEMES[i].key === _limArenaState.overrideKey) {
                chosen = LIMITED_ARENA_THEMES[i];
                isManual = true;
                break;
            }
        }
    }

    var allowedIds = [];
    var allowedSet = {};
    for (var j = 0; j < chosen.allowedIds.length; j++) {
        var hid = Number(chosen.allowedIds[j]);
        if (typeof Config !== "undefined" && Config.hero && !Config.hero[hid]) continue;
        if (!allowedSet[hid]) {
            allowedSet[hid] = true;
            allowedIds.push(hid);
        }
    }
    // Tự động cho phép các tướng mới ra mắt (ID >= 11070, có hồn ghép) vào tuần Vĩ Thú / Konoha
    if (typeof Config !== "undefined" && Config.hero && (chosen.key === "jinchuriki" || chosen.key === "konoha")) {
        for (var hk in Config.hero) {
            var nhId = Number(hk);
            if (nhId >= 11070 && nhId < 15000 && Number(Config.hero[hk].sum_soul || 0) > 0 && !allowedSet[nhId]) {
                allowedSet[nhId] = true;
                allowedIds.push(nhId);
            }
        }
    }

    return {
        id: chosen.id,
        key: chosen.key,
        name: chosen.name,
        description: chosen.description,
        isManual: isManual,
        weekKey: weekKey,
        revision: Number(chosen.id) + Number(_limArenaState.switchCount || 0) * 10,
        allowedIds: allowedIds,
        allowedSet: allowedSet
    };
}

function setLimitedArenaThemeOverride(argStr) {
    var token = String(argStr || "").trim().toLowerCase();
    if (!token || token === "list" || token === "info") {
        return { action: "list", active: getActiveLimitedArenaTheme(), themes: LIMITED_ARENA_THEMES };
    }
    if (token === "auto" || token === "reset" || token === "weekly" || token === "0") {
        _limArenaState.overrideKey = null;
        _limArenaState.switchCount = Number(_limArenaState.switchCount || 0) + 1;
        saveLimitedArenaState();
        _cachedMatchups = {};
        return { action: "auto", active: getActiveLimitedArenaTheme(), themes: LIMITED_ARENA_THEMES };
    }
    for (var i = 0; i < LIMITED_ARENA_THEMES.length; i++) {
        var th = LIMITED_ARENA_THEMES[i];
        if (th.key === token || String(th.id) === token || (th.aliases && th.aliases.indexOf(token) !== -1)) {
            _limArenaState.overrideKey = th.key;
            _limArenaState.switchCount = Number(_limArenaState.switchCount || 0) + 1;
            saveLimitedArenaState();
            _cachedMatchups = {};
            return { action: "set", active: getActiveLimitedArenaTheme(), themes: LIMITED_ARENA_THEMES };
        }
    }
    return { action: "invalid", active: getActiveLimitedArenaTheme(), themes: LIMITED_ARENA_THEMES };
}

function sanitizeLimitedIds(idList, allowedSet, fallbackList, maxLen) {
    maxLen = Math.max(1, Number(maxLen || 5));
    var out = [];
    var parsed = parseHeroIdInput(idList);
    for (var i = 0; i < parsed.length; i++) {
        var hid = parsed[i];
        if (!allowedSet[hid]) continue;
        if (out.indexOf(hid) === -1) out.push(hid);
        if (out.length >= maxLen) break;
    }
    if (out.length === 0 && Array.isArray(fallbackList)) {
        for (var j = 0; j < fallbackList.length && out.length < maxLen; j++) {
            var fid = Number(fallbackList[j]);
            if (allowedSet[fid] && out.indexOf(fid) === -1) out.push(fid);
        }
    }
    return out;
}

function getLimitedFallbackIdsForData(session, pd, activeTheme) {
    var ownedSorted = getSortedOwnedHeroIdsForData(session, pd);
    var out = [];
    for (var i = 0; i < ownedSorted.length; i++) {
        if (activeTheme.allowedSet[ownedSorted[i]] && out.indexOf(ownedSorted[i]) === -1) {
            out.push(ownedSorted[i]);
        }
    }
    for (var j = 0; j < activeTheme.allowedIds.length && out.length < 5; j++) {
        var aid = activeTheme.allowedIds[j];
        if (out.indexOf(aid) === -1) out.push(aid);
    }
    return out.slice(0, 5);
}

// --- Normal Tower (Tháp Mất Tích) Rules & State Helpers ---
function pad2(n) {
    return (n < 10 ? "0" : "") + n;
}

function getTowerScheduleState(nowMs, playerData) {
    var ms = (nowMs !== undefined && nowMs !== null) ? Number(nowMs) : Date.now();
    var vnClock = new Date(ms + VN_OFFSET_MS);
    var vnHour = vnClock.getUTCHours();
    var shiftedDaily = new Date(ms + VN_OFFSET_MS - 5 * 3600 * 1000);
    var dailyKey = shiftedDaily.getUTCFullYear() + "-" + pad2(shiftedDaily.getUTCMonth() + 1) + "-" + pad2(shiftedDaily.getUTCDate());
    var dow = shiftedDaily.getUTCDay(); // 0=Sunday (Day 1) .. 6=Saturday (Day 7)
    var dayIndex = dow + 1;
    var sundayMs = Date.UTC(shiftedDaily.getUTCFullYear(), shiftedDaily.getUTCMonth(), shiftedDaily.getUTCDate() - dow);
    var weekKey = new Date(sundayMs).toISOString().slice(0, 10);
    var weekStartRealMs = sundayMs + 5 * 3600 * 1000 - VN_OFFSET_MS;
    var nextWeekStartRealMs = weekStartRealMs + 7 * 86400 * 1000;
    var refreshTime = Math.max(0, Math.floor((nextWeekStartRealMs - ms) / 1000));
    var openAll = !!(playerData && playerData.tower_open_all_week === weekKey);
    var dailyMax = openAll ? 35 : Math.min(35, dayIndex * 5);
    return {
        nowMs: ms,
        nowSec: Math.floor(ms / 1000),
        vnHour: vnHour,
        isResetWindow: (vnHour === 5),
        dailyKey: dailyKey,
        weekKey: weekKey,
        dayIndex: dayIndex,
        dailyMax: dailyMax,
        openAll: openAll,
        refreshTime: refreshTime,
        weekCreateTime: Math.floor(weekStartRealMs / 1000)
    };
}

function pickWeightedTowerDrop(boxId, fallbackDropId) {
    if (typeof Config !== "undefined" && Config.box_drop && Config.box_drop[boxId]) {
        var bucket = Config.box_drop[boxId];
        var keys = Object.keys(bucket);
        if (keys.length > 0) {
            var totalWeight = 0;
            for (var i = 0; i < keys.length; i++) {
                totalWeight += Math.max(1, Number(bucket[keys[i]].weight || 1));
            }
            var roll = Math.random() * totalWeight;
            var acc = 0;
            for (var j = 0; j < keys.length; j++) {
                acc += Math.max(1, Number(bucket[keys[j]].weight || 1));
                if (roll <= acc) return Number(bucket[keys[j]].id || keys[j]);
            }
            return Number(bucket[keys[keys.length - 1]].id || keys[keys.length - 1]);
        }
    }
    return Number(fallbackDropId || 80101);
}

function getGlobalVarNumber(varName, fallbackVal) {
    var rawVal = (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar && ConfigGlobalVar[varName] !== undefined)
        ? ConfigGlobalVar[varName]
        : ((typeof Config !== "undefined" && Config.global_var && Config.global_var[varName] !== undefined)
            ? (Config.global_var[varName] && Config.global_var[varName].data !== undefined
                ? Config.global_var[varName].data
                : Config.global_var[varName])
            : undefined);
    var parsed = Number(rawVal);
    return (!isNaN(parsed) && rawVal !== undefined && rawVal !== null && rawVal !== "")
        ? parsed
        : fallbackVal;
}

function getTowerBoxCost(openedCount) {
    var boxNum = Math.min(4, Math.max(1, Number(openedCount || 0) + 1));
    var defaults = { 1: 0, 2: 100, 3: 150, 4: 200 };
    return Math.max(0, getGlobalVarNumber("TOWER_BOX_" + boxNum + "_STONE", defaults[boxNum]));
}

function buildValidTowerBotHeroIds(rawList) {
    var out = [];
    for (var i = 0; i < rawList.length; i++) {
        var hid = Number(rawList[i]);
        if (typeof Config !== "undefined" && Config.hero && !Config.hero[hid]) continue;
        if (typeof Config !== "undefined" && Config.skill && !Config.skill[hid]) continue;
        if (out.indexOf(hid) === -1) out.push(hid);
        if (out.length >= 5) break;
    }
    var fb = [10020, 10030, 10040, 10050, 10010];
    for (var j = 0; out.length < 5 && j < fb.length; j++) {
        if (out.indexOf(fb[j]) === -1) out.push(fb[j]);
    }
    return out;
}

function buildTowerKeeperHeroPayloadsForLayer(session, layer, realPlayerEntry) {
    if (realPlayerEntry && realPlayerEntry.pd) {
        var teams = resolveOtherPlayerModeTeams(session, realPlayerEntry.pd, "dark_arena", 1);
        var rHeros = [];
        for (var i = 0; i < teams[0].length; i++) {
            var hObj = teams[0][i];
            if (!hObj) continue;
            var hid = Number(hObj.hero_id || hObj.id);
            if (typeof Config !== "undefined" && Config.skill && !Config.skill[hid]) continue;
            rHeros.push(hObj);
        }
        if (rHeros.length > 0) {
            var pIcon = Number(realPlayerEntry.pd.icon || rHeros[0].hero_id || 10020);
            if (typeof Config !== "undefined" && Config.player_head && !Config.player_head[pIcon]) pIcon = 10020;
            return {
                keeper_uid: realPlayerEntry.pid,
                player_name: realPlayerEntry.pd.team_name || ("Vô Địch Kage #" + realPlayerEntry.rank),
                player_lv: Math.max(1, Number(realPlayerEntry.pd.team_lv || 1)),
                player_icon: pIcon,
                heros: rHeros
            };
        }
    }

    // Static fallback keeper scaled smoothly by floor 1..35 (capped at Lv 84 so static bots never open Bát Môn below 85)
    var kRank = Math.max(1, Math.min(35, 36 - Number(layer || 1)));
    var botTemplate = BOT_ARENA_POOL[(kRank - 1) % BOT_ARENA_POOL.length];
    var botLv = Math.min(84, Math.max(18, Math.round(16 + layer * 1.94)));
    var botQuality = Math.min(10, Math.max(2, 2 + Math.floor(layer / 4)));
    var botStar = Math.min(5, 2 + Math.floor(layer / 10));
    var rawIds = botTemplate.teams[(layer - 1) % botTemplate.teams.length];
    var heroIds = buildValidTowerBotHeroIds(rawIds);
    var botHeros = [];
    for (var bi = 0; bi < heroIds.length; bi++) {
        botHeros.push(generateCompetentHeroRecord(heroIds[bi], botLv, botQuality, botStar));
    }
    var bIcon = Number(botTemplate.icon || 10020);
    if (typeof Config !== "undefined" && Config.player_head && !Config.player_head[bIcon]) bIcon = 10020;
    return {
        keeper_uid: 0,
        player_name: (layer >= 26)
            ? ("Kage Top " + kRank + " - " + botTemplate.name)
            : ("Thủ Vệ Tầng " + layer + " - " + botTemplate.name),
        player_lv: botLv,
        player_icon: bIcon,
        heros: botHeros
    };
}

function getKageKeeperMapByLayer(session) {
    // Rule 1: Top 35 of Lôi Đài Kage guard floors 35..1 (Top 1 -> Floor 35 .. Top 10 -> Floor 26 .. Rank 35 -> Floor 1)
    var byLayer = {};
    if (typeof playerDb === "undefined" || !playerDb) return byLayer;
    var myUid = session ? session.getNumericId() : 0;
    var candidates = [];
    for (var pk in playerDb) {
        var pd = playerDb[pk];
        if (!pd || !pd.heros) continue;
        var pid = Number(pd.uid || getOrAssignUid(pk, pd));
        if (myUid && pid === myUid) continue;
        var hKeys = Object.keys(pd.heros).map(Number).filter(function (id) { return id > 0; });
        if (hKeys.length === 0) continue;
        var kRank = getOrInitPlayerModeRank(pd, "dark_arena");
        candidates.push({ key: pk, pid: pid, pd: pd, rank: kRank });
    }
    candidates.sort(function (a, b) {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.pid - b.pid;
    });

    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        var targetLayer = 36 - c.rank;
        if (targetLayer >= 1 && targetLayer <= 35 && !byLayer[targetLayer]) {
            byLayer[targetLayer] = c;
        }
    }
    return byLayer;
}

function buildOrSyncNormalTowerLayer(session, layerNum, keeperMap) {
    layerNum = Math.max(1, Math.min(35, Number(layerNum || 1)));
    var pd = session.data;
    if (!pd.tower_layers) pd.tower_layers = {};
    var existing = pd.tower_layers[layerNum];
    if (existing && Number(existing.has_pass || 0) === 1) {
        return existing;
    }

    keeperMap = keeperMap || getKageKeeperMapByLayer(session);
    var realEntry = keeperMap[layerNum] || null;
    if (!realEntry && existing && Number(existing.keeper_uid || 0) > 0 && findPlayerByIdOrUid) {
        var found = findPlayerByIdOrUid(Number(existing.keeper_uid));
        if (found && found.data) {
            realEntry = { pid: Number(existing.keeper_uid), pd: found.data, rank: getOrInitPlayerModeRank(found.data, "dark_arena") };
        }
    }

    var built = buildTowerKeeperHeroPayloadsForLayer(session, layerNum, realEntry);
    if (existing) {
        // Rule 2: Unpassed floor refreshes keeper's latest Lôi Đài Kage defense team & info
        existing.keeper_uid = built.keeper_uid;
        existing.player_name = built.player_name;
        existing.player_lv = built.player_lv;
        existing.player_icon = built.player_icon;
        existing.heros = JSON.stringify(built.heros);
        return existing;
    }

    var created = {
        player_id: session.getNumericId(),
        layer: layerNum,
        has_pass: 0,
        keeper_uid: built.keeper_uid,
        player_icon: built.player_icon,
        player_lv: built.player_lv,
        player_name: built.player_name,
        box_1_id: 0,
        box_2_id: 0,
        box_3_id: 0,
        box_4_id: 0,
        heros: JSON.stringify(built.heros)
    };
    pd.tower_layers[layerNum] = created;
    return created;
}

function ensureNormalTowerState(session, nowMs) {
    var d = session.data;
    var sched = getTowerScheduleState(nowMs, d);
    var changed = false;

    if (d.tower_week_key !== sched.weekKey) {
        d.tower_week_key = sched.weekKey;
        d.tower_daily_key = sched.dailyKey;
        d.tower_cur_layer = 1;
        d.tower_layers = {};
        d.tower_heros = {};
        if (d.tower_open_all_week && d.tower_open_all_week !== sched.weekKey) {
            delete d.tower_open_all_week;
        }
        changed = true;
    } else if (d.tower_daily_key !== sched.dailyKey) {
        // Rule 6: 05:00 daily resets player hero HP & energy while keeping floor progress
        d.tower_daily_key = sched.dailyKey;
        d.tower_heros = {};
        changed = true;
    }

    if (!d.tower_layers || typeof d.tower_layers !== "object") {
        d.tower_layers = {};
        changed = true;
    }
    if (!d.tower_heros || typeof d.tower_heros !== "object") {
        d.tower_heros = {};
        changed = true;
    }
    var cur = Math.max(1, Math.min(35, Number(d.tower_cur_layer || 1)));
    if (d.tower_cur_layer !== cur) {
        d.tower_cur_layer = cur;
        changed = true;
    }

    if (changed && typeof session.save === "function") {
        session.save();
    }
    return sched;
}

function resolveOtherPlayerModeTeams(session, pd, modeKey, teamNum) {
    var savedTeams;
    var allowUnowned = false;
    var effectiveTeams = teamNum;
    var activeTheme = (modeKey === "lim_arena") ? getActiveLimitedArenaTheme() : null;

    if (modeKey === "dark_arena") {
        savedTeams = [
            pd.dark_arena_def_1 || pd.dark_arena_lineup_1 || pd.dark_arena_atk_1,
            pd.dark_arena_def_2 || pd.dark_arena_lineup_2 || pd.dark_arena_atk_2,
            pd.dark_arena_def_3 || pd.dark_arena_lineup_3 || pd.dark_arena_atk_3
        ];
    } else if (modeKey === "cross_dark") {
        var legacyCd = pd.cross_dark_lineups || {};
        savedTeams = [
            pd.cross_dark_def_1 || legacyCd[1] || pd.cross_dark_atk_1,
            pd.cross_dark_def_2 || legacyCd[2] || pd.cross_dark_atk_2,
            pd.cross_dark_def_3 || legacyCd[3] || pd.cross_dark_atk_3
        ];
    } else if (modeKey === "lim_arena") {
        allowUnowned = true;
        var limRaw = pd.lim_arena_def_ids || pd.lim_arena_def || pd.lim_arena_atk_ids;
        var limFb = getLimitedFallbackIdsForData(session, pd, activeTheme);
        savedTeams = [sanitizeLimitedIds(limRaw, activeTheme.allowedSet, limFb, 5)];
    } else if (modeKey === "cross_arena") {
        effectiveTeams = 1;
        savedTeams = [pd.cross_arena_def_1 || pd.cross_arena_lineup || pd.cross_arena_atk_1];
    } else {
        savedTeams = [pd.arena_def_lineup || pd.arena_lineup || pd.arena_atk_lineup];
    }

    var idTeams = resolveMultiTeamLineupsForData(session, pd, savedTeams, effectiveTeams, 5, allowUnowned);
    var payloadTeams = [];
    for (var ti = 0; ti < idTeams.length; ti++) {
        var objs = [];
        for (var hi = 0; hi < idTeams[ti].length; hi++) {
            var hid = idTeams[ti][hi];
            if (activeTheme && !activeTheme.allowedSet[hid]) continue;
            if (pd.heros && pd.heros[hid]) {
                objs.push(computeOtherPlayerHeroPayload(session, pd, hid));
            } else {
                objs.push(generateCompetentHeroRecord(hid, 50, 6, 3));
            }
        }
        if (activeTheme && objs.length === 0) {
            var emergencyIds = getLimitedFallbackIdsForData(session, pd, activeTheme);
            for (var ei = 0; ei < emergencyIds.length; ei++) {
                var ehid = emergencyIds[ei];
                objs.push((pd.heros && pd.heros[ehid])
                    ? computeOtherPlayerHeroPayload(session, pd, ehid)
                    : generateCompetentHeroRecord(ehid, 50, 6, 3));
            }
        }
        payloadTeams.push(objs);
    }
    while (payloadTeams.length < teamNum) {
        payloadTeams.push(payloadTeams[0] ? payloadTeams[0].slice(0) : []);
    }
    return payloadTeams;
}

function getPlayerArenaBenchmark(session) {
    var topIds = getSortedOwnedHeroIds(session).slice(0, 5);
    var sumLv = 0, sumQ = 0, sumStar = 0, totalPower = 0;
    for (var i = 0; i < topIds.length; i++) {
        var p = session.computeHeroPayload(topIds[i]);
        sumLv += Number(p.lv || 1);
        sumQ += Number(p.quality || 1);
        sumStar += Number(p.star || 1);
        totalPower += computeArenaHeroPower(p);
    }
    var cnt = Math.max(1, topIds.length);
    return {
        avgLv: Math.max(1, Math.round(sumLv / cnt)),
        avgQuality: Math.max(1, Math.round(sumQ / cnt)),
        avgStar: Math.max(1, Math.round(sumStar / cnt)),
        teamSize: Math.max(1, Math.min(5, topIds.length)),
        totalPower: totalPower
    };
}

// Static fallback bots used ONLY when fewer than 3 real players exist in playerDb.
// Levels remain strictly below 85 so bots never open Bát Môn below Lv 85 and never scale to user data.
var BOT_ARENA_POOL = [
    { id: 900001, base_rank: 1,  lv: 84, quality: 10, star: 4, win_count: 45, name: "Itachi Uchiha",       icon: 10120, server_id: 2, teams: [[10030, 10050, 10120, 10100, 10020], [10010, 10070, 10080, 10090, 10040], [10110, 10130, 10140, 10150, 10050]] },
    { id: 900002, base_rank: 2,  lv: 80, quality: 10, star: 4, win_count: 40, name: "Hokage Đệ Tứ",        icon: 10010, server_id: 2, teams: [[10010, 10020, 10050, 10040, 10100], [10030, 10070, 10080, 10130, 10120], [10090, 10110, 10140, 10150, 10020]] },
    { id: 900003, base_rank: 3,  lv: 76, quality: 9,  star: 4, win_count: 35, name: "Naruto Hiền Nhân",    icon: 10020, server_id: 3, teams: [[10020, 10040, 10050, 10130, 10100], [10070, 10080, 10090, 10010, 10030], [10110, 10120, 10140, 10150, 10040]] },
    { id: 900004, base_rank: 4,  lv: 72, quality: 9,  star: 3, win_count: 30, name: "Sasuke Taka",         icon: 10030, server_id: 3, teams: [[10030, 10050, 10070, 10100, 10120], [10020, 10040, 10080, 10090, 10130], [10010, 10110, 10140, 10150, 10030]] },
    { id: 900005, base_rank: 5,  lv: 68, quality: 8,  star: 3, win_count: 26, name: "Kakashi Ám Bộ",       icon: 10050, server_id: 4, teams: [[10050, 10010, 10030, 10080, 10100], [10020, 10040, 10070, 10120, 10130], [10090, 10110, 10140, 10150, 10010]] },
    { id: 900006, base_rank: 6,  lv: 64, quality: 8,  star: 3, win_count: 22, name: "Rock Lee Bát Môn",    icon: 10070, server_id: 4, teams: [[10070, 10080, 10090, 10040, 10020], [10050, 10100, 10120, 10010, 10030], [10110, 10130, 10140, 10150, 10070]] },
    { id: 900007, base_rank: 7,  lv: 60, quality: 7,  star: 3, win_count: 19, name: "Neji Bạch Nhãn",      icon: 10220, server_id: 5, teams: [[10220, 10130, 10070, 10090, 10050], [10020, 10030, 10040, 10100, 10010], [10110, 10120, 10140, 10150, 10080]] },
    { id: 900008, base_rank: 8,  lv: 56, quality: 7,  star: 3, win_count: 16, name: "Shikamaru Quân Sư",   icon: 10200, server_id: 5, teams: [[10200, 10110, 10120, 10020, 10040], [10010, 10030, 10050, 10070, 10080], [10090, 10130, 10140, 10150, 10100]] },
    { id: 900009, base_rank: 9,  lv: 52, quality: 6,  star: 3, win_count: 14, name: "Hinata Byakugan",     icon: 10080, server_id: 2, teams: [[10080, 10140, 10150, 10020, 10040], [10220, 10070, 10050, 10100, 10010], [10030, 10090, 10110, 10120, 10130]] },
    { id: 900010, base_rank: 10, lv: 48, quality: 6,  star: 3, win_count: 12, name: "Sakura Bách Hào",     icon: 10040, server_id: 6, teams: [[10040, 10020, 10030, 10050, 10010], [10100, 10110, 10120, 10070, 10080], [10090, 10130, 10140, 10150, 10040]] },
    { id: 900011, base_rank: 11, lv: 44, quality: 5,  star: 2, win_count: 10, name: "Choji Điệp Ảnh",      icon: 10210, server_id: 6, teams: [[10210, 10100, 10110, 10070, 10040], [10020, 10050, 10080, 10090, 10130], [10010, 10030, 10140, 10150, 10120]] },
    { id: 900012, base_rank: 12, lv: 40, quality: 5,  star: 2, win_count: 8,  name: "Kiba Nha Thông Nha",  icon: 10270, server_id: 3, teams: [[10270, 10130, 10150, 10070, 10030], [10020, 10040, 10050, 10080, 10100], [10010, 10090, 10110, 10120, 10140]] },
    { id: 900013, base_rank: 13, lv: 35, quality: 4,  star: 2, win_count: 6,  name: "Shino Khống Trùng",   icon: 10230, server_id: 4, teams: [[10230, 10130, 10140, 10100, 10050], [10010, 10020, 10030, 10040, 10070], [10080, 10090, 10110, 10120, 10150]] },
    { id: 900014, base_rank: 14, lv: 30, quality: 4,  star: 2, win_count: 4,  name: "Tenten Nhẫn Cụ",      icon: 10250, server_id: 5, teams: [[10250, 10070, 10080, 10050, 10020], [10030, 10040, 10100, 10120, 10130], [10010, 10110, 10140, 10150, 10090]] },
    { id: 900015, base_rank: 15, lv: 25, quality: 3,  star: 2, win_count: 2,  name: "Ino Tâm Chuyển",      icon: 10390, server_id: 6, teams: [[10390, 10100, 10120, 10040, 10050], [10020, 10030, 10070, 10080, 10090], [10010, 10130, 10140, 10150, 10110]] }
];

var _cachedMatchups = {};
var _matchRotationCursor = {};

function sanitizeHeroIds(idList, maxLen) {
    var out = [];
    for (var i = 0; i < idList.length; i++) {
        var hid = Number(idList[i]);
        if (typeof Config !== "undefined" && Config.hero && !Config.hero[hid]) continue;
        if (out.indexOf(hid) === -1) out.push(hid);
        if (out.length >= maxLen) break;
    }
    var fallback = [10010, 10020, 10030, 10040, 10050];
    for (var j = 0; out.length < maxLen && j < fallback.length; j++) {
        if (out.indexOf(fallback[j]) === -1) out.push(fallback[j]);
    }
    return out;
}

function buildStaticBotMatchup(bot, modeKey, teamNum, isCross) {
    var activeTheme = (modeKey === "lim_arena") ? getActiveLimitedArenaTheme() : null;
    var bTeams = [];
    for (var tm = 0; tm < teamNum; tm++) {
        var templateIds;
        if (activeTheme && activeTheme.allowedIds.length > 0) {
            templateIds = [];
            var startShift = ((Number(bot.base_rank || 1) - 1) * 3 + tm * 5) % activeTheme.allowedIds.length;
            for (var ai = 0; ai < 5 && ai < activeTheme.allowedIds.length; ai++) {
                templateIds.push(activeTheme.allowedIds[(startShift + ai) % activeTheme.allowedIds.length]);
            }
        } else {
            templateIds = sanitizeHeroIds(bot.teams[tm % bot.teams.length], 5);
        }
        var hObjs = [];
        for (var th = 0; th < templateIds.length; th++) {
            hObjs.push(generateCompetentHeroRecord(templateIds[th], bot.lv, bot.quality, bot.star));
        }
        bTeams.push(hObjs);
    }
    var bIcon = Number(bot.icon || 10020);
    if (typeof Config !== "undefined" && Config.player_head && !Config.player_head[bIcon]) bIcon = 10020;
    return {
        isReal: false,
        rank: bot.base_rank,
        fighter_id: bot.id,
        player_id: bot.id,
        server_id: isCross ? bot.server_id : 1,
        player_name: bot.name,
        player_lv: bot.lv,
        icon: bIcon,
        fight_value: calcArenaTeamPower(bTeams[0]),
        win_count: bot.win_count,
        team_num: teamNum,
        teams: bTeams,
        def_heros: bTeams[0]
    };
}

function buildOpponentMatchups(session, modeKey, myRank, teamNum, opts) {
    opts = opts || {};
    var meta = getArenaModeMeta(modeKey);
    teamNum = Math.max(1, Number(teamNum || meta.teamNum || 1));
    var count = Number(opts.count || 3);
    var rotate = !!opts.rotate;
    var uid = session.getNumericId();
    var cacheKey = uid + "_" + modeKey;
    myRank = Math.max(1, Number(myRank || 50));

    if (!rotate && _cachedMatchups[cacheKey] && _cachedMatchups[cacheKey].length >= count) {
        return _cachedMatchups[cacheKey];
    }

    var prevIds = [];
    var prevRanks = {};
    if (_cachedMatchups[cacheKey]) {
        for (var pi = 0; pi < _cachedMatchups[cacheKey].length; pi++) {
            prevIds.push(Number(_cachedMatchups[cacheKey][pi].fighter_id || _cachedMatchups[cacheKey][pi].player_id));
            prevRanks[Number(_cachedMatchups[cacheKey][pi].rank || 0)] = true;
        }
    }

    // Collect all eligible real players (excluding self)
    var realByRank = [];
    if (opts.includePlayers !== false && playerDb) {
        for (var key in playerDb) {
            var pd = playerDb[key];
            if (!pd || !pd.heros) continue;
            var rPid = Number(pd.uid || getOrAssignUid(key, pd));
            if (rPid === uid) continue;
            var hKeys = Object.keys(pd.heros).map(Number).filter(function (id) { return id > 0; });
            if (hKeys.length === 0) continue;
            var pRank = getOrInitPlayerModeRank(pd, modeKey);
            realByRank.push({
                key: key,
                pd: pd,
                pid: rPid,
                pLv: Math.max(1, Number(pd.team_lv || 1)),
                rank: pRank
            });
        }
    }

    // Build 3 rank bands strictly higher than myRank (top 33%, 33%-66%, 66%-99% of ranks < myRank)
    var bands = [];
    if (myRank >= 5) {
        var totalBetter = myRank - 1;
        var b1End = Math.max(1, Math.floor(totalBetter * 0.33));
        var b2Start = b1End + 1;
        var b2End = Math.max(b2Start, Math.floor(totalBetter * 0.66));
        var b3Start = b2End + 1;
        var b3End = Math.max(b3Start, totalBetter);
        bands.push([1, b1End]);
        bands.push([b2Start, b2End]);
        bands.push([b3Start, b3End]);
    } else if (myRank === 4) {
        bands.push([1, 1], [2, 2], [3, 3]);
    } else if (myRank === 3) {
        bands.push([1, 1], [2, 2], [4, 4]);
    } else if (myRank === 2) {
        bands.push([1, 1], [3, 3], [4, 4]);
    } else {
        // myRank === 1: pick 3 opponents right below rank 1
        bands.push([2, 3], [4, 6], [7, 10]);
    }

    var results = [];
    var usedIds = {};
    var usedRanks = {};

    function pickRandomFrom(arr, filterPrevFn) {
        if (!arr || arr.length === 0) return null;
        var fresh = typeof filterPrevFn === "function" ? arr.filter(filterPrevFn) : arr;
        var pool = (rotate && fresh.length > 0) ? fresh : arr;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    for (var bi = 0; bi < bands.length && results.length < count; bi++) {
        var lo = bands[bi][0];
        var hi = bands[bi][1];

        // 1. Check real players whose rank falls in [lo, hi]
        var realInBand = realByRank.filter(function (c) {
            return c.rank >= lo && c.rank <= hi && !usedIds[c.pid] && !usedRanks[c.rank];
        });
        var pickedReal = pickRandomFrom(realInBand, function (c) { return prevIds.indexOf(c.pid) === -1; });
        if (pickedReal) {
            usedIds[pickedReal.pid] = true;
            usedRanks[pickedReal.rank] = true;
            var rTeams = resolveOtherPlayerModeTeams(session, pickedReal.pd, modeKey, teamNum);
            var rIcon = Number(pickedReal.pd.icon || 10020);
            if (typeof Config !== "undefined" && Config.player_head && !Config.player_head[rIcon]) rIcon = 10020;
            var totalDefPow = 0;
            for (var pt = 0; pt < rTeams.length; pt++) totalDefPow += calcArenaTeamPower(rTeams[pt]);

            results.push({
                isReal: true,
                playerKey: pickedReal.key,
                rank: pickedReal.rank,
                fighter_id: pickedReal.pid,
                player_id: pickedReal.pid,
                server_id: Number(pickedReal.pd.server_id || 1),
                player_name: pickedReal.pd.team_name || ("Nhẫn Giả #" + pickedReal.pid),
                player_lv: pickedReal.pLv,
                icon: rIcon,
                fight_value: totalDefPow || calcArenaTeamPower(rTeams[0]),
                win_count: Number(pickedReal.pd[meta.winField] || 0),
                team_num: teamNum,
                teams: rTeams,
                def_heros: rTeams[0]
            });
            continue;
        }

        // 2. Pick a random rank in [lo, hi] and build a bot at that target rank
        var candidateRanks = [];
        for (var r = lo; r <= hi; r++) {
            if (!usedRanks[r]) candidateRanks.push(r);
        }
        var targetRank = pickRandomFrom(candidateRanks, function (rVal) { return !prevRanks[rVal]; });
        if (!targetRank) targetRank = lo;
        usedRanks[targetRank] = true;

        var botCandidates = BOT_ARENA_POOL.filter(function (b) { return !usedIds[b.id]; });
        var pickedBot = pickRandomFrom(botCandidates, function (b) { return prevIds.indexOf(b.id) === -1; }) || BOT_ARENA_POOL[bi % BOT_ARENA_POOL.length];
        var botMatchup = buildStaticBotMatchup(pickedBot, modeKey, teamNum, !!opts.isCross);
        botMatchup.rank = targetRank;
        if (usedIds[botMatchup.fighter_id]) {
            botMatchup.fighter_id = 90000 + targetRank;
            botMatchup.player_id = botMatchup.fighter_id;
        }
        usedIds[botMatchup.fighter_id] = true;
        results.push(botMatchup);
    }

    results.sort(function (a, b) { return Number(a.rank || 0) - Number(b.rank || 0); });
    _cachedMatchups[cacheKey] = results;
    return results;
}

function findCachedOpponent(session, modeKey, targetId) {
    targetId = Number(targetId);
    var uid = session.getNumericId();
    var cacheKey = uid + "_" + modeKey;
    var list = _cachedMatchups[cacheKey] || [];
    for (var i = 0; i < list.length; i++) {
        if (Number(list[i].fighter_id) === targetId || Number(list[i].player_id) === targetId) {
            return list[i];
        }
    }
    return list[0] || null;
}

function buildArenaPlayerRankPayload(session, myRank, opts) {
    opts = opts || {};
    var myName = session.data.team_name || "Nhẫn Giả";
    var myLv = Number(session.data.team_lv || 1);
    var myIcon = Number(session.data.icon || 10020);
    if (typeof Config !== "undefined" && Config.player_head && !Config.player_head[myIcon]) myIcon = 10020;
    var uid = session.getNumericId();
    return {
        rank: Number(myRank || 1),
        icon: myIcon,
        win_count: Number(opts.winCount || 0),
        player_lv: myLv,
        player_name: myName,
        player_id: uid,
        fighter_id: uid,
        server_id: Number(session.data.server_id || 1),
        fight_value: Number(opts.fightValue || 0)
    };
}

function summarizeHistoryHeros(heroList) {
    if (!Array.isArray(heroList)) return "[]";
    var out = [];
    for (var i = 0; i < heroList.length; i++) {
        var h = heroList[i];
        if (!h) continue;
        var lv = Number(h.lv || h.level || 1);
        out.push({
            id: Number(h.id || h.hero_id || 10010),
            hero_id: Number(h.hero_id || h.id || 10010),
            lv: lv,
            quality: Number(h.quality || 1),
            star: Number(h.star || 1),
            has_awake: Number(h.has_awake || 0),
            bagate_level: lv < 85 ? 0 : Number(h.bagate_level || 0),
            beast: Number(h.beast || 0)
        });
    }
    return JSON.stringify(out);
}

function generateHistoryId() {
    var base = Math.floor((Date.now() % 180000000000) / 100);
    return base + Math.floor(Math.random() * 100);
}

function applyRankSwapAndRecordHistory(modeKey, atkSession, oppMatch, info) {
    var meta = getArenaModeMeta(modeKey);
    var nowSec = info.nowSec || Math.floor(Date.now() / 1000);
    var atkData = atkSession.data;
    var atkUid = atkSession.getNumericId();
    var atkIcon = Number(atkData.icon || 10020);
    if (typeof Config !== "undefined" && Config.player_head && !Config.player_head[atkIcon]) atkIcon = 10020;

    var oldAtkRank = getOrInitPlayerModeRank(atkData, modeKey);
    var isWin = info.isWin ? 1 : 0;
    var newAtkRank = oldAtkRank;
    var rankChange = 0;

    var defUid = oppMatch ? Number(oppMatch.player_id || oppMatch.fighter_id || 0) : 0;
    var defEntry = (defUid > 0 && findPlayerByIdOrUid) ? findPlayerByIdOrUid(defUid) : null;
    if (defEntry && defEntry.data && Number(defEntry.data.uid) === atkUid) {
        defEntry = null;
    }

    var oppRank = (oppMatch && Number(oppMatch.rank || 0) > 0) ? Number(oppMatch.rank) : 0;
    if (defEntry && defEntry.data) {
        oppRank = getOrInitPlayerModeRank(defEntry.data, modeKey);
    }

    if (isWin === 1) {
        if (oppRank > 0 && oppRank < oldAtkRank) {
            newAtkRank = oppRank;
            rankChange = oldAtkRank - newAtkRank;
            if (defEntry && defEntry.data) {
                defEntry.data[meta.rankField] = oldAtkRank;
            }
        } else if (!defEntry && oldAtkRank > 1 && !(oppMatch && oppMatch.isReal)) {
            newAtkRank = Math.max(1, oldAtkRank - 1);
            rankChange = oldAtkRank - newAtkRank;
        }
        atkData[meta.rankField] = newAtkRank;
        delete _cachedMatchups[atkUid + "_" + modeKey];
    }

    var defName = (defEntry && defEntry.data && defEntry.data.team_name)
        || (oppMatch && oppMatch.player_name)
        || "Đối Thủ";
    var defLv = (defEntry && defEntry.data && Number(defEntry.data.team_lv || 0))
        || (oppMatch && Number(oppMatch.player_lv || 0))
        || 20;
    var defIcon = (defEntry && defEntry.data && Number(defEntry.data.icon || 0))
        || (oppMatch && Number(oppMatch.icon || 0))
        || 10020;
    if (typeof Config !== "undefined" && Config.player_head && !Config.player_head[defIcon]) defIcon = 10020;
    var defServerId = (defEntry && defEntry.data && Number(defEntry.data.server_id || 1))
        || (oppMatch && Number(oppMatch.server_id || 1))
        || 1;
    var defWinCount = (defEntry && defEntry.data && Number(defEntry.data[meta.winField] || 0))
        || (oppMatch && Number(oppMatch.win_count || 0))
        || 0;

    var atkTeams = Array.isArray(info.atkTeams) ? info.atkTeams : [];
    var defTeams = Array.isArray(info.defTeams) ? info.defTeams : [];
    var roundReplays = Array.isArray(info.roundReplays) ? info.roundReplays : [];
    var roundWins = Array.isArray(info.roundWins) ? info.roundWins : [isWin === 1];

    var historyId = generateHistoryId();
    storeArenaReplay(historyId, atkUid, defUid, isWin, roundReplays[0] || "", roundReplays);

    var atkH1 = summarizeHistoryHeros(atkTeams[0] || []);
    var atkH2 = summarizeHistoryHeros(atkTeams[1] || []);
    var atkH3 = summarizeHistoryHeros(atkTeams[2] || []);
    var defH1 = summarizeHistoryHeros(defTeams[0] || []);
    var defH2 = summarizeHistoryHeros(defTeams[1] || []);
    var defH3 = summarizeHistoryHeros(defTeams[2] || []);

    var roundFlag = function (idx) {
        if (idx < roundWins.length) return roundWins[idx] ? 1 : 2;
        return 3;
    };

    var baseEntry = {
        id: historyId,
        atk_id: atkUid,
        atk_name: atkData.team_name || "Nhẫn Giả",
        atk_lv: Number(atkData.team_lv || 1),
        atk_icon: atkIcon,
        atk_server_id: Number(atkData.server_id || 1),
        atk_win_count: Number(atkData[meta.winField] || 0),
        def_id: defUid,
        def_name: defName,
        def_lv: defLv,
        def_icon: defIcon,
        def_server_id: defServerId,
        def_win_count: defWinCount,
        is_atk_win: isWin === 1 ? 1 : 2,
        is_atk_win_1: roundFlag(0),
        is_atk_win_2: roundFlag(1),
        is_atk_win_3: roundFlag(2),
        is_atk_win_4: 3,
        is_atk_win_5: 3,
        is_atk_win_6: 3,
        is_atk_win_7: 3,
        rank_change: rankChange,
        score_change: Number(info.scoreChange || 0),
        create_time: nowSec,
        fight_time: nowSec,
        time: nowSec,
        atk_heros: atkH1,
        atk_heros_1: atkH1,
        atk_heros_2: atkH2,
        atk_heros_3: atkH3,
        def_heros: defH1,
        def_heros_1: defH1,
        def_heros_2: defH2,
        def_heros_3: defH3
    };

    var isLimitedMode = (modeKey === "lim_arena");
    var histDayKey = isLimitedMode ? getTodayDateKey() : undefined;
    var atkEntry = Object.assign({}, baseEntry, {
        is_win: isWin,
        viewer_is_attacker: 1,
        viewer_is_win: isWin,
        viewer_rank_change: isWin === 1 ? rankChange : 0,
        target_name: defName,
        fighter_id: defUid,
        server_id: defServerId
    });
    if (isLimitedMode) {
        atkEntry.day = histDayKey;
        atkEntry.result = {
            isWin: isWin,
            newRank: newAtkRank,
            seed: Number(info.seed || 0),
            fight_data: roundReplays[0] || ""
        };
    }
    if (!Array.isArray(atkData[meta.historyField])) atkData[meta.historyField] = [];
    atkData[meta.historyField].unshift(atkEntry);
    if (atkData[meta.historyField].length > 20) atkData[meta.historyField].length = 20;

    if (defEntry && defEntry.data) {
        var defWinFlag = isWin === 1 ? 0 : 1;
        var defNewRank = Number(defEntry.data[meta.rankField] || oppRank || 0);
        var defEntryRecord = Object.assign({}, baseEntry, {
            is_win: defWinFlag,
            viewer_is_attacker: 0,
            viewer_is_win: defWinFlag,
            viewer_rank_change: isWin === 1 ? -rankChange : 0,
            target_name: atkData.team_name || "Nhẫn Giả",
            fighter_id: atkUid,
            server_id: Number(atkData.server_id || 1)
        });
        if (isLimitedMode) {
            defEntryRecord.day = histDayKey;
            defEntryRecord.result = {
                isWin: defWinFlag,
                newRank: defNewRank,
                seed: Number(info.seed || 0),
                fight_data: roundReplays[0] || ""
            };
        }
        if (!Array.isArray(defEntry.data[meta.historyField])) defEntry.data[meta.historyField] = [];
        defEntry.data[meta.historyField].unshift(defEntryRecord);
        if (defEntry.data[meta.historyField].length > 20) defEntry.data[meta.historyField].length = 20;
        if (markDirty) markDirty(defEntry.key);
        if (saveDb) saveDb();
    }

    return {
        historyId: historyId,
        newRank: newAtkRank,
        rankChange: rankChange
    };
}

function resolveHistoryReplay(session, replayId, roundIdx) {
    roundIdx = Math.max(1, Math.min(3, Number(roundIdx || 1)));
    var rep = getArenaReplay(replayId);
    if (rep) {
        var stored = rep["fight_data_" + roundIdx] || rep.fight_data || "";
        if (stored && stored !== "{}") return stored;
    }

    // Fallback: synthesize from stored history team snapshots if replay expired or server restarted
    var d = session && session.data ? session.data : {};
    var hKeys = ["arena_history", "dark_arena_history", "lim_arena_history", "cross_arena_history", "cross_dark_history"];
    for (var k = 0; k < hKeys.length; k++) {
        var list = d[hKeys[k]];
        if (!Array.isArray(list)) continue;
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (!item || String(item.id) !== String(replayId)) continue;
            try {
                var atkRaw = JSON.parse(item["atk_heros_" + roundIdx] || item.atk_heros || "[]");
                var defRaw = JSON.parse(item["def_heros_" + roundIdx] || item.def_heros || "[]");
                if (atkRaw.length > 0 && defRaw.length > 0) {
                    var buildList = function (arr) {
                        return arr.map(function (h) {
                            return generateCompetentHeroRecord(h.hero_id || h.id || 10010, h.lv || 20, h.quality || 1, h.star || 1);
                        });
                    };
                    var sim = simulateArenaBattle(buildList(atkRaw), buildList(defRaw), Number(replayId) || 123456);
                    var synth = JSON.stringify(sim.replay);
                    storeArenaReplay(replayId, item.atk_id || 0, item.def_id || 0, Number(item["is_atk_win_" + roundIdx] || item.is_atk_win) === 1, synth);
                    return synth;
                }
            } catch (e) { }
        }
    }
    return "";
}

function buildLeaderboardEntries(session, modeKey) {
    var meta = getArenaModeMeta(modeKey);
    var uid = session.getNumericId();
    var isMulti = (meta.teamNum >= 3);
    var entries = [];
    var usedPids = {};
    var takenRanks = {};

    var pushEntry = function (obj) {
        var r = Math.max(1, Number(obj.rank || 1));
        while (takenRanks[r]) r++;
        takenRanks[r] = true;
        obj.rank = r;
        entries.push(obj);
    };

    // 1. Add all real players from playerDb (including current player)
    if (playerDb) {
        for (var key in playerDb) {
            var pd = playerDb[key];
            if (!pd || !pd.heros) continue;
            var pUid = Number(pd.uid || getOrAssignUid(key, pd));
            if (usedPids[pUid]) continue;
            usedPids[pUid] = true;
            var teams = resolveOtherPlayerModeTeams(session, pd, modeKey, isMulti ? 3 : 1);
            var pow = 0;
            for (var ti = 0; ti < teams.length; ti++) pow += calcArenaTeamPower(teams[ti]);
            var icon = Number(pd.icon || 10020);
            if (typeof Config !== "undefined" && Config.player_head && !Config.player_head[icon]) icon = 10020;
            pushEntry({
                fighter_id: pUid,
                player_id: pUid,
                player_name: pd.team_name || ("Nhẫn Giả #" + pUid),
                player_lv: Math.max(1, Number(pd.team_lv || 1)),
                icon: icon,
                rank: getOrInitPlayerModeRank(pd, modeKey),
                win_count: Number(pd[meta.winField] || 0),
                fight_value: pow,
                server_id: Number(pd.server_id || 1),
                def_heros: JSON.stringify(teams[0] || []),
                def_heros_1: JSON.stringify(teams[0] || []),
                def_heros_2: JSON.stringify(teams[1] || teams[0] || []),
                def_heros_3: JSON.stringify(teams[2] || teams[0] || [])
            });
        }
    }

    // Always ensure current session player is present even in isolated offline tests
    if (!usedPids[uid]) {
        usedPids[uid] = true;
        var myTeams = resolveOtherPlayerModeTeams(session, session.data, modeKey, isMulti ? 3 : 1);
        var myPow = 0;
        for (var mt = 0; mt < myTeams.length; mt++) myPow += calcArenaTeamPower(myTeams[mt]);
        var myPayload = buildArenaPlayerRankPayload(session, getOrInitPlayerModeRank(session.data, modeKey), {
            winCount: Number(session.data[meta.winField] || 0),
            fightValue: myPow
        });
        myPayload.def_heros = JSON.stringify(myTeams[0] || []);
        myPayload.def_heros_1 = JSON.stringify(myTeams[0] || []);
        myPayload.def_heros_2 = JSON.stringify(myTeams[1] || myTeams[0] || []);
        myPayload.def_heros_3 = JSON.stringify(myTeams[2] || myTeams[0] || []);
        pushEntry(myPayload);
    }

    // 2. Include static bots in open rank slots
    for (var bi = 0; bi < BOT_ARENA_POOL.length; bi++) {
        var bot = BOT_ARENA_POOL[bi];
        if (takenRanks[bot.base_rank]) continue;
        var bm = buildStaticBotMatchup(bot, modeKey, isMulti ? 3 : 1, modeKey.indexOf("cross_") === 0);
        pushEntry({
            fighter_id: bm.fighter_id,
            player_id: bm.player_id,
            player_name: bm.player_name,
            player_lv: bm.player_lv,
            icon: bm.icon,
            rank: bm.rank,
            win_count: bm.win_count,
            fight_value: bm.fight_value,
            server_id: bm.server_id,
            def_heros: JSON.stringify(bm.teams[0] || []),
            def_heros_1: JSON.stringify(bm.teams[0] || []),
            def_heros_2: JSON.stringify(bm.teams[1] || bm.teams[0] || []),
            def_heros_3: JSON.stringify(bm.teams[2] || bm.teams[0] || [])
        });
    }

    entries.sort(function (a, b) { return Number(a.rank || 999) - Number(b.rank || 999); });
    return entries;
}

function simulateArenaBattle(atkHeros, defHeros, seed) {
    seed = (seed !== undefined && seed !== null) ? Number(seed) : Math.floor(Math.random() * 900000) + 100000;
    if (typeof battleSimulator.simulateBattleFromHeroes === "function") {
        return battleSimulator.simulateBattleFromHeroes(atkHeros, defHeros, seed);
    }
    var pw = new PackageWriter();
    pw.appendShort(0);
    pw.appendByte(0);
    pw.appendByte(atkHeros.length);
    for (var i = 0; i < atkHeros.length; i++) {
        writeHeroToBuffer(pw, i + 1, atkHeros[i]);
    }
    pw.appendByte(defHeros.length);
    for (var j = 0; j < defHeros.length; j++) {
        writeHeroToBuffer(pw, 6 + j, defHeros[j]);
    }
    pw.appendByte(0);
    var bmStr = pw.getPackage().join(",");
    return battleSimulator.simulateBattleFromBm(bmStr, seed);
}

function generateBattleReplayJson(atkHeros, defHeros, isWin, durationSec, seed) {
    seed = (seed !== undefined && seed !== null) ? Number(seed) : Math.floor(Math.random() * 1000000) + 1;
    durationSec = Math.max(8, durationSec || 12);
    var maxframetime = durationSec * 1000;

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
    var replayObj = {
        bm: bmStr,
        result: !!isWin,
        seed: seed,
        arena_protocol: 2,
        maxframetime: maxframetime,
        d: {}
    };

    var aplace = [
        { x: 430, y: 150 },
        { x: 335, y: 75 },
        { x: 240, y: 150 },
        { x: 145, y: 75 },
        { x: 50, y: 150 }
    ];
    var dplace = [
        { x: 1490, y: 151 },
        { x: 1585, y: 76 },
        { x: 1675, y: 151 },
        { x: 1770, y: 76 },
        { x: 1865, y: 151 }
    ];

    var atkUnits = [];
    for (var i = 0; i < atkHeros.length; i++) {
        var hEntry = atkHeros[i];
        var hid = (typeof hEntry === "object" && hEntry) ? Number(hEntry.id || hEntry.hero_id) : Number(hEntry);
        var heroHp = (typeof hEntry === "object" && hEntry && (hEntry.hp || hEntry.maxhp)) ? Number(hEntry.hp || hEntry.maxhp) : 100000;
        var startPt = aplace[i] || { x: 300 + i * 35, y: 120 + (i % 3) * 35 };
        var targetX = 850 - (i % 3) * 40;

        // Chọn kỹ năng hợp lệ có animation
        var castableSkills = [hid]; // Basic attack always has animation
        if (typeof Config !== "undefined" && Config.hero && Config.hero[hid]) {
            var hCfg = Config.hero[hid];
            for (var k = 1; k <= 3; k++) {
                var skid = hCfg["skill_id_" + k] || hCfg["skill_" + k];
                if (skid && Config.skillEffect && Config.skillEffect[skid] && Config.skillEffect[skid].index > 0) {
                    castableSkills.push(skid);
                }
            }
        }

        atkUnits.push({
            id: 1000 + i,
            hid: hid,
            castableSkills: castableSkills,
            startX: startPt.x,
            startY: startPt.y,
            targetX: targetX,
            x: startPt.x,
            y: startPt.y,
            hp: heroHp,
            maxHp: heroHp,
            mp: 100,
            dmgTotal: 0
        });
    }

    var defUnits = [];
    for (var j = 0; j < defHeros.length; j++) {
        var hEntry = defHeros[j];
        var hid = (typeof hEntry === "object" && hEntry) ? Number(hEntry.id || hEntry.hero_id) : Number(hEntry);
        var heroHp = (typeof hEntry === "object" && hEntry && (hEntry.hp || hEntry.maxhp)) ? Number(hEntry.hp || hEntry.maxhp) : 100000;
        var startPt = dplace[j] || { x: 1650 - j * 35, y: 120 + (j % 3) * 35 };
        var targetX = 1080 + (j % 3) * 40;

        var castableSkills = [hid];
        if (typeof Config !== "undefined" && Config.hero && Config.hero[hid]) {
            var hCfg = Config.hero[hid];
            for (var k = 1; k <= 3; k++) {
                var skid = hCfg["skill_id_" + k] || hCfg["skill_" + k];
                if (skid && Config.skillEffect && Config.skillEffect[skid] && Config.skillEffect[skid].index > 0) {
                    castableSkills.push(skid);
                }
            }
        }

        defUnits.push({
            id: 2000 + j,
            hid: hid,
            castableSkills: castableSkills,
            startX: startPt.x,
            startY: startPt.y,
            targetX: targetX,
            x: startPt.x,
            y: startPt.y,
            hp: heroHp,
            maxHp: heroHp,
            mp: 100,
            dmgTotal: 0
        });
    }

    // Frame 0: Vị trí xuất phát ban đầu chuẩn aplace & dplace
    var pMap0 = {};
    for (var i = 0; i < atkUnits.length; i++) {
        var u = atkUnits[i];
        pMap0[String(u.id)] = [0, 1, Math.round(u.hp), Math.round(u.mp), u.startX, u.startY];
    }
    for (var j = 0; j < defUnits.length; j++) {
        var u = defUnits[j];
        pMap0[String(u.id)] = [0, -1, Math.round(u.hp), Math.round(u.mp), u.startX, u.startY];
    }
    replayObj["0"] = { p: pMap0 };

    var clashTime = 1600; // ms để hai bên di chuyển vào vị trí giao chiến
    for (var t = 16; t <= maxframetime; t += 16) {
        var pMap = {};
        var eList = [];

        var moveProgress = Math.min(1.0, t / clashTime);
        for (var i = 0; i < atkUnits.length; i++) {
            var u = atkUnits[i];
            if (u.hp > 0) {
                u.x = Math.round(u.startX + (u.targetX - u.startX) * moveProgress);
                var isMoving = (t < clashTime) ? 1 : 0;
                pMap[String(u.id)] = [isMoving, 1, Math.round(u.hp), Math.round(u.mp), u.x, u.y];
            } else {
                pMap[String(u.id)] = [0, 1, 0, 0, u.x, u.y];
            }
        }
        for (var j = 0; j < defUnits.length; j++) {
            var u = defUnits[j];
            if (u.hp > 0) {
                u.x = Math.round(u.startX + (u.targetX - u.startX) * moveProgress);
                var isMoving = (t < clashTime) ? 1 : 0;
                pMap[String(u.id)] = [isMoving, -1, Math.round(u.hp), Math.round(u.mp), u.x, u.y];
            } else {
                pMap[String(u.id)] = [0, -1, 0, 0, u.x, u.y];
            }
        }

        // Đánh nhau định kỳ sau khi chạm trán (mỗi 400ms)
        if (t >= clashTime && (t % 400 === 0) && t < maxframetime - 1200) {
            var livingAtk = atkUnits.filter(function (u) { return u.hp > 0; });
            var livingDef = defUnits.filter(function (u) { return u.hp > 0; });

            if (livingAtk.length > 0 && livingDef.length > 0) {
                var aUnit = livingAtk[Math.floor(Math.random() * livingAtk.length)];
                var dUnit = livingDef[0];

                var aSkillId = aUnit.castableSkills[Math.floor(Math.random() * aUnit.castableSkills.length)];
                var aDmg = Math.floor(Math.random() * 4000) + 5000;
                dUnit.hp = Math.max(0, dUnit.hp - aDmg);
                aUnit.dmgTotal += aDmg;
                aUnit.mp = Math.min(1000, aUnit.mp + 150);

                eList.push([
                    "__b4", // onCast
                    aUnit.id,
                    0,
                    aSkillId,
                    dUnit.id,
                    dUnit.x,
                    dUnit.y,
                    0
                ]);

                eList.push([
                    "__b1", // onHurt
                    dUnit.id,
                    0,
                    dUnit.id,
                    dUnit.x,
                    dUnit.y,
                    aSkillId,
                    aDmg, 0, 0, 0,
                    0, 0, 0, 0,
                    0, 0, 0, 0
                ]);

                if (dUnit.hp > 0 && (!isWin || Math.random() < 0.6)) {
                    var dSkillId = dUnit.castableSkills[Math.floor(Math.random() * dUnit.castableSkills.length)];
                    var dDmg = Math.floor(Math.random() * 2500) + 2000;
                    var targetAtk = livingAtk[0];
                    if (!isWin) {
                        targetAtk.hp = Math.max(0, targetAtk.hp - dDmg * 2);
                    } else {
                        targetAtk.hp = Math.max(1000, targetAtk.hp - dDmg);
                    }
                    dUnit.dmgTotal += dDmg;
                    dUnit.mp = Math.min(1000, dUnit.mp + 100);

                    eList.push([
                        "__b4",
                        dUnit.id,
                        0,
                        dSkillId,
                        targetAtk.id,
                        targetAtk.x,
                        targetAtk.y,
                        0
                    ]);

                    eList.push([
                        "__b1",
                        targetAtk.id,
                        0,
                        targetAtk.id,
                        targetAtk.x,
                        targetAtk.y,
                        dSkillId,
                        dDmg, 0, 0, 0,
                        0, 0, 0, 0,
                        0, 0, 0, 0
                    ]);
                }
            }
        }

        if (t >= maxframetime - 1500) {
            if (isWin) {
                defUnits.forEach(function (u) { u.hp = 0; });
            } else {
                atkUnits.forEach(function (u) { u.hp = 0; });
            }
        }

        var frameObj = { p: pMap };
        if (eList.length > 0) frameObj.e = eList;
        replayObj[String(t)] = frameObj;
    }

    for (var i = 0; i < atkUnits.length; i++) {
        replayObj.d[String(atkUnits[i].id)] = Math.max(10000, atkUnits[i].dmgTotal);
    }
    for (var j = 0; j < defUnits.length; j++) {
        replayObj.d[String(defUnits[j].id)] = Math.max(5000, defUnits[j].dmgTotal);
    }

    return JSON.stringify(replayObj);
}

const ArenaAndTowerHandler = {
    handleArenaAndTowerCommand: function (cmd, params, respond, queuePush) {
        var self = this;

        if (cmd === SVRCMD.BeforeNoEndTowerFight) {
            var diff = Number((params && params[1]) || 10);
            this.data.last_noend_diff = diff;
            respond({ sign: "NOEND_" + diff, seed: 123456789, difficulty: diff });
            return true;
        }

        // 1. Tháp Mất Tích & Tháp Vô Tận (LostTowerView.js, NOEndTowerView.js)
        if (cmd === SVRCMD.PlayerTowerInfo || cmd === SVRCMD.GetTowerLayer || cmd === SVRCMD.ResetTower || cmd === SVRCMD.ResetTowerEx) {
            var sched = ensureNormalTowerState(this);
            if (cmd === SVRCMD.ResetTower || cmd === SVRCMD.ResetTowerEx) {
                this.data.tower_cur_layer = 1;
                this.data.tower_layers = {};
                this.data.tower_heros = {};
                this.save();
            }
            var curLayer = Math.max(1, Math.min(35, Number(this.data.tower_cur_layer || 1)));
            var reqLayer = (cmd === SVRCMD.GetTowerLayer && params && params[0] !== undefined)
                ? Math.max(1, Math.min(35, Number(params[0])))
                : curLayer;

            var keeperMap = getKageKeeperMapByLayer(this);
            var reqLayerObj = buildOrSyncNormalTowerLayer(this, reqLayer, keeperMap);
            if (reqLayer !== curLayer) {
                buildOrSyncNormalTowerLayer(this, curLayer, keeperMap);
            }
            this.save();

            respond({
                max: sched.dailyMax,
                refreshTime: sched.refreshTime,
                tower: {
                    player_id: this.getNumericId(),
                    create_time: sched.weekCreateTime,
                    cur_layer: curLayer,
                    heros: JSON.stringify(this.data.tower_heros || {})
                },
                layer: reqLayerObj
            });
            return true;
        }

        if (cmd === SVRCMD.CheckTowerTime) {
            var checkSched = ensureNormalTowerState(this);
            if (checkSched.isResetWindow && !this.data.tower_bypass_reset_window) {
                return respond({}, {
                    code: 45007,
                    msg: "Tháp Mất Tích đang trong thời gian làm mới (05:00 - 06:00 VN)!"
                }), true;
            }
            var checkLayer = Math.max(1, Math.min(35, Number(this.data.tower_cur_layer || 1)));
            if (checkLayer > checkSched.dailyMax) {
                return respond({}, {
                    code: 45015,
                    msg: "Tầng " + checkLayer + " chưa mở hôm nay (" + checkSched.dailyMax + "/35)! Mỗi ngày lúc 05:00 mở thêm 5 tầng."
                }), true;
            }
            var curLayerData = this.data.tower_layers && this.data.tower_layers[checkLayer];
            if (checkLayer === 35 && curLayerData && Number(curLayerData.has_pass || 0) === 1) {
                return respond({}, {
                    code: 45015,
                    msg: "Bạn đã chinh phục hoàn toàn 35 tầng Tháp tuần này!"
                }), true;
            }
            buildOrSyncNormalTowerLayer(this, checkLayer);
            this.save();
            respond({});
            return true;
        }

        if (cmd === SVRCMD.AfterTowerFight) {
            ensureNormalTowerState(this);
            var rawHeroObj = (params && params[1] !== undefined) ? params[1] : {};
            if (typeof rawHeroObj === "string") {
                try { rawHeroObj = JSON.parse(rawHeroObj) || {}; } catch (e) { rawHeroObj = {}; }
            }
            if (!this.data.tower_heros || typeof this.data.tower_heros !== "object") {
                this.data.tower_heros = {};
            }
            if (rawHeroObj && typeof rawHeroObj === "object") {
                for (var hKey in rawHeroObj) {
                    if (Object.prototype.hasOwnProperty.call(rawHeroObj, hKey)) {
                        this.data.tower_heros[hKey] = rawHeroObj[hKey];
                    }
                }
            }

            var curLayer = Math.max(1, Math.min(35, Number(this.data.tower_cur_layer || 1)));
            var afterKeepers = getKageKeeperMapByLayer(this);
            var curLData = buildOrSyncNormalTowerLayer(this, curLayer, afterKeepers);
            var alreadyPassed = (Number(curLData.has_pass || 0) === 1);
            curLData.has_pass = 1;

            var towerCfg = (typeof Config !== "undefined" && Config.tower && Config.tower[curLayer])
                ? Config.tower[curLayer]
                : null;
            var boxId1 = towerCfg ? Number(towerCfg.box_id_1 || 82001) : 82001;
            var boxId2 = towerCfg ? Number(towerCfg.box_id_2 || 82002) : 82002;
            var boxId3 = towerCfg ? Number(towerCfg.box_id_3 || 82003) : 82003;
            var boxId4 = towerCfg ? Number(towerCfg.box_id_4 || 82003) : 82003;

            if (!alreadyPassed) {
                if (!curLData.box_1_id || curLData.box_1_id === 0) curLData.box_1_id = pickWeightedTowerDrop(boxId1, 80101);
                if (!curLData.box_2_id || curLData.box_2_id === 0) curLData.box_2_id = pickWeightedTowerDrop(boxId2, 80201);
                if (!curLData.box_3_id || curLData.box_3_id === 0) curLData.box_3_id = pickWeightedTowerDrop(boxId3, 80301);
                if (!curLData.box_4_id || curLData.box_4_id === 0) curLData.box_4_id = pickWeightedTowerDrop(boxId4, 80302);
            }

            if (curLayer < 35) {
                var nextLayer = curLayer + 1;
                this.data.tower_cur_layer = nextLayer;
                buildOrSyncNormalTowerLayer(this, nextLayer, afterKeepers);
            }

            if (!this.data.daily_counts) this.data.daily_counts = {};
            this.data.daily_counts["PLAYER_DIALY_TASK_9"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_9"] || 0) + 1;
            this.save();
            respond({ status: 1 });
            return true;
        }

        if (cmd === SVRCMD.OpenTowerBox) {
            ensureNormalTowerState(this);
            var curFrontLayer = Math.max(1, Math.min(35, Number(this.data.tower_cur_layer || 1)));
            var targetLayer = (params && params[0] !== undefined && Number(params[0]) > 0)
                ? Math.max(1, Math.min(35, Number(params[0])))
                : ((this.data.tower_layers[curFrontLayer] && Number(this.data.tower_layers[curFrontLayer].has_pass || 0) === 1)
                    ? curFrontLayer
                    : Math.max(1, curFrontLayer - 1));

            var lData = this.data.tower_layers ? this.data.tower_layers[targetLayer] : null;
            if (!lData || Number(lData.has_pass || 0) !== 1) {
                return respond({}, { code: 45004, msg: "Tầng này chưa vượt qua, không thể mở rương!" }), true;
            }

            var openedCount = 0;
            var firstAvailableSlot = 0;
            for (var bi = 1; bi <= 4; bi++) {
                var bVal = Number(lData["box_" + bi + "_id"] || 0);
                if (bVal <= 0) openedCount++;
                else if (!firstAvailableSlot) firstAvailableSlot = bi;
            }
            if (openedCount >= 4 || !firstAvailableSlot) {
                return respond({}, { code: 45004, msg: "Bạn đã mở hết 4 rương của tầng này!" }), true;
            }

            var reqSlot = (params && params[1] !== undefined) ? Number(params[1]) : 0;
            var boxIndex = (reqSlot >= 1 && reqSlot <= 4 && Number(lData["box_" + reqSlot + "_id"] || 0) > 0)
                ? reqSlot
                : firstAvailableSlot;
            var chosenKey = Number(lData["box_" + boxIndex + "_id"]);

            var boxCost = getTowerBoxCost(openedCount);
            if (boxCost > 0) {
                if (!this.canDeductStone(boxCost)) {
                    return respond({}, { code: 1, msg: "Không đủ " + boxCost + " Kim Cương để mở rương!" }), true;
                }
                this.deductStone(boxCost, queuePush);
            }

            lData["box_" + boxIndex + "_id"] = 0;

            if (this.data.tower_cur_layer < 35 && this.data.tower_cur_layer <= targetLayer) {
                this.data.tower_cur_layer = targetLayer + 1;
            }

            var bdItem = (typeof Config !== "undefined" && Config.box_drop_item && Config.box_drop_item[chosenKey]) ? Config.box_drop_item[chosenKey] : null;
            var itemData = null;
            if (bdItem) {
                // Rule 8 / LostTowerRewardBoxItem: reward shown and granted is 2x base drop amount
                var doubledDrop = Object.assign({}, bdItem, {
                    amount: Math.max(1, Number(bdItem.amount || 1)) * 2
                });
                var granted = this.grantBoxDropReward(doubledDrop, queuePush);
                itemData = granted || {
                    type: Number(doubledDrop.type || 1),
                    item_id: Number(doubledDrop.item_id || 10030),
                    amount: Number(doubledDrop.amount || 2)
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
            var waveIdx = Math.max(1, Number((params && params[0]) || 1));
            if (!this.data.expedition_picked) this.data.expedition_picked = {};
            this.data.expedition_picked[waveIdx] = 1;
            if (cmd === SVRCMD.SweepNinja) {
                this.data.daily_counts["PLAYER_DIALY_TASK_11"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_11"] || 0) + 1;
            }

            var chapterId = (curDiff === 4) ? 60015 : (60000 + ((waveIdx - 1) % 15) + 1);
            var diffMult = (curDiff === 4) ? Math.max(3, Math.floor((1 + waveIdx / 10) * 3)) : Math.max(1, curDiff);
            var rewardItems = [];

            if (typeof Config !== "undefined" && Config.chapter_box && Config.chapter_box[chapterId] && Config.box_drop) {
                var cbGroup = Config.chapter_box[chapterId];
                var boxKeys = Object.keys(cbGroup).sort(function (a, b) { return Number(a) - Number(b); });
                for (var bi = 0; bi < boxKeys.length; bi++) {
                    var boxId = Number(cbGroup[boxKeys[bi]].box_id || boxKeys[bi]);
                    var dropMap = Config.box_drop[boxId];
                    if (!dropMap) continue;
                    var validDrops = [];
                    for (var dk in dropMap) {
                        var dr = dropMap[dk];
                        if (!dr) continue;
                        var dt = Number(dr.type || 1);
                        var did = Number(dr.item_id || 0);
                        if (dt === 2 && (!Config.equip || !Config.equip[did])) continue;
                        if ((dt === 1 || dt === 6 || dt === 7) && (!Config.item || !Config.item[did])) continue;
                        if (dt === 3 && (!Config.hero || !Config.hero[did])) continue;
                        validDrops.push(dr);
                    }
                    if (validDrops.length === 0) continue;
                    var picked = validDrops[Math.floor(Math.random() * validDrops.length)];
                    var dType = Number(picked.type || 1);
                    var dItemId = Number(picked.item_id || 0);
                    var dAmt = Math.max(1, Number(picked.amount || 1));
                    if (dType === 4 || dType === 8) {
                        dAmt = Math.floor(dAmt * diffMult);
                    } else if (curDiff === 4) {
                        dAmt = dAmt * 2;
                    }
                    this.grantBoxDropReward({ type: dType, item_id: dItemId, amount: dAmt }, queuePush);
                    rewardItems.push({ box_id: boxId, type: dType, item_id: dItemId, amount: dAmt });
                }
            }

            if (rewardItems.length === 0) {
                var fallbackGold = 50000 * waveIdx * diffMult;
                var fallbackPts = 50 * waveIdx * diffMult;
                this.addGold(fallbackGold, queuePush);
                this.addCurrency(8, fallbackPts, queuePush);
                rewardItems.push(
                    { box_id: 60000 + waveIdx * 10 + 1, type: 4, item_id: 0, amount: fallbackGold },
                    { box_id: 60000 + waveIdx * 10 + 4, type: 8, item_id: 0, amount: fallbackPts }
                );
            }

            this.save();
            respond({ items: rewardItems });
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
            var activeTheme = getActiveLimitedArenaTheme();
            var todayKey = resetDailyArenaCountersIfNeeded(this.data, "lim_arena");
            var allowedHeroIds = [];
            var heroesList = [];

            // Prioritize player's owned heroes within this week's allowed theme first, then trial allowed heroes
            var ownedAllowed = [];
            var trialAllowed = [];
            for (var ai = 0; ai < activeTheme.allowedIds.length; ai++) {
                var aHid = activeTheme.allowedIds[ai];
                var hCfg = (typeof Config !== "undefined" && Config.hero && Config.hero[aHid]) ? Config.hero[aHid] : null;
                var ownRec = (this.data.heros && this.data.heros[aHid]) ? this.data.heros[aHid] : null;
                var entryObj = {
                    id: aHid,
                    name: hCfg ? hCfg.name : ("Ninja " + aHid),
                    quality: ownRec ? (ownRec.quality || 1) : 1,
                    star: ownRec ? (ownRec.star || 1) : 1,
                    type: hCfg ? hCfg.type : 1,
                    owned: !!ownRec
                };
                if (ownRec) ownedAllowed.push(entryObj);
                else trialAllowed.push(entryObj);
            }
            var combinedPool = ownedAllowed.concat(trialAllowed);
            for (var ci = 0; ci < combinedPool.length; ci++) {
                allowedHeroIds.push(combinedPool[ci].id);
                heroesList.push(combinedPool[ci]);
            }

            var limFallbackIds = getLimitedFallbackIdsForData(this, this.data, activeTheme);
            var rawOldDef = (Array.isArray(this.data.lim_arena_def_ids) && this.data.lim_arena_def_ids.length > 0)
                ? this.data.lim_arena_def_ids
                : parseHeroIdInput(this.data.lim_arena_def);
            var cleanDefIds = sanitizeLimitedIds(rawOldDef, activeTheme.allowedSet, limFallbackIds, 5);
            var stateChanged = false;
            if (!Array.isArray(this.data.lim_arena_def_ids) || this.data.lim_arena_def_ids.join(",") !== cleanDefIds.join(",")) {
                this.data.lim_arena_def_ids = cleanDefIds;
                stateChanged = true;
            }

            var rawOldAtk = (Array.isArray(this.data.lim_arena_atk_ids) && this.data.lim_arena_atk_ids.length > 0)
                ? this.data.lim_arena_atk_ids
                : parseHeroIdInput(this.data.lim_arena_atk);
            var cleanAtkIds = sanitizeLimitedIds(rawOldAtk, activeTheme.allowedSet, cleanDefIds, 5);
            if (!Array.isArray(this.data.lim_arena_atk_ids) || this.data.lim_arena_atk_ids.join(",") !== cleanAtkIds.join(",")) {
                this.data.lim_arena_atk_ids = cleanAtkIds;
                stateChanged = true;
            }

            if (cmd === "LimitedArenaLineup" && params && params.length >= 2) {
                var side = String(params[0]);
                var submittedIds = parseHeroIdInput(params[1]).slice(0, 5);
                var bannedId = 0;
                for (var si = 0; si < submittedIds.length; si++) {
                    if (!activeTheme.allowedSet[submittedIds[si]]) {
                        bannedId = submittedIds[si];
                        break;
                    }
                }
                if (bannedId > 0) {
                    var banCfg = (typeof Config !== "undefined" && Config.hero && Config.hero[bannedId]) ? Config.hero[bannedId] : null;
                    var banName = banCfg ? banCfg.name : ("#" + bannedId);
                    return respond({}, {
                        code: 1,
                        msg: "Ninja " + banName + " bị cấm trong " + activeTheme.name + "!"
                    }), true;
                }
                if (submittedIds.length === 0) {
                    return respond({}, { code: 1, msg: "Đội hình phải có ít nhất 1 Ninja hợp lệ!" }), true;
                }
                if (side === "defense") this.data.lim_arena_def_ids = submittedIds;
                else this.data.lim_arena_atk_ids = submittedIds;
                stateChanged = true;
            }

            var nowSec = Math.floor(Date.now() / 1000);
            var lastFightSec = Number(this.data.lim_arena_last_fight_time || 0);
            var cooldownSec = lastFightSec > 0 ? Math.max(0, 600 - (nowSec - lastFightSec)) : 0;
            var buyCount = Number(this.data.lim_arena_buy_count || 0);
            var buyLimit = 15;
            var clearCost = 50;
            var buyPrice = 50;

            if (cmd === "LimitedArenaClearCD") {
                if (cooldownSec > 0) {
                    if (!this.canDeductStone(clearCost)) {
                        return respond({}, { code: 1, msg: "Không đủ Kim Cương để xóa hồi chiêu!" }), true;
                    }
                    this.deductStone(clearCost, queuePush);
                    this.data.lim_arena_last_fight_time = 0;
                    lastFightSec = 0;
                    cooldownSec = 0;
                    stateChanged = true;
                }
            } else if (cmd === "LimitedArenaBuyFights") {
                if (buyCount >= buyLimit) {
                    return respond({}, { code: 1, msg: "Đã đạt giới hạn mua lượt hôm nay!" }), true;
                }
                if (!this.canDeductStone(buyPrice)) {
                    return respond({}, { code: 1, msg: "Không đủ Kim Cương để mua lượt!" }), true;
                }
                this.deductStone(buyPrice, queuePush);
                buyCount += 1;
                this.data.lim_arena_buy_count = buyCount;
                stateChanged = true;
            }

            var buildLimTeam = function (idArr) {
                var arr = [];
                for (var idx = 0; idx < idArr.length; idx++) {
                    var tid = Number(idArr[idx]);
                    if (!activeTheme.allowedSet[tid]) continue;
                    if (self.data.heros[tid]) arr.push(self.computeHeroPayload(tid));
                    else arr.push(generateCompetentHeroRecord(tid, 50, 6, 3));
                }
                return arr;
            };
            this.data.lim_arena_def = buildLimTeam(this.data.lim_arena_def_ids);
            this.data.lim_arena_atk = buildLimTeam(this.data.lim_arena_atk_ids);
            var limRank = getOrInitPlayerModeRank(this.data, "lim_arena");
            if (stateChanged) this.save();

            var limCacheKey = this.getNumericId() + "_lim_arena";
            var cachedLimList = _cachedMatchups[limCacheKey];
            var needCacheRebuild = !cachedLimList || cachedLimList._limRev !== activeTheme.revision || cachedLimList._limWeek !== activeTheme.weekKey;
            var opponents = buildOpponentMatchups(this, "lim_arena", limRank, 1, { rotate: needCacheRebuild });
            opponents._limRev = activeTheme.revision;
            opponents._limWeek = activeTheme.weekKey;

            var dailyFights = 5 + buyCount * 5;
            var fightCount = Number(this.data.lim_arena_fight_count || 0);

            respond({
                day: todayKey,
                periodKey: activeTheme.weekKey,
                resetMode: "daily",
                revision: activeTheme.revision,
                themeId: activeTheme.id,
                themeKey: activeTheme.key,
                themeName: activeTheme.name,
                themeDesc: activeTheme.description,
                heroIds: allowedHeroIds,
                heroes: heroesList,
                rank: limRank,
                winCount: Number(this.data.lim_arena_wins || 0),
                fightCount: fightCount,
                dailyFights: dailyFights,
                baseDailyFights: 5,
                buyCount: buyCount,
                buyLimit: buyLimit,
                buyPrice: buyPrice,
                buyFights: 5,
                buyAvailable: buyCount < buyLimit,
                clearCooldownCost: clearCost,
                cooldown: 600,
                cooldownRemaining: cooldownSec,
                lastFightTime: lastFightSec,
                appleRewardAt: "00:00 UTC+7",
                appleRewardRule: "[" + activeTheme.name + "] Chỉ dùng " + allowedHeroIds.length + " Ninja hợp lệ. Đấu >= 3 trận/ngày nhận Táo lúc 00:00 UTC+7",
                exchangeHint: "Sự kiện Đổi Thưởng: 100 Táo = 1 Key Vàng",
                attack: this.data.lim_arena_atk,
                defense: this.data.lim_arena_def,
                attackPower: calcArenaTeamPower(this.data.lim_arena_atk),
                defensePower: calcArenaTeamPower(this.data.lim_arena_def),
                opponents: opponents,
                history: Array.isArray(this.data.lim_arena_history) ? this.data.lim_arena_history : []
            });
            return true;
        }

        if (cmd === "LimitedArenaOpponents") {
            var activeOppTheme = getActiveLimitedArenaTheme();
            var todayOppKey = resetDailyArenaCountersIfNeeded(this.data, "lim_arena");
            var oppRank = getOrInitPlayerModeRank(this.data, "lim_arena");
            var rotatedOpponents = buildOpponentMatchups(this, "lim_arena", oppRank, 1, { rotate: true });
            rotatedOpponents._limRev = activeOppTheme.revision;
            rotatedOpponents._limWeek = activeOppTheme.weekKey;
            respond({
                day: todayOppKey,
                revision: activeOppTheme.revision,
                themeId: activeOppTheme.id,
                themeKey: activeOppTheme.key,
                themeName: activeOppTheme.name,
                fighters: rotatedOpponents
            });
            return true;
        }

        if (cmd === "LimitedArenaFight") {
            var activeFightTheme = getActiveLimitedArenaTheme();
            var todayFightKey = resetDailyArenaCountersIfNeeded(this.data, "lim_arena");
            var curFights = Number(this.data.lim_arena_fight_count || 0);
            var curBuys = Number(this.data.lim_arena_buy_count || 0);
            var maxDailyFights = 5 + curBuys * 5;
            if (curFights >= maxDailyFights) {
                return respond({}, { code: 1, msg: "Đã hết lượt khiêu chiến Đấu Trường Giới Hạn hôm nay!" }), true;
            }
            var nowFightSec = Math.floor(Date.now() / 1000);
            var prevFightSec = Number(this.data.lim_arena_last_fight_time || 0);
            if (prevFightSec > 0 && (nowFightSec - prevFightSec) < 600) {
                var waitSec = 600 - (nowFightSec - prevFightSec);
                return respond({}, { code: 1, msg: "Đang hồi chiêu (" + waitSec + "s). Hãy dùng Xóa CD hoặc chờ!" }), true;
            }

            var fightFallbackIds = getLimitedFallbackIdsForData(this, this.data, activeFightTheme);
            var savedAtkIds = sanitizeLimitedIds(
                (Array.isArray(this.data.lim_arena_atk_ids) && this.data.lim_arena_atk_ids.length > 0)
                    ? this.data.lim_arena_atk_ids
                    : this.data.lim_arena_atk,
                activeFightTheme.allowedSet,
                fightFallbackIds,
                5
            );
            this.data.lim_arena_atk_ids = savedAtkIds;
            var atkHeros = savedAtkIds.slice(0, 5).map(function (hid) {
                return self.data.heros[hid]
                    ? self.computeHeroPayload(hid)
                    : generateCompetentHeroRecord(hid, 50, 6, 3);
            });

            var limTargetId = (params && params[0] !== undefined) ? Number(params[0]) : 0;
            var cachedOpp = findCachedOpponent(this, "lim_arena", limTargetId);
            var cachedHasBanned = false;
            if (cachedOpp && Array.isArray(cachedOpp.def_heros)) {
                for (var ci = 0; ci < cachedOpp.def_heros.length; ci++) {
                    var chid = Number(cachedOpp.def_heros[ci].hero_id || cachedOpp.def_heros[ci].id || 0);
                    if (!activeFightTheme.allowedSet[chid]) {
                        cachedHasBanned = true;
                        break;
                    }
                }
            } else {
                cachedHasBanned = true;
            }
            if (!cachedOpp || cachedHasBanned) {
                var freshOpps = buildOpponentMatchups(this, "lim_arena", getOrInitPlayerModeRank(this.data, "lim_arena"), 1, { rotate: true });
                freshOpps._limRev = activeFightTheme.revision;
                freshOpps._limWeek = activeFightTheme.weekKey;
                cachedOpp = findCachedOpponent(this, "lim_arena", limTargetId) || freshOpps[0];
            }
            var defHeros = [];
            if (cachedOpp && Array.isArray(cachedOpp.def_heros)) {
                for (var di = 0; di < cachedOpp.def_heros.length; di++) {
                    var dh = cachedOpp.def_heros[di];
                    var dhid = Number(dh.hero_id || dh.id || 0);
                    if (activeFightTheme.allowedSet[dhid]) defHeros.push(dh);
                }
            }
            if (defHeros.length === 0) {
                var emergDefIds = activeFightTheme.allowedIds.slice(0, 5);
                for (var edi = 0; edi < emergDefIds.length; edi++) {
                    defHeros.push(generateCompetentHeroRecord(emergDefIds[edi], 50, 6, 3));
                }
            }

            var limSeed = Math.floor(Math.random() * 900000) + 100000;
            var sim = simulateArenaBattle(atkHeros, defHeros, limSeed);
            var isWin = sim.isWin ? 1 : 0;
            this.data.lim_arena_fight_count = curFights + 1;
            this.data.lim_arena_last_fight_time = nowFightSec;

            if (isWin === 1) {
                this.data.lim_arena_wins = Number(this.data.lim_arena_wins || 0) + 1;
                this.changeItemAmount(10150, 50, queuePush);
            }

            var limReplayStr = JSON.stringify(sim.replay);
            var limHistRes = applyRankSwapAndRecordHistory("lim_arena", this, cachedOpp, {
                nowSec: nowFightSec,
                isWin: isWin,
                seed: limSeed,
                atkTeams: [atkHeros],
                defTeams: [defHeros],
                roundReplays: [limReplayStr],
                roundWins: [!!sim.isWin]
            });

            this.save();
            respond({
                day: todayFightKey,
                revision: activeFightTheme.revision,
                themeId: activeFightTheme.id,
                themeKey: activeFightTheme.key,
                themeName: activeFightTheme.name,
                isWin: isWin,
                newRank: limHistRes.newRank,
                rankChange: limHistRes.rankChange,
                replayId: limHistRes.historyId,
                fightCount: Number(this.data.lim_arena_fight_count || 0),
                dailyFights: maxDailyFights,
                cooldown: 600,
                lastFightTime: nowFightSec,
                seed: limSeed,
                reward: isWin === 1 ? { items: [{ type: 1, item_id: 10150, amount: 50 }] } : {},
                fight_data: limReplayStr
            });
            return true;
        }

        if (cmd === "LimitedArenaRank" || cmd === "LimitedArenaHistory") {
            var activeRankTheme = getActiveLimitedArenaTheme();
            var todayRankKey = resetDailyArenaCountersIfNeeded(this.data, "lim_arena");
            var limLeaderboard = buildLeaderboardEntries(this, "lim_arena").slice(0, 30);
            respond({
                day: todayRankKey,
                revision: activeRankTheme.revision,
                themeId: activeRankTheme.id,
                themeKey: activeRankTheme.key,
                themeName: activeRankTheme.name,
                ranks: limLeaderboard,
                history: Array.isArray(this.data.lim_arena_history) ? this.data.lim_arena_history : []
            });
            return true;
        }

        // 4. Đấu Trường & Lôi Đài Ám Bộ (ArenaInfo, DarkArenaInfo, MatchFighters, ArenaFight, etc.)
        if (cmd === SVRCMD.ArenaInfo) {
            resetDailyArenaCountersIfNeeded(this.data, "arena");
            var defaultTop = getSortedOwnedHeroIds(this).slice(0, 5);
            var defIds = resolveHeroIdList(this, this.data.arena_def_lineup || this.data.arena_lineup, 5, defaultTop);
            var atkIds = resolveHeroIdList(this, this.data.arena_atk_lineup || this.data.arena_lineup, 5, defIds);
            this.data.arena_def_lineup = defIds.join(",");
            this.data.arena_atk_lineup = atkIds.join(",");

            var defHerosArr = defIds.map(function (hid) { return self.computeHeroPayload(hid); });
            var atkHerosArr = atkIds.map(function (hid) { return self.computeHeroPayload(hid); });
            var arenaRankNum = getOrInitPlayerModeRank(this.data, "arena");
            var rankBase = buildArenaPlayerRankPayload(this, arenaRankNum, {
                winCount: Number(this.data.arena_win_count || 0),
                fightValue: calcArenaTeamPower(defHerosArr)
            });
            rankBase.atk_heros = JSON.stringify(atkHerosArr);
            rankBase.def_heros = JSON.stringify(defHerosArr);

            respond({
                rank: rankBase,
                lastFightTime: Number(this.data.arena_last_fight_time || 0),
                fightCount: Number(this.data.arena_fight_count || 0),
                buyCount: Number(this.data.daily_counts["PLAYER_GOODS2_COUNT_ID_3001"] || 0)
            });
            return true;
        }

        if (cmd === SVRCMD.MatchFighters || cmd === SVRCMD.MatcDarkhFighters) {
            var isDarkMatch = (cmd === SVRCMD.MatcDarkhFighters);
            var modeKey = isDarkMatch ? "dark_arena" : "arena";
            var matchRank = getOrInitPlayerModeRank(this.data, modeKey);
            var matchups = buildOpponentMatchups(this, modeKey, matchRank, isDarkMatch ? 3 : 1, { rotate: true });

            var formatted = matchups.map(function (m) {
                var t1 = m.teams[0] || [];
                var t2 = m.teams[1] || t1;
                var t3 = m.teams[2] || t1;
                return {
                    rank: m.rank,
                    icon: m.icon,
                    win_count: m.win_count,
                    player_lv: m.player_lv,
                    player_name: m.player_name,
                    player_id: m.player_id,
                    fighter_id: m.fighter_id,
                    fight_value: m.fight_value,
                    server_id: m.server_id || 1,
                    def_heros: JSON.stringify(t1),
                    def_heros_1: JSON.stringify(t1),
                    def_heros_2: JSON.stringify(t2),
                    def_heros_3: JSON.stringify(t3)
                };
            });

            if (isDarkMatch) {
                respond(formatted);
            } else {
                var respObj = {};
                for (var fi = 0; fi < formatted.length; fi++) {
                    respObj[String(formatted[fi].rank)] = formatted[fi];
                }
                respond(respObj);
            }
            return true;
        }

        if (cmd === SVRCMD.PlayerArenaInfo || cmd === SVRCMD.PlayerDarkArenaInfo) {
            var isDarkInspect = (cmd === SVRCMD.PlayerDarkArenaInfo);
            var inspectMode = isDarkInspect ? "dark_arena" : "arena";
            var fId = Number((params && params[0]) || 0);
            var targetOpp = findCachedOpponent(this, inspectMode, fId);
            if (!targetOpp) {
                var genOpps = buildOpponentMatchups(
                    this,
                    inspectMode,
                    getOrInitPlayerModeRank(this.data, inspectMode),
                    isDarkInspect ? 3 : 1,
                    { rotate: false }
                );
                targetOpp = findCachedOpponent(this, inspectMode, fId) || genOpps[0];
            }
            var tArr1 = (targetOpp && targetOpp.teams && targetOpp.teams[0]) ? targetOpp.teams[0] : [];
            var tArr2 = (targetOpp && targetOpp.teams && targetOpp.teams[1]) ? targetOpp.teams[1] : tArr1;
            var tArr3 = (targetOpp && targetOpp.teams && targetOpp.teams[2]) ? targetOpp.teams[2] : tArr1;

            respond({
                player_id: targetOpp ? targetOpp.player_id : fId,
                fighter_id: targetOpp ? targetOpp.fighter_id : fId,
                server_id: (targetOpp && targetOpp.server_id) || 1,
                team_num: isDarkInspect ? 3 : 1,
                win_count: (targetOpp && targetOpp.win_count) || 0,
                rank: (targetOpp && targetOpp.rank) || 15,
                player_name: (targetOpp && targetOpp.player_name) || ("Thủ Vệ " + fId),
                player_lv: (targetOpp && targetOpp.player_lv) || Number(this.data.team_lv || 20),
                icon: (targetOpp && targetOpp.icon) || 10020,
                fight_value: (targetOpp && targetOpp.fight_value) || calcArenaTeamPower(tArr1),
                def_heros: JSON.stringify(tArr1),
                def_heros_1: JSON.stringify(tArr1),
                def_heros_2: JSON.stringify(tArr2),
                def_heros_3: JSON.stringify(tArr3)
            });
            return true;
        }

        if (cmd === SVRCMD.SetArenaLineup || cmd === SVRCMD.SetDarkArenaLineup || cmd === SVRCMD.ClearArenaFightCD || cmd === SVRCMD.ClearDarkArenaFightCD || cmd === SVRCMD.BuyArenaFightNum || cmd === SVRCMD.BuyDarkArenaFightNum) {
            if (cmd === SVRCMD.SetArenaLineup) {
                var aTeamType = (params && params[0] !== undefined) ? Number(params[0]) : 1;
                var aIds = resolveHeroIdList(this, params ? params[1] : "", 5);
                var aStr = aIds.join(",");
                if (aTeamType === 2) {
                    this.data.arena_def_lineup = aStr;
                } else {
                    this.data.arena_atk_lineup = aStr;
                }
                this.data.arena_lineup = aStr;
                this.save();
            } else if (cmd === SVRCMD.SetDarkArenaLineup) {
                var dTeamType = (params && params[0] !== undefined) ? Number(params[0]) : 2;
                var ownMap = this.data.heros || {};
                var cleanTeamStr = function (raw) {
                    return parseHeroIdInput(raw).filter(function (id) { return !!ownMap[id]; }).slice(0, 5).join(",");
                };
                var ds1 = (params && params.length >= 2) ? cleanTeamStr(params[1]) : "";
                var ds2 = (params && params.length >= 3) ? cleanTeamStr(params[2]) : "";
                var ds3 = (params && params.length >= 4) ? cleanTeamStr(params[3]) : "";
                if (dTeamType === 1) {
                    this.data.dark_arena_atk_1 = ds1;
                    this.data.dark_arena_atk_2 = ds2;
                    this.data.dark_arena_atk_3 = ds3;
                } else {
                    this.data.dark_arena_def_1 = ds1;
                    this.data.dark_arena_def_2 = ds2;
                    this.data.dark_arena_def_3 = ds3;
                    this.data.dark_arena_lineup_1 = ds1;
                    this.data.dark_arena_lineup_2 = ds2;
                    this.data.dark_arena_lineup_3 = ds3;
                }
                this.save();
            } else if (cmd === SVRCMD.ClearArenaFightCD || cmd === SVRCMD.ClearDarkArenaFightCD) {
                var isDarkCD = (cmd === SVRCMD.ClearDarkArenaFightCD);
                var cdVarName = isDarkCD ? "DARK_ARENA_CD_COST_STONE" : "ARENA_CD_COST_STONE";
                var cdCost = (typeof Config !== "undefined" && Config.global_var && Config.global_var[cdVarName])
                    ? Number(Config.global_var[cdVarName])
                    : 50;
                if (cdCost > 0) {
                    if (!this.canDeductStone(cdCost)) {
                        return respond({}, { code: 1, msg: "Không đủ Kim Cương để xóa hồi chiêu!" }), true;
                    }
                    this.deductStone(cdCost, queuePush);
                }
                if (isDarkCD) this.data.dark_arena_last_fight_time = 0;
                else this.data.arena_last_fight_time = 0;
                this.save();
            } else if (cmd === SVRCMD.BuyArenaFightNum || cmd === SVRCMD.BuyDarkArenaFightNum) {
                var isDarkBuy = (cmd === SVRCMD.BuyDarkArenaFightNum);
                var buyStoneCost = 50;
                if (!this.canDeductStone(buyStoneCost)) {
                    return respond({}, { code: 1, msg: "Không đủ Kim Cương để mua lượt!" }), true;
                }
                this.deductStone(buyStoneCost, queuePush);
                if (isDarkBuy) {
                    this.data.dark_arena_fight_count = 0;
                    this.data.daily_counts["PLAYER_GOODS2_COUNT_ID_12001"] = Number(this.data.daily_counts["PLAYER_GOODS2_COUNT_ID_12001"] || 0) + 1;
                } else {
                    this.data.arena_fight_count = 0;
                    this.data.daily_counts["PLAYER_GOODS2_COUNT_ID_3001"] = Number(this.data.daily_counts["PLAYER_GOODS2_COUNT_ID_3001"] || 0) + 1;
                }
                this.save();
            }
            respond({ status: 1 });
            return true;
        }

        if (cmd === SVRCMD.ArenaFight || cmd === SVRCMD.DarkArenaFight) {
            var isDarkFight = (cmd === SVRCMD.DarkArenaFight);
            var fightModeKey = isDarkFight ? "dark_arena" : "arena";
            resetDailyArenaCountersIfNeeded(this.data, fightModeKey);

            var targetFighterId = Number((params && params[0]) || 0);
            var reqId = (params && params[4]) ? String(params[4]) : "";
            var nowFightTs = Math.floor(Date.now() / 1000);

            var oppMatch = findCachedOpponent(this, fightModeKey, targetFighterId);
            if (!oppMatch) {
                var fallbackOpps = buildOpponentMatchups(
                    this,
                    fightModeKey,
                    getOrInitPlayerModeRank(this.data, fightModeKey),
                    isDarkFight ? 3 : 1,
                    { rotate: false }
                );
                oppMatch = findCachedOpponent(this, fightModeKey, targetFighterId) || fallbackOpps[0];
            }

            var defHeros1 = (oppMatch && oppMatch.teams && oppMatch.teams[0]) ? oppMatch.teams[0] : [];
            var defHeros2 = (oppMatch && oppMatch.teams && oppMatch.teams[1]) ? oppMatch.teams[1] : defHeros1;
            var defHeros3 = (oppMatch && oppMatch.teams && oppMatch.teams[2]) ? oppMatch.teams[2] : defHeros1;

            if (isDarkFight) {
                var hasDarkAtk = (
                    this.data.dark_arena_atk_1 !== undefined ||
                    this.data.dark_arena_atk_2 !== undefined ||
                    this.data.dark_arena_atk_3 !== undefined
                );
                var dTeamsIds = hasDarkAtk
                    ? resolveMultiTeamLineups(this, [this.data.dark_arena_atk_1, this.data.dark_arena_atk_2, this.data.dark_arena_atk_3], 3, 5)
                    : resolveMultiTeamLineups(this, [
                        this.data.dark_arena_def_1 || this.data.dark_arena_lineup_1,
                        this.data.dark_arena_def_2 || this.data.dark_arena_lineup_2,
                        this.data.dark_arena_def_3 || this.data.dark_arena_lineup_3
                    ], 3, 5);
                var atk1 = dTeamsIds[0].map(function (hid) { return self.computeHeroPayload(hid); });
                var atk2 = dTeamsIds[1].map(function (hid) { return self.computeHeroPayload(hid); });
                var atk3 = dTeamsIds[2].map(function (hid) { return self.computeHeroPayload(hid); });

                var sim1 = atk1.length > 0 ? simulateArenaBattle(atk1, defHeros1, 1001 + Math.floor(Math.random() * 10000)) : { isWin: false, replay: "" };
                var sim2 = atk2.length > 0 ? simulateArenaBattle(atk2, defHeros2, 2001 + Math.floor(Math.random() * 10000)) : { isWin: false, replay: "" };
                var sim3 = atk3.length > 0 ? simulateArenaBattle(atk3, defHeros3, 3001 + Math.floor(Math.random() * 10000)) : { isWin: false, replay: "" };
                var winCount = (sim1.isWin ? 1 : 0) + (sim2.isWin ? 1 : 0) + (sim3.isWin ? 1 : 0);
                var darkIsWin = winCount >= 2 ? 1 : 0;

                this.data.dark_arena_fight_count = Number(this.data.dark_arena_fight_count || 0) + 1;
                this.data.dark_arena_last_fight_time = nowFightTs;
                this.data.total_dark_arena_fights = Number(this.data.total_dark_arena_fights || 0) + 1;
                this.data.daily_counts["PLAYER_DIALY_TASK_8"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_8"] || 0) + 1;

                if (darkIsWin === 1) {
                    this.data.dark_arena_win_count = Number(this.data.dark_arena_win_count || 0) + 1;
                    this.addStone(100, queuePush);
                    this.addCurrency(10, 200, queuePush);
                }

                var fData1 = sim1.replay ? JSON.stringify(sim1.replay) : "";
                var fData2 = sim2.replay ? JSON.stringify(sim2.replay) : "";
                var fData3 = sim3.replay ? JSON.stringify(sim3.replay) : "";
                var darkHistRes = applyRankSwapAndRecordHistory("dark_arena", this, oppMatch, {
                    nowSec: nowFightTs,
                    isWin: darkIsWin,
                    atkTeams: [atk1, atk2, atk3],
                    defTeams: [defHeros1, defHeros2, defHeros3],
                    roundReplays: [fData1, fData2, fData3],
                    roundWins: [!!sim1.isWin, !!sim2.isWin, !!sim3.isWin]
                });
                this.save();
                respond({
                    useZip: false,
                    isWin: darkIsWin,
                    rank: darkHistRes.newRank,
                    rankChange: darkHistRes.rankChange,
                    replayId: darkHistRes.historyId,
                    fightCount: Number(this.data.dark_arena_fight_count || 0),
                    lastFightTime: nowFightTs,
                    fightData1: fData1,
                    fightData2: fData2,
                    fightData3: fData3,
                    settled: true,
                    reward: darkIsWin === 1 ? { gold: 50000, stone: 100 } : {}
                });
                return true;
            } else {
                var atkIdList;
                if (params && params[2] && String(params[2]).trim().length > 0) {
                    atkIdList = resolveHeroIdList(this, params[2], 5);
                    this.data.arena_atk_lineup = atkIdList.join(",");
                } else {
                    atkIdList = resolveHeroIdList(this, this.data.arena_atk_lineup || this.data.arena_def_lineup || this.data.arena_lineup, 5);
                }
                var atk1Payloads = atkIdList.map(function (hid) { return self.computeHeroPayload(hid); });
                var fightSeed = Math.floor(Math.random() * 900000) + 100000;
                var sim = simulateArenaBattle(atk1Payloads, defHeros1, fightSeed);
                var isWin = sim.isWin ? 1 : 0;

                this.data.arena_fight_count = Number(this.data.arena_fight_count || 0) + 1;
                this.data.arena_last_fight_time = nowFightTs;
                this.data.total_arena_fights = Number(this.data.total_arena_fights || 0) + 1;
                this.data.daily_counts["PLAYER_DIALY_TASK_8"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_8"] || 0) + 1;

                if (isWin === 1) {
                    this.data.arena_win_count = Number(this.data.arena_win_count || 0) + 1;
                    this.addStone(100, queuePush);
                    this.addCurrency(10, 200, queuePush);
                }

                var fightDataStr = JSON.stringify(sim.replay);
                var arenaHistRes = applyRankSwapAndRecordHistory("arena", this, oppMatch, {
                    nowSec: nowFightTs,
                    isWin: isWin,
                    atkTeams: [atk1Payloads],
                    defTeams: [defHeros1],
                    roundReplays: [fightDataStr],
                    roundWins: [!!sim.isWin]
                });
                this.save();
                respond({
                    skipReply: false,
                    arena_request_id: reqId,
                    seed: fightSeed,
                    isWin: isWin,
                    replayId: arenaHistRes.historyId,
                    targetFighterId: targetFighterId,
                    fight_data: fightDataStr,
                    rank: arenaHistRes.newRank,
                    rankChange: arenaHistRes.rankChange,
                    bestRankChange: arenaHistRes.rankChange,
                    fightCount: Number(this.data.arena_fight_count || 0),
                    lastFightTime: nowFightTs,
                    settled: true,
                    reward: isWin === 1 ? { gold: 50000, stone: 100 } : {}
                });
                return true;
            }
        }

        if (cmd === SVRCMD.ArenaFightReport || cmd === SVRCMD.DarkArenaFightReport) {
            var isWin = (params && params[1] !== undefined) ? Number(params[1]) : 1;
            var fightData = (params && params[2]) ? params[2] : null;
            var replayId = (params && params[3]) ? String(params[3]) : ("arena_" + Date.now() + "_" + Math.floor(Math.random() * 1000));
            var targetId = (params && params[4]) ? Number(params[4]) : 101;

            if (fightData) {
                storeArenaReplay(replayId, this.data.id || 1, targetId, isWin, fightData);
            }

            var isDarkReport = (cmd === SVRCMD.DarkArenaFightReport);
            var repModeKey = isDarkReport ? "dark_arena" : "arena";
            var curRank = getOrInitPlayerModeRank(this.data, repModeKey);
            var newRank = curRank;
            var rankChange = 0;
            if (isWin === 1 && curRank > 1) {
                newRank = curRank - 1;
                rankChange = 1;
            }
            if (isDarkReport) {
                this.data.dark_arena_rank = newRank;
                this.data.total_dark_arena_fights = Number(this.data.total_dark_arena_fights || 0) + 1;
                if (isWin === 1) this.data.dark_arena_win_count = Number(this.data.dark_arena_win_count || 0) + 1;
            } else {
                this.data.arena_rank = newRank;
                this.data.total_arena_fights = Number(this.data.total_arena_fights || 0) + 1;
            }
            this.data.daily_counts["PLAYER_DIALY_TASK_8"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_8"] || 0) + 1;
            this.addStone(100, queuePush);
            this.addCurrency(10, 200, queuePush);
            this.save();

            respond({
                status: 1,
                isWin: isWin,
                replayId: replayId,
                rank: newRank,
                rankChange: rankChange,
                bestRankChange: rankChange,
                stone: 100,
                reward: { gold: 50000, stone: 100 }
            });
            return true;
        }

        if (cmd === "GetChatFightData" || cmd === SVRCMD.GetChatFightData ||
            cmd === "DarkArenaFightHistoryInfo" || cmd === SVRCMD.DarkArenaFightHistoryInfo ||
            cmd === "CrossArenaFightHistoryInfo" || cmd === SVRCMD.CrossArenaFightHistoryInfo ||
            cmd === "CrossDarkArenaFightHistoryInfo" || cmd === SVRCMD.CrossDarkArenaFightHistoryInfo) {
            var reqReplayId = params ? params[0] : 0;
            var reqRoundIdx = (params && params[1] !== undefined) ? Number(params[1]) : 1;
            var replayFightData = resolveHistoryReplay(this, reqReplayId, reqRoundIdx);
            if (replayFightData) {
                respond({ history: { id: reqReplayId, fight_data: replayFightData } });
            } else {
                respond({}, { code: 1, msg: "Dữ liệu chiến báo đã hết hạn hoặc không tồn tại!" });
            }
            return true;
        }

        if (cmd === SVRCMD.ArenaRank || cmd === SVRCMD.DarkArenaRank) {
            var isDarkRank = (cmd === SVRCMD.DarkArenaRank);
            var leaderboard = buildLeaderboardEntries(this, isDarkRank ? "dark_arena" : "arena").slice(0, 30);

            if (!isDarkRank) {
                var ranksObj = {};
                for (var li = 0; li < leaderboard.length; li++) {
                    ranksObj[String(leaderboard[li].rank)] = leaderboard[li];
                }
                respond({ ranks: ranksObj, logs: [] });
            } else {
                respond({ ranks: leaderboard, logs: [] });
            }
            return true;
        }

        if (cmd === SVRCMD.ArenaFightHistory || cmd === SVRCMD.DarkArenaFightHistory) {
            var histArr = (cmd === SVRCMD.DarkArenaFightHistory)
                ? this.data.dark_arena_history
                : this.data.arena_history;
            var validHist = Array.isArray(histArr)
                ? histArr.filter(function (x) { return x && x.id && x.atk_id && x.def_id; })
                : [];
            respond({
                logs: [],
                history: validHist
            });
            return true;
        }

        if (cmd === SVRCMD.DarkArenaInfo) {
            resetDailyArenaCountersIfNeeded(this.data, "dark_arena");
            var defTeams = resolveMultiTeamLineups(this, [
                this.data.dark_arena_def_1 || this.data.dark_arena_lineup_1,
                this.data.dark_arena_def_2 || this.data.dark_arena_lineup_2,
                this.data.dark_arena_def_3 || this.data.dark_arena_lineup_3
            ], 3, 5);
            if (!this.data.dark_arena_def_1 && !this.data.dark_arena_lineup_1) {
                this.data.dark_arena_def_1 = defTeams[0].join(",");
                this.data.dark_arena_def_2 = defTeams[1].join(",");
                this.data.dark_arena_def_3 = defTeams[2].join(",");
                this.data.dark_arena_lineup_1 = this.data.dark_arena_def_1;
                this.data.dark_arena_lineup_2 = this.data.dark_arena_def_2;
                this.data.dark_arena_lineup_3 = this.data.dark_arena_def_3;
            }
            var hasSavedAtk = (
                this.data.dark_arena_atk_1 !== undefined ||
                this.data.dark_arena_atk_2 !== undefined ||
                this.data.dark_arena_atk_3 !== undefined
            );
            var atkTeams = hasSavedAtk
                ? resolveMultiTeamLineups(this, [this.data.dark_arena_atk_1, this.data.dark_arena_atk_2, this.data.dark_arena_atk_3], 3, 5)
                : [defTeams[0].slice(0), defTeams[1].slice(0), defTeams[2].slice(0)];
            if (!hasSavedAtk) {
                this.data.dark_arena_atk_1 = atkTeams[0].join(",");
                this.data.dark_arena_atk_2 = atkTeams[1].join(",");
                this.data.dark_arena_atk_3 = atkTeams[2].join(",");
            }

            var defHeros1 = defTeams[0].map(function (hid) { return self.computeHeroPayload(hid); });
            var defHeros2 = defTeams[1].map(function (hid) { return self.computeHeroPayload(hid); });
            var defHeros3 = defTeams[2].map(function (hid) { return self.computeHeroPayload(hid); });

            var nowSec = Math.floor(Date.now() / 1000);
            var lastTime = Number(this.data.dark_arena_last_point_time || nowSec);
            var elapsedHours = Math.max(0, (nowSec - lastTime) / 3600);
            var hourPt = 50;
            var accumulated = Number(this.data.dark_arena_accumulated_point || 0) + Math.floor(elapsedHours * hourPt);
            this.data.dark_arena_accumulated_point = accumulated;
            this.data.dark_arena_last_point_time = nowSec;
            var darkRankNum = getOrInitPlayerModeRank(this.data, "dark_arena");
            this.save();
            var darkRankObj = buildArenaPlayerRankPayload(this, darkRankNum, {
                winCount: Number(this.data.dark_arena_win_count || 0),
                fightValue: calcArenaTeamPower(defHeros1) + calcArenaTeamPower(defHeros2) + calcArenaTeamPower(defHeros3)
            });
            darkRankObj.def_heros_1 = JSON.stringify(defHeros1);
            darkRankObj.def_heros_2 = JSON.stringify(defHeros2);
            darkRankObj.def_heros_3 = JSON.stringify(defHeros3);
            darkRankObj.atk_heros_1 = atkTeams[0].join(",");
            darkRankObj.atk_heros_2 = atkTeams[1].join(",");
            darkRankObj.atk_heros_3 = atkTeams[2].join(",");

            respond({
                rank: darkRankObj,
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
        var buildTreasureHerosAndPower = function (playerData, heroIdsInput, fallbackLv) {
            var ids = [];
            if (Array.isArray(heroIdsInput)) {
                ids = heroIdsInput.map(Number).filter(function (x) { return x > 0; });
            } else if (heroIdsInput) {
                ids = String(heroIdsInput).split(",").map(Number).filter(function (x) { return x > 0; });
            }

            var payloads = [];
            var finalIds = [];
            var totalPower = 0;

            if (playerData && playerData.heros) {
                var pSession = Object.create(self);
                pSession.data = playerData;
                for (var hi = 0; hi < ids.length; hi++) {
                    var hid = ids[hi];
                    if (playerData.heros[hid] && typeof pSession.computeHeroPayload === "function") {
                        var hp = pSession.computeHeroPayload(hid);
                        payloads.push(hp);
                        finalIds.push(hid);
                        totalPower += Number(hp.power || 0);
                    }
                }
                if (payloads.length === 0) {
                    var availIds = Object.keys(playerData.heros).map(Number).filter(function (x) { return x > 0; }).slice(0, 5);
                    for (var ai = 0; ai < availIds.length; ai++) {
                        var hp2 = pSession.computeHeroPayload(availIds[ai]);
                        payloads.push(hp2);
                        finalIds.push(availIds[ai]);
                        totalPower += Number(hp2.power || 0);
                    }
                }
            }

            if (payloads.length === 0) {
                var botLv = Math.min(100, Math.max(20, Number(fallbackLv || 40)));
                var botQ = Math.min(15, Math.max(4, Math.floor(botLv / 8) + 2));
                var botSeedIds = (ids.length > 0) ? ids : [10020, 10040, 10250, 10070, 10120];
                for (var bi = 0; bi < botSeedIds.length && payloads.length < 5; bi++) {
                    var bHid = botSeedIds[bi];
                    if (typeof Config !== "undefined" && Config.hero && !Config.hero[bHid]) bHid = 10020;
                    var botHero = generateCompetentHeroRecord(bHid, botLv, botQ, true);
                    payloads.push(botHero);
                    finalIds.push(bHid);
                    totalPower += Number(botHero.power || 0);
                }
            }

            return {
                heroIdsStr: finalIds.join(","),
                herosJson: JSON.stringify(payloads),
                fightValue: Math.max(1000, Math.floor(totalPower))
            };
        };

        var ensureTreasureHasHeros = function (tr, ownerData) {
            if (!tr) return tr;
            var needRebuild = !tr.heros || tr.heros === "[]" || tr.heros.length < 5;
            if (!needRebuild) {
                try {
                    var parsed = JSON.parse(tr.heros);
                    if (!Array.isArray(parsed) || parsed.length === 0) needRebuild = true;
                } catch (e) {
                    needRebuild = true;
                }
            }
            if (needRebuild) {
                var built = buildTreasureHerosAndPower(ownerData, tr.hero_ids, tr.player_lv || 40);
                tr.hero_ids = built.heroIdsStr;
                tr.heros = built.herosJson;
                tr.fight_value = built.fightValue;
            }
            return tr;
        };

        if (!global._searchedTreasureCache) global._searchedTreasureCache = {};

        if (cmd === SVRCMD.GetTreasureDropMulti) {
            respond({ mulit: 0, multi: 0 });
            return true;
        }

        if (cmd === SVRCMD.PlayerTreasure) {
            var myTreasures = Array.isArray(this.data.treasures) ? this.data.treasures : [];
            var dirtyMine = false;
            for (var pti = 0; pti < myTreasures.length; pti++) {
                var beforeLen = (myTreasures[pti] && myTreasures[pti].heros) ? myTreasures[pti].heros.length : 0;
                ensureTreasureHasHeros(myTreasures[pti], this.data);
                if (myTreasures[pti] && myTreasures[pti].heros.length !== beforeLen) dirtyMine = true;
            }
            if (dirtyMine) this.save();
            respond({ treasures: myTreasures });
            return true;
        }

        if (cmd === SVRCMD.DugTreasure) {
            if (!Array.isArray(this.data.treasures)) this.data.treasures = [];
            var maxId = 0;
            for (var di = 0; di < this.data.treasures.length; di++) {
                if (Number(this.data.treasures[di].id || 0) > maxId) maxId = Number(this.data.treasures[di].id || 0);
            }
            var mineId = maxId + 1;
            var nowSec = Math.floor(Date.now() / 1000);
            var builtMine = buildTreasureHerosAndPower(this.data, params && params[1], this.data.team_lv || 1);
            var newTreasure = {
                id: mineId,
                status: 1,
                types: (params && params[0]) ? Number(params[0]) : 3,
                can_pick: 0,
                has_pick: 0,
                hero_ids: builtMine.heroIdsStr,
                player_id: this.getNumericId(),
                player_lv: Number(this.data.team_lv || 1),
                player_name: this.data.team_name || "Nhẫn Giả",
                player_icon: Number(this.data.icon || 2010080),
                fight_value: builtMine.fightValue,
                create_time: nowSec,
                plunder_time: nowSec + 14400,
                robbed_at: 0,
                is_plundered: 0,
                heros: builtMine.herosJson
            };
            this.data.treasures.push(newTreasure);
            this.data.daily_counts["DUG_COUNT"] = Number(this.data.daily_counts["DUG_COUNT"] || 0) + 1;
            this.data.daily_counts["PLAYER_DIALY_TASK_16"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_16"] || 0) + 1;
            this.save();
            respond({ treasure: newTreasure });
            return true;
        }

        if (cmd === SVRCMD.SearchTreasure) {
            var nowSec = Math.floor(Date.now() / 1000);
            var myUid = this.getNumericId();
            var candidates = [];

            // Tìm người chơi khác đang chiếm cứ điểm khai thác (không lấy bản thân)
            if (typeof playerDb !== "undefined") {
                for (var pKey in playerDb) {
                    var pData = playerDb[pKey];
                    if (pData && Number(pData.uid) !== myUid && Array.isArray(pData.treasures) && pData.treasures.length > 0) {
                        for (var ti = 0; ti < pData.treasures.length; ti++) {
                            var tr = pData.treasures[ti];
                            if (tr && Number(tr.status) === 1) {
                                ensureTreasureHasHeros(tr, pData);
                                candidates.push({
                                    mine: {
                                        id: tr.id || 1,
                                        status: 1,
                                        types: tr.types || 1,
                                        can_pick: 0,
                                        has_pick: 0,
                                        hero_ids: tr.hero_ids,
                                        player_id: Number(pData.uid || 201),
                                        player_lv: Number(pData.team_lv || 50),
                                        player_name: pData.team_name || "Nhẫn Giả",
                                        player_icon: Number(pData.icon || 10020),
                                        fight_value: tr.fight_value || 6000,
                                        create_time: tr.create_time || (nowSec - 1800),
                                        plunder_time: nowSec + 10800,
                                        robbed_at: 0,
                                        is_plundered: 0,
                                        heros: tr.heros
                                    },
                                    group_name: pData.group_name || ""
                                });
                            }
                        }
                    }
                }
            }

            var pickedEntry = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;
            var targetMine = pickedEntry ? pickedEntry.mine : null;
            var targetGroupName = pickedEntry ? pickedEntry.group_name : "";

            // Nếu không có người chơi nào chiếm thì sinh Bot chiếm giữ cứ điểm với đầy đủ đội hình
            if (!targetMine) {
                var oppId = 200 + Math.floor(Math.random() * 50);
                var mId = Math.floor(Math.random() * 10) + 1;
                var botNames = ["Uchiha Shisui", "Hidan", "Kakuzu", "Deidara", "Sasori", "Kisame", "Konan", "Nagato"];
                var randomName = botNames[Math.floor(Math.random() * botNames.length)];
                var botLv = Math.min(100, Math.max(30, Number(this.data.team_lv || 40)));
                var botPools = [
                    "10020,10040,10250,10070,10120",
                    "10110,10120,10140,10150,10160",
                    "10200,10230,10400,10500,10510",
                    "10010,10030,10050,10130,10270"
                ];
                var pickedIds = botPools[Math.floor(Math.random() * botPools.length)];
                var botBuilt = buildTreasureHerosAndPower(null, pickedIds, botLv);
                targetMine = {
                    id: mId,
                    status: 1,
                    types: Math.floor(Math.random() * 3) + 1,
                    can_pick: 0,
                    has_pick: 0,
                    hero_ids: botBuilt.heroIdsStr,
                    player_id: oppId,
                    player_lv: botLv,
                    player_name: randomName,
                    player_icon: Number(botBuilt.heroIdsStr.split(",")[0] || 10020),
                    fight_value: botBuilt.fightValue,
                    create_time: nowSec - 3600,
                    plunder_time: nowSec + 10800,
                    robbed_at: 0,
                    is_plundered: 0,
                    heros: botBuilt.herosJson
                };
            }

            if (!global._searchedTreasureCache[myUid]) global._searchedTreasureCache[myUid] = {};
            global._searchedTreasureCache[myUid][targetMine.player_id + "_" + targetMine.id] = targetMine;
            global._searchedTreasureCache[myUid]._latest = targetMine;

            respond({ treasure: targetMine, group_name: targetGroupName });
            return true;
        }

        if (cmd === SVRCMD.TreasureInfo) {
            var oppId = Number((params && params[0]) || 0);
            var mId = Number((params && params[1]) || 1);
            var myUid = this.getNumericId();
            var nowSec = Math.floor(Date.now() / 1000);
            var foundMine = null;

            // 1. Xem cứ điểm của chính mình
            if (oppId === myUid || oppId === 0) {
                var ownList = Array.isArray(this.data.treasures) ? this.data.treasures : [];
                for (var oi = 0; oi < ownList.length; oi++) {
                    if (Number(ownList[oi].id) === mId) {
                        foundMine = ensureTreasureHasHeros(ownList[oi], this.data);
                        break;
                    }
                }
                if (!foundMine && ownList.length > 0) {
                    foundMine = ensureTreasureHasHeros(ownList[0], this.data);
                }
            }

            // 2. Xem cứ điểm từ kết quả SearchTreasure đã cache
            if (!foundMine && global._searchedTreasureCache[myUid]) {
                var uCache = global._searchedTreasureCache[myUid];
                foundMine = uCache[oppId + "_" + mId] || uCache._latest || null;
            }

            // 3. Tìm trong playerDb
            if (!foundMine && typeof playerDb !== "undefined") {
                for (var pk in playerDb) {
                    var pd = playerDb[pk];
                    if (pd && Number(pd.uid) === oppId && Array.isArray(pd.treasures)) {
                        for (var pti2 = 0; pti2 < pd.treasures.length; pti2++) {
                            if (Number(pd.treasures[pti2].id) === mId) {
                                foundMine = ensureTreasureHasHeros(pd.treasures[pti2], pd);
                                break;
                            }
                        }
                    }
                    if (foundMine) break;
                }
            }

            // 4. Fallback sinh Bot với đầy đủ đội hình
            if (!foundMine) {
                var botLvFallback = Math.min(100, Math.max(30, Number(this.data.team_lv || 40)));
                var builtFallback = buildTreasureHerosAndPower(null, "10070,10400,10120,10200,10230", botLvFallback);
                foundMine = {
                    id: mId,
                    status: 1,
                    types: 3,
                    can_pick: 0,
                    has_pick: 0,
                    hero_ids: builtFallback.heroIdsStr,
                    player_id: oppId || 215,
                    player_lv: botLvFallback,
                    player_name: "Nhẫn Giả " + (oppId || 215),
                    player_icon: 10070,
                    fight_value: builtFallback.fightValue,
                    create_time: nowSec - 3600,
                    plunder_time: nowSec + 10800,
                    robbed_at: 0,
                    is_plundered: 0,
                    heros: builtFallback.herosJson
                };
            }

            respond({ treasure: foundMine });
            return true;
        }

        if (cmd === SVRCMD.BeforePlunderTreasure) {
            var targetPid = Number((params && params[0]) || 0);
            var targetMineId = Number((params && params[1]) || 0);
            this._pendingPlunder = { player_id: targetPid, mine_id: targetMineId };
            respond({ sign: "plunder_" + Date.now(), seed: Math.floor(Math.random() * 1000000) });
            return true;
        }

        if (cmd === SVRCMD.AfterPlunderTreasure) {
            var isWin = Number((params && params[1]) !== undefined ? params[1] : 1);
            var lootItems = [];
            var goldReward = 0;
            if (isWin === 1) {
                goldReward = 50000;
                lootItems = [
                    { item_id: 60010, amount: 10, type: 1 },
                    { item_id: 10210, amount: 8, type: 1 },
                    { item_id: 40010, amount: 5, type: 1 }
                ];
                for (var li = 0; li < lootItems.length; li++) {
                    this.changeItemAmount(lootItems[li].item_id, lootItems[li].amount, queuePush);
                }
                this.addGold(goldReward, queuePush);
                if (this._pendingPlunder && typeof playerDb !== "undefined") {
                    for (var pk2 in playerDb) {
                        var pd2 = playerDb[pk2];
                        if (pd2 && Number(pd2.uid) === this._pendingPlunder.player_id && Array.isArray(pd2.treasures)) {
                            for (var ti2 = 0; ti2 < pd2.treasures.length; ti2++) {
                                if (Number(pd2.treasures[ti2].id) === this._pendingPlunder.mine_id) {
                                    pd2.treasures[ti2].is_plundered = 1;
                                    pd2.treasures[ti2].robbed_at = Math.floor(Date.now() / 1000);
                                }
                            }
                        }
                    }
                }
            }
            this._pendingPlunder = null;
            this.data.daily_counts["PLUNDER_COUNT"] = Number(this.data.daily_counts["PLUNDER_COUNT"] || 0) + 1;
            this.data.total_plunder_count = Number(this.data.total_plunder_count || 0) + 1;
            this.save();
            respond({
                tg_num: isWin === 1 ? 5 : 0,
                awardedItemIds: lootItems.map(function (it) { return it.item_id; }),
                gold: goldReward,
                items: lootItems,
                itemBalances: lootItems.map(function (it) {
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
            var revMineId = Number((params && params[0]) || 0);
            if (Array.isArray(this.data.treasures) && revMineId > 0) {
                this.data.treasures = this.data.treasures.filter(function (t) { return Number(t.id) !== revMineId; });
            }
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

        if (cmd === "ResetTreasureLinneup" || cmd === SVRCMD.ResetTreasureLinneup) {
            var resetMineId = Number((params && params[0]) || 0);
            var newHeroIdsStr = String((params && params[1]) || "");
            var updatedMine = null;
            if (Array.isArray(this.data.treasures)) {
                for (var ri = 0; ri < this.data.treasures.length; ri++) {
                    if (Number(this.data.treasures[ri].id) === resetMineId || (resetMineId === 0 && ri === 0)) {
                        var builtReset = buildTreasureHerosAndPower(this.data, newHeroIdsStr, this.data.team_lv || 1);
                        this.data.treasures[ri].hero_ids = builtReset.heroIdsStr;
                        this.data.treasures[ri].heros = builtReset.herosJson;
                        this.data.treasures[ri].fight_value = builtReset.fightValue;
                        updatedMine = this.data.treasures[ri];
                        break;
                    }
                }
            }
            this.save();
            respond({ status: 1, treasure: updatedMine });
            return true;
        }

        if (cmd === "HeroRecall" || cmd === SVRCMD.HeroRecall) {
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
            resetDailyArenaCountersIfNeeded(this.data, "cross_arena");
            var caNowSec = Math.floor(Date.now() / 1000);
            var caLastPtTime = Number(this.data.cross_arena_last_point_time || caNowSec);
            var caHours = Math.max(0, (caNowSec - caLastPtTime) / 3600);
            var caHourPt = 50;
            var caAccPt = Number(this.data.cross_arena_record_point || 0) + Math.floor(caHours * caHourPt);
            this.data.cross_arena_record_point = caAccPt;
            this.data.cross_arena_last_point_time = caNowSec;

            var caTop = getSortedOwnedHeroIds(this).slice(0, 5);
            var caDefIds = resolveHeroIdList(this, this.data.cross_arena_def_1, 5, caTop);
            var caAtkIds = (this.data.cross_arena_atk_1 !== undefined)
                ? resolveHeroIdList(this, this.data.cross_arena_atk_1, 5, caDefIds)
                : caDefIds.slice(0);
            if (!this.data.cross_arena_def_1) this.data.cross_arena_def_1 = caDefIds.join(",");
            if (this.data.cross_arena_atk_1 === undefined) this.data.cross_arena_atk_1 = caAtkIds.join(",");
            var caBanStr = typeof this.data.cross_arena_ban === "string" ? this.data.cross_arena_ban : "";
            var caDefPayloads = caDefIds.map(function (hid) { return self.computeHeroPayload(hid); });

            var caRankNum = getOrInitPlayerModeRank(this.data, "cross_arena");
            var caRankObj = buildArenaPlayerRankPayload(this, caRankNum, {
                winCount: Number(this.data.cross_arena_win_count || 0),
                fightValue: calcArenaTeamPower(caDefPayloads)
            });
            caRankObj.def_heros_1 = JSON.stringify(caDefPayloads);
            caRankObj.def_heros_2 = caBanStr;
            caRankObj.atk_heros_1 = caAtkIds.join(",");
            caRankObj.atk_heros_2 = "";
            this.save();

            respond({
                arena_lv: 1,
                team_num: 2,
                fightCount: Number(this.data.cross_arena_fight_count || 0),
                lastFightTime: Number(this.data.cross_arena_last_fight_time || 0),
                hour_point: caHourPt,
                total_point: caAccPt,
                rank: caRankObj
            });
            return true;
        }

        if (cmd === SVRCMD.CrossArenaRank || cmd === "CrossArenaRank" || cmd === "CrossArenaAllRankInfo" || cmd === SVRCMD.CrossArenaAllRankInfo) {
            if (cmd === "CrossArenaAllRankInfo" || cmd === SVRCMD.CrossArenaAllRankInfo) {
                var pLv = Number(this.data.team_lv || 1);
                var minLv = Math.max(1, Math.floor(pLv / 10) * 10);
                var maxLv = minLv + 9;
                var myScore = Number(this.data.cross_arena_record_point || 0);
                var myIconCa = Number(this.data.icon || 10020);
                if (typeof Config !== "undefined" && Config.player_head && !Config.player_head[myIconCa]) myIconCa = 10020;
                var allGroupInfo = {
                    my_info: {
                        cur_rank: getOrInitPlayerModeRank(this.data, "cross_arena"),
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
                            icon: myIconCa,
                            player_name: this.data.team_name || "Nhẫn Giả",
                            server_id: 1
                        }
                    },
                    "2": {
                        lv: 2,
                        min_lv: 50,
                        max_lv: 69,
                        data: {
                            icon: 10030,
                            player_name: "Sasuke Taka",
                            server_id: 2
                        }
                    },
                    "3": {
                        lv: 3,
                        min_lv: 70,
                        max_lv: 89,
                        data: {
                            icon: 10010,
                            player_name: "Hokage Đệ Tứ",
                            server_id: 1
                        }
                    },
                    "4": {
                        lv: 4,
                        min_lv: 90,
                        max_lv: 100,
                        data: {
                            icon: 10050,
                            player_name: "Kakashi Ám Bộ",
                            server_id: 3
                        }
                    }
                };
                respond(allGroupInfo);
                return true;
            }

            var selfUidCa = this.getNumericId();
            var caLeaderboard = buildLeaderboardEntries(this, "cross_arena").slice(0, 30);
            var caRanks = caLeaderboard.map(function (e) {
                var ePid = Number(e.player_id || 0);
                var eEntry = (ePid > 0 && findPlayerByIdOrUid) ? findPlayerByIdOrUid(ePid) : null;
                var eScore = (ePid === selfUidCa)
                    ? Number(self.data.cross_arena_score || 1600)
                    : ((eEntry && eEntry.data && eEntry.data.cross_arena_score !== undefined)
                        ? Number(eEntry.data.cross_arena_score)
                        : (1600 + Number(e.win_count || 0) * 10));
                return {
                    rank: e.rank,
                    player_id: e.player_id,
                    player_name: e.player_name,
                    server_id: e.server_id,
                    icon: e.icon,
                    score: eScore,
                    team_lv: e.player_lv,
                    player_lv: e.player_lv,
                    fight_value: e.fight_value
                };
            });
            respond({ ranks: caRanks });
            return true;
        }

        if (cmd === "CrossMatchArenaFighters" || cmd === SVRCMD.CrossMatchArenaFighters) {
            var caMyRank = getOrInitPlayerModeRank(this.data, "cross_arena");
            var caMatchups = buildOpponentMatchups(this, "cross_arena", caMyRank, 2, { rotate: true, isCross: true });
            var caResp = caMatchups.map(function (m) {
                return {
                    player_id: m.player_id,
                    fighter_id: m.fighter_id,
                    player_name: m.player_name,
                    server_id: m.server_id,
                    rank: m.rank,
                    score: 1600 + m.win_count * 10,
                    icon: m.icon,
                    player_lv: m.player_lv,
                    team_lv: m.player_lv,
                    win_count: m.win_count,
                    power: m.fight_value,
                    fight_value: m.fight_value,
                    def_heros_1: JSON.stringify(m.teams[0] || []),
                    def_heros_2: ""
                };
            });
            respond(caResp);
            return true;
        }

        if (cmd === "CrossPlayerArenaInfo" || cmd === SVRCMD.CrossPlayerArenaInfo) {
            var caLookup = function (cacheArr) {
                var cands = params ? [Number(params[1] || 0), Number(params[2] || 0), Number(params[0] || 0)] : [];
                for (var ci = 0; ci < cands.length; ci++) {
                    if (cands[ci] <= 0) continue;
                    for (var mi = 0; mi < cacheArr.length; mi++) {
                        if (Number(cacheArr[mi].player_id) === cands[ci] || Number(cacheArr[mi].fighter_id) === cands[ci]) {
                            return cacheArr[mi];
                        }
                    }
                }
                return null;
            };
            var caKey = this.getNumericId() + "_cross_arena";
            var caList = _cachedMatchups[caKey] || buildOpponentMatchups(this, "cross_arena", getOrInitPlayerModeRank(this.data, "cross_arena"), 2, { rotate: false, isCross: true });
            var caTarget = caLookup(caList) || caList[0];
            var caOppDef1 = (caTarget && caTarget.teams && caTarget.teams[0]) ? caTarget.teams[0] : [];
            respond({
                player_id: caTarget.player_id,
                fighter_id: caTarget.fighter_id,
                server_id: caTarget.server_id,
                team_num: 1,
                win_count: caTarget.win_count,
                rank: caTarget.rank,
                player_name: caTarget.player_name,
                player_lv: caTarget.player_lv,
                icon: caTarget.icon,
                fight_value: caTarget.fight_value,
                def_heros_1: JSON.stringify(caOppDef1),
                def_heros_2: ""
            });
            return true;
        }

        if (cmd === "CrossSetArenaLineup" || cmd === SVRCMD.CrossSetArenaLineup) {
            var caSetType = (params && params[0] !== undefined) ? Number(params[0]) : 1;
            var caFiltered = resolveHeroIdList(this, params ? params[1] : "", 5);
            if (caSetType === 2) {
                this.data.cross_arena_def_1 = caFiltered.join(",");
                this.data.cross_arena_ban = (params && params[2] !== undefined)
                    ? parseHeroIdInput(params[2]).join(",")
                    : "";
            } else {
                this.data.cross_arena_atk_1 = caFiltered.join(",");
            }
            this.data.cross_arena_lineup = caFiltered;
            this.save();
            respond({ status: 1 });
            return true;
        }

        if (cmd === "CrossArenaFight" || cmd === SVRCMD.CrossArenaFight) {
            resetDailyArenaCountersIfNeeded(this.data, "cross_arena");
            var caFightNow = Math.floor(Date.now() / 1000);
            var caFightKey = this.getNumericId() + "_cross_arena";
            var caOpps = _cachedMatchups[caFightKey] || buildOpponentMatchups(this, "cross_arena", getOrInitPlayerModeRank(this.data, "cross_arena"), 2, { rotate: false, isCross: true });
            var caTargetPid = (params && params[1] !== undefined) ? Number(params[1]) : Number((params && params[0]) || 0);
            var caOpp = findCachedOpponent(this, "cross_arena", caTargetPid) || caOpps[0];

            var caFightAtkIds = resolveHeroIdList(this, this.data.cross_arena_atk_1 || this.data.cross_arena_def_1 || this.data.cross_arena_lineup, 5);
            var atk1 = caFightAtkIds.map(function (hid) { return self.computeHeroPayload(hid); });
            var def1 = (caOpp && caOpp.teams && caOpp.teams[0]) ? caOpp.teams[0] : [];
            var caSeed = Math.floor(Math.random() * 900000) + 100000;
            var sim1 = simulateArenaBattle(atk1, def1, caSeed);
            var isWin = sim1.isWin ? 1 : 0;

            this.data.cross_arena_fight_count = Number(this.data.cross_arena_fight_count || 0) + 1;
            this.data.cross_arena_last_fight_time = caFightNow;
            if (isWin === 1) {
                this.data.cross_arena_win_count = Number(this.data.cross_arena_win_count || 0) + 1;
                this.data.cross_arena_score = Number(this.data.cross_arena_score || 1600) + 30;
                this.data.cross_arena_record_point = Number(this.data.cross_arena_record_point || 0) + 50;
                this.addCurrency(10, 100, queuePush);
            }
            var caFightStr = sim1.replay ? JSON.stringify(sim1.replay) : "";
            var caHistRes = applyRankSwapAndRecordHistory("cross_arena", this, caOpp, {
                nowSec: caFightNow,
                isWin: isWin,
                scoreChange: isWin ? 30 : 0,
                atkTeams: [atk1],
                defTeams: [def1],
                roundReplays: [caFightStr],
                roundWins: [!!sim1.isWin]
            });
            this.save();

            respond({
                useZip: false,
                isWin: isWin,
                rank: caHistRes.newRank,
                rankChange: caHistRes.rankChange,
                replayId: caHistRes.historyId,
                score: Number(this.data.cross_arena_score || 1600),
                fightCount: Number(this.data.cross_arena_fight_count || 0),
                lastFightTime: caFightNow,
                fightData1: caFightStr,
                fightData2: ""
            });
            return true;
        }

        if (cmd === "CrossArenaFightHistory" || cmd === SVRCMD.CrossArenaFightHistory) {
            var validCaHist = Array.isArray(this.data.cross_arena_history)
                ? this.data.cross_arena_history.filter(function (x) { return x && x.id && x.atk_id && x.def_id; })
                : [];
            respond({
                history: validCaHist
            });
            return true;
        }

        if (cmd === "CrossDarkArenaInfo" || cmd === SVRCMD.CrossDarkArenaInfo) {
            resetDailyArenaCountersIfNeeded(this.data, "cross_dark");
            var cdNowSec = Math.floor(Date.now() / 1000);
            var cdLastPt = Number(this.data.cross_dark_last_point_time || cdNowSec);
            var cdHours = Math.max(0, (cdNowSec - cdLastPt) / 3600);
            var cdHourPt = 50;
            var cdAccPt = Number(this.data.cross_dark_record_point || 0) + Math.floor(cdHours * cdHourPt);
            this.data.cross_dark_record_point = cdAccPt;
            this.data.cross_dark_last_point_time = cdNowSec;

            var legacyCd = this.data.cross_dark_lineups || {};
            var cdDefTeams = resolveMultiTeamLineups(this, [
                this.data.cross_dark_def_1 || legacyCd[1],
                this.data.cross_dark_def_2 || legacyCd[2],
                this.data.cross_dark_def_3 || legacyCd[3]
            ], 3, 5);
            if (!this.data.cross_dark_def_1) {
                this.data.cross_dark_def_1 = cdDefTeams[0].join(",");
                this.data.cross_dark_def_2 = cdDefTeams[1].join(",");
                this.data.cross_dark_def_3 = cdDefTeams[2].join(",");
            }
            var hasSavedCdAtk = (
                this.data.cross_dark_atk_1 !== undefined ||
                this.data.cross_dark_atk_2 !== undefined ||
                this.data.cross_dark_atk_3 !== undefined
            );
            var cdAtkTeams = hasSavedCdAtk
                ? resolveMultiTeamLineups(this, [this.data.cross_dark_atk_1, this.data.cross_dark_atk_2, this.data.cross_dark_atk_3], 3, 5)
                : [cdDefTeams[0].slice(0), cdDefTeams[1].slice(0), cdDefTeams[2].slice(0)];
            if (!hasSavedCdAtk) {
                this.data.cross_dark_atk_1 = cdAtkTeams[0].join(",");
                this.data.cross_dark_atk_2 = cdAtkTeams[1].join(",");
                this.data.cross_dark_atk_3 = cdAtkTeams[2].join(",");
            }

            var cdDefPayloads1 = cdDefTeams[0].map(function (hid) { return self.computeHeroPayload(hid); });
            var cdDefPayloads2 = cdDefTeams[1].map(function (hid) { return self.computeHeroPayload(hid); });
            var cdDefPayloads3 = cdDefTeams[2].map(function (hid) { return self.computeHeroPayload(hid); });
            var cdRankNum = getOrInitPlayerModeRank(this.data, "cross_dark");
            var cdRankObj = buildArenaPlayerRankPayload(this, cdRankNum, {
                winCount: Number(this.data.cross_dark_win_count || 0),
                fightValue: calcArenaTeamPower(cdDefPayloads1) + calcArenaTeamPower(cdDefPayloads2) + calcArenaTeamPower(cdDefPayloads3)
            });
            cdRankObj.def_heros_1 = JSON.stringify(cdDefPayloads1);
            cdRankObj.def_heros_2 = JSON.stringify(cdDefPayloads2);
            cdRankObj.def_heros_3 = JSON.stringify(cdDefPayloads3);
            cdRankObj.atk_heros_1 = cdAtkTeams[0].join(",");
            cdRankObj.atk_heros_2 = cdAtkTeams[1].join(",");
            cdRankObj.atk_heros_3 = cdAtkTeams[2].join(",");
            this.save();

            respond({
                arena_lv: 1,
                team_num: 3,
                fightCount: Number(this.data.cross_dark_fight_count || 0),
                lastFightTime: Number(this.data.cross_dark_last_fight_time || 0),
                hour_point: cdHourPt,
                total_point: cdAccPt,
                rank: cdRankObj
            });
            return true;
        }

        if (cmd === "CrossDarkArenaRank" || cmd === "CrossDarkArenaAllRankInfo" || cmd === SVRCMD.CrossDarkArenaAllRankInfo) {
            if (cmd === "CrossDarkArenaAllRankInfo" || cmd === SVRCMD.CrossDarkArenaAllRankInfo) {
                var pLv = Number(this.data.team_lv || 1);
                var minLv = Math.max(1, Math.floor(pLv / 10) * 10);
                var maxLv = minLv + 9;
                var myScore = Number(this.data.cross_dark_record_point || 0);
                var myIconCd = Number(this.data.icon || 10020);
                if (typeof Config !== "undefined" && Config.player_head && !Config.player_head[myIconCd]) myIconCd = 10020;
                var allGroupInfo = {
                    my_info: {
                        cur_rank: getOrInitPlayerModeRank(this.data, "cross_dark"),
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
                            icon: myIconCd,
                            player_name: this.data.team_name || "Nhẫn Giả",
                            server_id: 1
                        }
                    },
                    "2": {
                        lv: 2,
                        min_lv: 50,
                        max_lv: 69,
                        data: {
                            icon: 10030,
                            player_name: "Itachi Uchiha",
                            server_id: 2
                        }
                    },
                    "3": {
                        lv: 3,
                        min_lv: 70,
                        max_lv: 89,
                        data: {
                            icon: 10010,
                            player_name: "Hokage Đệ Tứ",
                            server_id: 1
                        }
                    },
                    "4": {
                        lv: 4,
                        min_lv: 90,
                        max_lv: 100,
                        data: {
                            icon: 10050,
                            player_name: "Kakashi Ám Bộ",
                            server_id: 3
                        }
                    }
                };
                respond(allGroupInfo);
                return true;
            }

            var selfUidCd = this.getNumericId();
            var cdLeaderboard = buildLeaderboardEntries(this, "cross_dark").slice(0, 30);
            var cdRanks = cdLeaderboard.map(function (e) {
                var ePid = Number(e.player_id || 0);
                var eEntry = (ePid > 0 && findPlayerByIdOrUid) ? findPlayerByIdOrUid(ePid) : null;
                var eScore = (ePid === selfUidCd)
                    ? Number(self.data.cross_dark_score || 1500)
                    : ((eEntry && eEntry.data && eEntry.data.cross_dark_score !== undefined)
                        ? Number(eEntry.data.cross_dark_score)
                        : (1500 + Number(e.win_count || 0) * 10));
                return {
                    rank: e.rank,
                    player_id: e.player_id,
                    player_name: e.player_name,
                    server_id: e.server_id,
                    icon: e.icon,
                    score: eScore,
                    team_lv: e.player_lv,
                    player_lv: e.player_lv,
                    fight_value: e.fight_value
                };
            });
            respond({ ranks: cdRanks });
            return true;
        }

        if (cmd === "CrossMatcDarkhFighters" || cmd === SVRCMD.CrossMatcDarkhFighters) {
            var cdMatchups = buildOpponentMatchups(this, "cross_dark", getOrInitPlayerModeRank(this.data, "cross_dark"), 3, { rotate: true, isCross: true });
            var cdResp = cdMatchups.map(function (m) {
                var t1 = m.teams[0] || [];
                var t2 = m.teams[1] || t1;
                var t3 = m.teams[2] || t1;
                return {
                    player_id: m.player_id,
                    fighter_id: m.fighter_id,
                    player_name: m.player_name,
                    server_id: m.server_id,
                    rank: m.rank,
                    score: 1500 + m.win_count * 10,
                    icon: m.icon,
                    player_lv: m.player_lv,
                    team_lv: m.player_lv,
                    win_count: m.win_count,
                    power: m.fight_value,
                    fight_value: m.fight_value,
                    def_heros_1: JSON.stringify(t1),
                    def_heros_2: JSON.stringify(t2),
                    def_heros_3: JSON.stringify(t3)
                };
            });
            respond(cdResp);
            return true;
        }

        if (cmd === "CrossPlayerDarkArenaInfo" || cmd === SVRCMD.CrossPlayerDarkArenaInfo) {
            var cdLookupKey = this.getNumericId() + "_cross_dark";
            var cdList = _cachedMatchups[cdLookupKey] || buildOpponentMatchups(this, "cross_dark", getOrInitPlayerModeRank(this.data, "cross_dark"), 3, { rotate: false, isCross: true });
            var cdCands = params ? [Number(params[1] || 0), Number(params[2] || 0), Number(params[0] || 0)] : [];
            var cdTarget = null;
            for (var cdi = 0; cdi < cdCands.length && !cdTarget; cdi++) {
                if (cdCands[cdi] <= 0) continue;
                for (var cmi = 0; cmi < cdList.length; cmi++) {
                    if (Number(cdList[cmi].player_id) === cdCands[cdi] || Number(cdList[cmi].fighter_id) === cdCands[cdi]) {
                        cdTarget = cdList[cmi];
                        break;
                    }
                }
            }
            if (!cdTarget) cdTarget = cdList[0];
            var cdT1 = (cdTarget.teams && cdTarget.teams[0]) ? cdTarget.teams[0] : [];
            var cdT2 = (cdTarget.teams && cdTarget.teams[1]) ? cdTarget.teams[1] : cdT1;
            var cdT3 = (cdTarget.teams && cdTarget.teams[2]) ? cdTarget.teams[2] : cdT1;

            respond({
                player_id: cdTarget.player_id,
                fighter_id: cdTarget.fighter_id,
                server_id: cdTarget.server_id,
                team_num: 3,
                win_count: cdTarget.win_count,
                rank: cdTarget.rank,
                player_name: cdTarget.player_name,
                player_lv: cdTarget.player_lv,
                icon: cdTarget.icon,
                fight_value: cdTarget.fight_value,
                def_heros_1: JSON.stringify(cdT1),
                def_heros_2: JSON.stringify(cdT2),
                def_heros_3: JSON.stringify(cdT3)
            });
            return true;
        }

        if (cmd === "CrossSetDarkArenaLineup" || cmd === SVRCMD.CrossSetDarkArenaLineup) {
            var cdSetType = (params && params[0] !== undefined) ? Number(params[0]) : 1;
            var cdOwnMap = this.data.heros || {};
            var cleanCdTeam = function (raw) {
                return parseHeroIdInput(raw).filter(function (id) { return !!cdOwnMap[id]; }).slice(0, 5).join(",");
            };
            var cs1 = (params && params.length >= 2) ? cleanCdTeam(params[1]) : "";
            var cs2 = (params && params.length >= 3) ? cleanCdTeam(params[2]) : "";
            var cs3 = (params && params.length >= 4) ? cleanCdTeam(params[3]) : "";
            if (cdSetType === 2) {
                this.data.cross_dark_def_1 = cs1;
                this.data.cross_dark_def_2 = cs2;
                this.data.cross_dark_def_3 = cs3;
                this.data.cross_dark_lineups = { 1: cs1, 2: cs2, 3: cs3 };
            } else {
                this.data.cross_dark_atk_1 = cs1;
                this.data.cross_dark_atk_2 = cs2;
                this.data.cross_dark_atk_3 = cs3;
            }
            this.save();
            respond({ status: 1 });
            return true;
        }

        if (cmd === "CrossDarkArenaFight" || cmd === SVRCMD.CrossDarkArenaFight) {
            resetDailyArenaCountersIfNeeded(this.data, "cross_dark");
            var cdFightNow = Math.floor(Date.now() / 1000);
            var cdFightPid = (params && params[1] !== undefined) ? Number(params[1]) : Number((params && params[0]) || 0);
            var cdFightKey = this.getNumericId() + "_cross_dark";
            var cdOpps = _cachedMatchups[cdFightKey] || buildOpponentMatchups(this, "cross_dark", getOrInitPlayerModeRank(this.data, "cross_dark"), 3, { rotate: false, isCross: true });
            var cdOpp = findCachedOpponent(this, "cross_dark", cdFightPid) || cdOpps[0];

            var cdHasAtk = (
                this.data.cross_dark_atk_1 !== undefined ||
                this.data.cross_dark_atk_2 !== undefined ||
                this.data.cross_dark_atk_3 !== undefined
            );
            var cdAtkIds = cdHasAtk
                ? [parseHeroIdInput(this.data.cross_dark_atk_1), parseHeroIdInput(this.data.cross_dark_atk_2), parseHeroIdInput(this.data.cross_dark_atk_3)]
                : resolveMultiTeamLineups(this, [this.data.cross_dark_def_1, this.data.cross_dark_def_2, this.data.cross_dark_def_3], 3, 5);
            var atk1 = cdAtkIds[0].map(function (hid) { return self.computeHeroPayload(hid); });
            var atk2 = cdAtkIds[1].map(function (hid) { return self.computeHeroPayload(hid); });
            var atk3 = cdAtkIds[2].map(function (hid) { return self.computeHeroPayload(hid); });

            var def1 = (cdOpp && cdOpp.teams && cdOpp.teams[0]) ? cdOpp.teams[0] : [];
            var def2 = (cdOpp && cdOpp.teams && cdOpp.teams[1]) ? cdOpp.teams[1] : def1;
            var def3 = (cdOpp && cdOpp.teams && cdOpp.teams[2]) ? cdOpp.teams[2] : def1;

            var sim1 = atk1.length > 0 ? simulateArenaBattle(atk1, def1, 1001 + Math.floor(Math.random() * 10000)) : { isWin: false, replay: "" };
            var sim2 = atk2.length > 0 ? simulateArenaBattle(atk2, def2, 2001 + Math.floor(Math.random() * 10000)) : { isWin: false, replay: "" };
            var sim3 = atk3.length > 0 ? simulateArenaBattle(atk3, def3, 3001 + Math.floor(Math.random() * 10000)) : { isWin: false, replay: "" };
            var winCount = (sim1.isWin ? 1 : 0) + (sim2.isWin ? 1 : 0) + (sim3.isWin ? 1 : 0);
            var isWin = winCount >= 2 ? 1 : 0;

            this.data.cross_dark_fight_count = Number(this.data.cross_dark_fight_count || 0) + 1;
            this.data.cross_dark_last_fight_time = cdFightNow;
            if (isWin === 1) {
                this.data.cross_dark_win_count = Number(this.data.cross_dark_win_count || 0) + 1;
                this.data.cross_dark_score = Number(this.data.cross_dark_score || 1500) + 25;
                this.data.cross_dark_record_point = Number(this.data.cross_dark_record_point || 0) + 50;
                this.addCurrency(13, 120, queuePush);
                this.addCurrency(14, 120, queuePush);
            }
            var cdF1 = sim1.replay ? JSON.stringify(sim1.replay) : "";
            var cdF2 = sim2.replay ? JSON.stringify(sim2.replay) : "";
            var cdF3 = sim3.replay ? JSON.stringify(sim3.replay) : "";
            var cdHistRes = applyRankSwapAndRecordHistory("cross_dark", this, cdOpp, {
                nowSec: cdFightNow,
                isWin: isWin,
                scoreChange: isWin ? 25 : 0,
                atkTeams: [atk1, atk2, atk3],
                defTeams: [def1, def2, def3],
                roundReplays: [cdF1, cdF2, cdF3],
                roundWins: [!!sim1.isWin, !!sim2.isWin, !!sim3.isWin]
            });
            this.save();

            respond({
                useZip: false,
                isWin: isWin,
                rank: cdHistRes.newRank,
                rankChange: cdHistRes.rankChange,
                replayId: cdHistRes.historyId,
                score: Number(this.data.cross_dark_score || 1500),
                fightCount: Number(this.data.cross_dark_fight_count || 0),
                lastFightTime: cdFightNow,
                fightData1: cdF1,
                fightData2: cdF2,
                fightData3: cdF3
            });
            return true;
        }

        if (cmd === "CrossReceiceDarkArenaRecordPoint" || cmd === "CrossReceiceArenaRecordPoint") {
            var isCdRec = (cmd === "CrossReceiceDarkArenaRecordPoint");
            var ptsRec = isCdRec
                ? Number(this.data.cross_dark_record_point || 0)
                : Number(this.data.cross_arena_record_point || 0);
            if (ptsRec > 0) {
                this.addCurrency(13, ptsRec, queuePush);
                if (isCdRec) this.data.cross_dark_record_point = 0;
                else this.data.cross_arena_record_point = 0;
                this.save();
            }
            respond({ point: ptsRec, status: 1, total_point: 0, left_point: 0 });
            return true;
        }

        if (cmd === "CrossDarkArenaFightHistory" || cmd === SVRCMD.CrossDarkArenaFightHistory) {
            var validCdHist = Array.isArray(this.data.cross_dark_history)
                ? this.data.cross_dark_history.filter(function (x) { return x && x.id && x.atk_id && x.def_id; })
                : [];
            respond({
                history: validCdHist
            });
            return true;
        }

        if (cmd === "CrossClearArenaFightCD" || cmd === "CrossClearDarkArenaFightCD") {
            var isCrossDarkCD = (cmd === "CrossClearDarkArenaFightCD");
            var cCdVar = isCrossDarkCD ? "CS_DARK_ARENA_CD_COST_STONE" : "CS_ARENA_CD_COST_STONE";
            var cCdDefault = isCrossDarkCD ? 100 : 50;
            var cCdCost = Math.max(0, getGlobalVarNumber(cCdVar, cCdDefault));
            if (cCdCost > 0) {
                if (!this.canDeductStone(cCdCost)) {
                    return respond({}, { code: 1, msg: "Không đủ Kim Cương để xóa hồi chiêu!" }), true;
                }
                this.deductStone(cCdCost, queuePush);
            }
            if (isCrossDarkCD) this.data.cross_dark_last_fight_time = 0;
            else this.data.cross_arena_last_fight_time = 0;
            this.save();
            respond({ status: 1 });
            return true;
        }

        return false;
    },
    LIMITED_ARENA_THEMES: LIMITED_ARENA_THEMES,
    getActiveLimitedArenaTheme: getActiveLimitedArenaTheme,
    setLimitedArenaThemeOverride: setLimitedArenaThemeOverride,
    getTowerScheduleState: getTowerScheduleState,
    ensureNormalTowerState: ensureNormalTowerState,
    getKageKeeperMapByLayer: getKageKeeperMapByLayer,
    getTowerBoxCost: getTowerBoxCost
};

module.exports = ArenaAndTowerHandler;
