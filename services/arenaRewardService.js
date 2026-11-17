const fs = require("fs");
const path = require("path");
const ConfigData = require("../config/ConfigData.json");

const STATE_FILE = path.join(__dirname, "..", "data", "scheduler_state.json");
const BOSS_LEVEL_BRACKETS = [70, 90, 110, 130, 150, 170, 190, 210, 230];

const MAIL_TYPE = {
    PK: 2,
    SYS: 3,
    SHADOW: 15,
    CS_SHADOW: 16,
    CS_ARENA: 18,
    CS_BOSS: 19
};

function getUtc7Parts(offsetDays) {
    const shiftMs = (7 * 3600 + Number(offsetDays || 0) * 86400) * 1000;
    const d = new Date(Date.now() + shiftMs);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const hour = d.getUTCHours();
    const minute = d.getUTCMinutes();
    const jsDay = d.getUTCDay(); // 0=Sun..6=Sat
    const weekday = jsDay === 0 ? 7 : jsDay; // 1=Mon..7=Sun
    const pad = (n) => (n < 10 ? "0" + n : String(n));
    return {
        dateStr: `${year}-${pad(month)}-${pad(day)}`,
        year,
        month,
        day,
        hour,
        minute,
        weekday
    };
}

function getBossLevelBracket(teamLv) {
    const lv = Math.max(1, Number(teamLv || 1));
    for (let i = BOSS_LEVEL_BRACKETS.length - 1; i >= 0; i--) {
        const minLv = BOSS_LEVEL_BRACKETS[i];
        if (lv >= minLv || i === 0) {
            const maxLv = i === BOSS_LEVEL_BRACKETS.length - 1 ? 299 : BOSS_LEVEL_BRACKETS[i + 1] - 1;
            return { boss_lv: minLv, min_lv: minLv, max_lv: maxLv };
        }
    }
    return { boss_lv: 70, min_lv: 70, max_lv: 89 };
}

function findRankEntry(list, rank, level) {
    if (!Array.isArray(list) || list.length === 0) return null;
    const r = Math.max(1, Number(rank || 1));
    let candidates = list;
    if (level !== undefined && level !== null) {
        const bracket = getBossLevelBracket(level).boss_lv;
        const byLv = list.filter((e) => Number(e.level) === bracket);
        if (byLv.length > 0) candidates = byLv;
    }
    for (let i = 0; i < candidates.length; i++) {
        const e = candidates[i];
        if (r >= Number(e.rank_start) && r <= Number(e.rank_end)) {
            return e;
        }
    }
    return candidates[candidates.length - 1] || null;
}

function getDarkArenaHourPoint(rank) {
    const entry = findRankEntry(ConfigData.arenateam_rank_box, rank);
    return entry ? Number(entry.point || 50) : 50;
}

function getCrossDarkArenaHourPoint(rank) {
    const entry = findRankEntry(ConfigData.cs_arenateam_rank_box, rank);
    return entry ? Number(entry.point || 50) : 50;
}

function getArenaRankBox(rank) {
    return findRankEntry(ConfigData.arena_rank_box, rank);
}

function getCrossArenaRankBox(level, rank) {
    return findRankEntry(ConfigData.cs_arena_rank_box, rank, level);
}

function getCross3v3RankBox(level, rank) {
    return findRankEntry(ConfigData.cs_3v3arena_rank_box, rank, level);
}

function getCrossBossRankBox(level, rank) {
    return findRankEntry(ConfigData.cs_world_boss_rank_box, rank, level);
}

function pushMailToPlayer(playerData, opts) {
    if (!playerData) return null;
    if (!Array.isArray(playerData.messages)) playerData.messages = [];
    let maxId = 0;
    for (let i = 0; i < playerData.messages.length; i++) {
        const mid = Number((playerData.messages[i] && playerData.messages[i].id) || 0);
        if (mid > maxId) maxId = mid;
    }
    const mailId = Math.max(maxId + 1, Math.floor(Date.now() / 1000) % 100000000 + playerData.messages.length + 1);
    const paramsVal = typeof opts.params === "string"
        ? opts.params
        : JSON.stringify(opts.params || {});
    const mailObj = {
        id: mailId,
        box_id: Number(opts.box_id || 0),
        has_read: 0,
        message_type: Number(opts.message_type || MAIL_TYPE.SYS),
        params: paramsVal,
        send_name: "-1",
        create_time: Math.floor(Date.now() / 1000)
    };
    playerData.messages.unshift(mailObj);
    if (playerData.messages.length > 50) {
        playerData.messages = playerData.messages.slice(0, 50);
    }
    return mailObj;
}

function loadSchedulerState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const raw = fs.readFileSync(STATE_FILE, "utf8");
            return JSON.parse(raw) || {};
        }
    } catch (e) {
        // ignore corrupt state
    }
    return {};
}

function saveSchedulerState(state) {
    try {
        const dir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
    } catch (e) {
        console.error("[ArenaReward] Failed to save scheduler_state.json:", e.message);
    }
}

function getLimitedArenaAppleAmount(rank) {
    const r = Number(rank || 999);
    if (r === 1) return 300;
    if (r === 2) return 250;
    if (r === 3) return 200;
    if (r <= 10) return 150;
    if (r <= 50) return 100;
    return 50;
}

function distribute21hArenaRewards(playerDb, markDirty) {
    if (!playerDb) return 0;
    let sentCount = 0;
    for (const key in playerDb) {
        const pd = playerDb[key];
        if (!pd || !pd.heros || Object.keys(pd.heros).length === 0) continue;
        const lv = Number(pd.team_lv || 1);
        let touched = false;

        // 1. Classic Arena (21:00 -> Mail.TYPE_PK = 2)
        const pkRank = Number(pd.arena_rank || 0);
        if (pkRank > 0) {
            const pkEntry = getArenaRankBox(pkRank);
            if (pkEntry && Number(pkEntry.box_id || 0) > 0) {
                pushMailToPlayer(pd, {
                    message_type: MAIL_TYPE.PK,
                    box_id: Number(pkEntry.box_id),
                    params: { rank: pkRank }
                });
                sentCount++;
                touched = true;
            }
        }

        // 2. Dark Arena / Ám Bộ (21:00 -> Mail.TYPE_SHADOW = 15)
        const darkRank = Number(pd.dark_arena_rank || 0);
        if (darkRank > 0) {
            const darkEntry = getArenaRankBox(darkRank);
            if (darkEntry && Number(darkEntry.box_id2 || 0) > 0) {
                pushMailToPlayer(pd, {
                    message_type: MAIL_TYPE.SHADOW,
                    box_id: Number(darkEntry.box_id2),
                    params: { rank: darkRank }
                });
                sentCount++;
                touched = true;
            }
        }

        // 3. Cross-Server 1v1 (21:00 -> Mail.TYPE_CS_ARENA = 18)
        const csArenaRank = Number(pd.cross_arena_rank || 0);
        if (csArenaRank > 0) {
            const cs1Entry = getCrossArenaRankBox(lv, csArenaRank);
            if (cs1Entry && Number(cs1Entry.box_id || 0) > 0) {
                pushMailToPlayer(pd, {
                    message_type: MAIL_TYPE.CS_ARENA,
                    box_id: 0,
                    params: { rank: csArenaRank, box_id: Number(cs1Entry.box_id) }
                });
                sentCount++;
                touched = true;
            }
        }

        // 4. Cross-Server 7v7 (21:00 -> Mail.TYPE_CS_SHADOW = 16)
        const csDarkRank = Number(pd.cross_dark_rank || 0);
        if (csDarkRank > 0) {
            const cs7Entry = getCross3v3RankBox(lv, csDarkRank);
            if (cs7Entry && Number(cs7Entry.box_id || 0) > 0) {
                pushMailToPlayer(pd, {
                    message_type: MAIL_TYPE.CS_SHADOW,
                    box_id: 0,
                    params: {
                        rank: csDarkRank,
                        box_id: Number(cs7Entry.box_id),
                        bonus_point: Math.max(0, getCrossDarkArenaHourPoint(csDarkRank))
                    }
                });
                sentCount++;
                touched = true;
            }
        }

        if (touched && typeof markDirty === "function") markDirty(key);
    }
    return sentCount;
}

function distributeCrossBossRewards(playerDb, markDirty, targetDateStr) {
    if (!playerDb) return 0;
    const dateStr = targetDateStr || getUtc7Parts().dateStr;
    const byBracket = {};
    for (const key in playerDb) {
        const pd = playerDb[key];
        if (!pd || !pd.heros) continue;
        const dmg = Number(pd.cross_boss_damage || 0);
        if (dmg <= 0) continue;
        if (pd.cross_boss_day && pd.cross_boss_day !== dateStr) continue;
        const bracket = getBossLevelBracket(pd.team_lv || 1).boss_lv;
        if (!byBracket[bracket]) byBracket[bracket] = [];
        byBracket[bracket].push({ key, pd, dmg });
    }

    let sentCount = 0;
    for (const bracketStr in byBracket) {
        const bracket = Number(bracketStr);
        const list = byBracket[bracketStr];
        list.sort((a, b) => b.dmg - a.dmg);
        for (let i = 0; i < list.length; i++) {
            const rank = i + 1;
            const item = list[i];
            const boxEntry = getCrossBossRankBox(bracket, rank);
            if (boxEntry && Number(boxEntry.box_id || 0) > 0) {
                pushMailToPlayer(item.pd, {
                    message_type: MAIL_TYPE.CS_BOSS,
                    box_id: 0,
                    params: { rank: rank, box_id: Number(boxEntry.box_id) }
                });
                if (typeof markDirty === "function") markDirty(item.key);
                sentCount++;
            }
        }
    }
    return sentCount;
}

function distributeLimitedArenaAppleRewards(playerDb, markDirty, targetDateStr) {
    if (!playerDb || !targetDateStr) return 0;
    let sentCount = 0;
    for (const key in playerDb) {
        const pd = playerDb[key];
        if (!pd) continue;
        const fights = (pd.lim_arena_last_fight_day === targetDateStr)
            ? Number(pd.lim_arena_last_day_fights || 0)
            : (pd.lim_arena_day === targetDateStr ? Number(pd.lim_arena_fight_count || 0) : 0);
        if (fights >= 3) {
            const rank = Math.max(1, Number(pd.lim_arena_rank || 50));
            const apples = getLimitedArenaAppleAmount(rank);
            pushMailToPlayer(pd, {
                message_type: MAIL_TYPE.SYS,
                box_id: 0,
                params: {
                    intro: `Thưởng Đấu Trường Giới Hạn ngày ${targetDateStr} (Hạng ${rank}, ${fights} trận): +${apples} Táo`,
                    boxId: 0,
                    items: [{ type: 1, item_id: 10150, amount: apples }]
                }
            });
            pd.lim_arena_last_day_fights = 0;
            if (typeof markDirty === "function") markDirty(key);
            sentCount++;
        }
    }
    return sentCount;
}

function runScheduledRewardTick(ctx) {
    const { playerDb, markDirty, saveDb } = ctx || {};
    if (!playerDb) return null;
    const now = getUtc7Parts();
    const state = loadSchedulerState();
    let changed = false;
    const summary = { date: now.dateStr, hour: now.hour, arena21: 0, boss22: 0, limited00: 0 };

    // Khởi tạo mốc ngày nếu chưa có để tránh phát bù quá khứ xa khi mới cài
    if (!state.lastLimitedDateSeen) {
        state.lastLimitedDateSeen = now.dateStr;
        changed = true;
    }

    // 1. Sang ngày mới (00:00 UTC+7): phát Táo Đấu Trường Giới Hạn cho ngày hôm trước
    if (state.lastLimitedDateSeen !== now.dateStr) {
        const prevDate = state.lastLimitedDateSeen;
        if (state.lastLimited00Date !== prevDate) {
            summary.limited00 = distributeLimitedArenaAppleRewards(playerDb, markDirty, prevDate);
            state.lastLimited00Date = prevDate;
        }
        state.lastLimitedDateSeen = now.dateStr;
        changed = true;
    }

    // 2. 21:00 UTC+7: phát quà xếp hạng các Đấu trường
    if (now.hour >= 21 && state.lastArena21Date !== now.dateStr) {
        summary.arena21 = distribute21hArenaRewards(playerDb, markDirty);
        state.lastArena21Date = now.dateStr;
        changed = true;
    }

    // 3. 22:00 UTC+7: tổng kết & phát quà BXH Dmg CrossBoss
    if (now.hour >= 22 && state.lastBoss22Date !== now.dateStr) {
        summary.boss22 = distributeCrossBossRewards(playerDb, markDirty, now.dateStr);
        state.lastBoss22Date = now.dateStr;
        changed = true;
    }

    if (changed) {
        saveSchedulerState(state);
        if (typeof saveDb === "function") saveDb();
        if (summary.arena21 > 0 || summary.boss22 > 0 || summary.limited00 > 0) {
            console.log(`[ArenaReward] Distributed mails (${now.dateStr} ${now.hour}:00 UTC+7):`, summary);
        }
    }
    return summary;
}

let _schedulerTimer = null;
function startArenaRewardScheduler(ctx) {
    if (_schedulerTimer) return _schedulerTimer;
    // Chạy 1 lần sau khi server khởi động 5s, sau đó mỗi 30s check giờ UTC+7
    setTimeout(() => runScheduledRewardTick(ctx), 5000);
    _schedulerTimer = setInterval(() => runScheduledRewardTick(ctx), 30000);
    return _schedulerTimer;
}

module.exports = {
    BOSS_LEVEL_BRACKETS,
    MAIL_TYPE,
    getUtc7Parts,
    getBossLevelBracket,
    getDarkArenaHourPoint,
    getCrossDarkArenaHourPoint,
    getArenaRankBox,
    getCrossArenaRankBox,
    getCross3v3RankBox,
    getCrossBossRankBox,
    pushMailToPlayer,
    distribute21hArenaRewards,
    distributeCrossBossRewards,
    distributeLimitedArenaAppleRewards,
    runScheduledRewardTick,
    startArenaRewardScheduler
};
