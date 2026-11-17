// ============================================================================
// HANDLER: ĐIỂM DANH, NHIỆM VỤ HÀNG NGÀY, THÀNH TỰU, NHIỆM VỤ NINJA, SỰ KIỆN, VÒNG QUAY, BATTLE PASS, RAID & GIFTCODE
// (SignIn, DailyTaskAward, ReceiveAchievement, TaskInfo/TaskSweep, Online Events, Roulette/Lucky, BattlePass, Raid, Giftcode)
// ============================================================================

const { syncConfigFromUpstream } = require("../config/configLoader");

const EventAndSignInHandler = {
    getPlayableHeroSoulEntries: function () {
        var bySoulId = {};
        if (typeof Config !== "undefined") {
            if (Config.item) {
                for (var sid in Config.item) {
                    var it = Config.item[sid];
                    if (!it || Number(it.item_type) !== 2) continue;
                    var soulNum = Number(sid);
                    var mergeNum = Number(it.merge_id || 0);
                    if (soulNum <= 0) continue;
                    if (!bySoulId[soulNum]) {
                        bySoulId[soulNum] = {
                            soulId: soulNum,
                            heroId: mergeNum,
                            name: (Config.hero && Config.hero[mergeNum] && Config.hero[mergeNum].name) || it.name || ("Hero " + mergeNum)
                        };
                    }
                }
            }
            if (Config.hero) {
                for (var hid in Config.hero) {
                    var hCfg = Config.hero[hid];
                    var hidNum = Number(hid);
                    if (!hCfg || Number(hCfg.sum_soul || 0) <= 0 || hidNum < 10000 || hidNum >= 15000) continue;
                    var mappedSoulId = typeof this.findSoulItemId === "function"
                        ? this.findSoulItemId(hidNum)
                        : (20000 + (hidNum - 10000));
                    if (mappedSoulId > 0 && !bySoulId[mappedSoulId]) {
                        bySoulId[mappedSoulId] = {
                            soulId: mappedSoulId,
                            heroId: hidNum,
                            name: hCfg.name || ("Hero " + hidNum)
                        };
                    }
                }
            }
        }
        var list = Object.keys(bySoulId).map(function (k) { return bySoulId[k]; });
        list.sort(function (a, b) { return b.soulId - a.soulId; });
        return list;
    },

    getLatestPlayableHeroSoulIds: function () {
        return this.getPlayableHeroSoulEntries().map(function (e) { return e.soulId; });
    },

    syncOnlineLuckyWithLatestHero: function () {
        var soulEntries = this.getPlayableHeroSoulEntries();
        if (soulEntries.length === 0) return soulEntries;

        var latestEntry = soulEntries[0];
        var latestSoulId = latestEntry.soulId;

        if (this.onlineLucky && this.onlineLucky.items && Array.isArray(this.onlineLucky.items["11011209"])) {
            var diamondSlots = this.onlineLucky.items["11011209"];
            var mainSeqs = [2, 4, 7];
            for (var i = 0; i < diamondSlots.length; i++) {
                var slot = diamondSlots[i];
                if (mainSeqs.indexOf(Number(slot.seq)) !== -1) {
                    slot.item_type = 1;
                    slot.item_id = latestSoulId;
                    slot.item_amount = 10;
                    slot.weight = 300;
                    slot.need_latern = 1;
                }
            }
        }

        if (Array.isArray(this.onlineEvents)) {
            var exchangeGroup = null;
            for (var gi = 0; gi < this.onlineEvents.length; gi++) {
                var grp = this.onlineEvents[gi];
                if (Array.isArray(grp) && grp.length > 0 && Number(grp[0].types) === 15) {
                    exchangeGroup = grp;
                    break;
                }
            }
            if (exchangeGroup) {
                var hasLatestExchange = false;
                var rewardPattern10 = "1," + latestSoulId + ",10";
                var rewardPattern50 = "1," + latestSoulId + ",50";
                for (var ei = 0; ei < exchangeGroup.length; ei++) {
                    var ev = exchangeGroup[ei];
                    if (ev && (ev.items === rewardPattern10 || ev.items === rewardPattern50)) {
                        hasLatestExchange = true;
                        break;
                    }
                }
                if (!hasLatestExchange) {
                    var baseId = 15900000 + latestSoulId * 10;
                    var cleanHeroName = String(latestEntry.name || ("Hero " + latestEntry.heroId)).replace(/\s*\(Souls\)\s*$/i, "").replace(/^Hồn\s+/i, "");
                    exchangeGroup.unshift(
                        {
                            id: baseId + 1,
                            title: "",
                            content: "10 Golden Key -> 10 " + cleanHeroName + " (Souls)",
                            types: 15,
                            kind: 190,
                            conditions: "99999;0;1,10430,10",
                            platforms: "",
                            daily: 1,
                            enable: 1,
                            from_time: 1704038401,
                            to_time: 1924963199,
                            items: rewardPattern10,
                            create_time: 0,
                            sort: 190,
                            date_type: 1,
                            is_global: 0
                        },
                        {
                            id: baseId + 2,
                            title: "",
                            content: "50 Golden Key -> 50 " + cleanHeroName + " (Souls)",
                            types: 15,
                            kind: 190,
                            conditions: "99999;0;1,10430,50",
                            platforms: "",
                            daily: 1,
                            enable: 1,
                            from_time: 1704038401,
                            to_time: 1924963199,
                            items: rewardPattern50,
                            create_time: 0,
                            sort: 190,
                            date_type: 1,
                            is_global: 0
                        }
                    );
                }
            }
        }
        return soulEntries;
    },

    grantAllHeroSouls: function (soulAmt, specificId, rewardItems, queuePush) {
        var entries = this.getPlayableHeroSoulEntries();
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (specificId > 0 && entry.soulId !== specificId && entry.heroId !== specificId) {
                continue;
            }
            this.changeItemAmount(entry.soulId, soulAmt, queuePush);
            if (rewardItems.length < 18) {
                rewardItems.push({ type: 1, item_id: entry.soulId, amount: soulAmt });
            }
        }
    },

    grantAllSecrets: function (giveExpCnt, rewardItems, queuePush) {
        var expTacticIds = [30104, 30105, 30106, 30107];
        for (var eti = 0; eti < expTacticIds.length; eti++) {
            var expId = expTacticIds[eti];
            this.addSecretEquip(expId, giveExpCnt, queuePush);
            if (rewardItems.length < 18) {
                rewardItems.push({ type: 2, item_id: expId, amount: giveExpCnt });
            }
        }
        if (typeof Config !== "undefined" && Config.equip) {
            var existingTactics = {};
            if (this.data.secrets) {
                for (var tsi = 0; tsi < this.data.secrets.length; tsi++) {
                    var teqKey = Number(this.data.secrets[tsi].equip_id);
                    existingTactics[teqKey] = (existingTactics[teqKey] || 0) + 1;
                }
            }
            for (var bkId in Config.equip) {
                var bkCfg = Config.equip[bkId];
                var bkNum = Number(bkId);
                if (Number(bkCfg.type) === 2 && expTacticIds.indexOf(bkNum) === -1) {
                    var curBk = existingTactics[bkNum] || 0;
                    var targetBk = 3;
                    if (curBk < targetBk) {
                        this.addSecretEquip(bkNum, targetBk - curBk, queuePush);
                    }
                    if (rewardItems.length < 18) {
                        rewardItems.push({ type: 2, item_id: bkNum, amount: targetBk });
                    }
                }
            }
        }
    },

    grantAllGems: function (gemGiveCnt, rewardItems, queuePush) {
        if (typeof Config !== "undefined" && Config.equip) {
            for (var gid in Config.equip) {
                var gCfg = Config.equip[gid];
                var gNum = Number(gid);
                if (Number(gCfg.type) === 3) {
                    this.changeEquipAmount(gNum, gemGiveCnt, queuePush);
                    if (rewardItems.length < 18 && (gNum % 10 === 0 || gNum % 10 === 5 || gNum % 10 === 1)) {
                        rewardItems.push({ type: 2, item_id: gNum, amount: gemGiveCnt });
                    }
                }
            }
        }
        this.syncGemsAndSecrets(queuePush);
    },

    grantAllAvatars: function (rewardItems, queuePush) {
        var grantedSet = {};
        if (typeof Config !== "undefined") {
            if (Config.item) {
                var avIds = Object.keys(Config.item).map(Number).filter(function (iid) {
                    return Config.item[iid] && Number(Config.item[iid].item_type) === 11;
                }).sort(function (a, b) { return b - a; });
                for (var ai = 0; ai < avIds.length; ai++) {
                    var avId = avIds[ai];
                    grantedSet[avId] = true;
                    if (this.getItemAmount(avId) < 1) {
                        this.changeItemAmount(avId, 1, queuePush);
                    }
                    if (rewardItems.length < 18) {
                        rewardItems.push({ type: 1, item_id: avId, amount: 1 });
                    }
                }
            }
            if (Config.player_head) {
                for (var hk in Config.player_head) {
                    var ph = Config.player_head[hk];
                    var phItemId = Number((ph && (ph.item_id || ph.itme_id)) || 0);
                    if (phItemId > 0 && !grantedSet[phItemId] && Config.item && Config.item[phItemId]) {
                        grantedSet[phItemId] = true;
                        if (this.getItemAmount(phItemId) < 1) {
                            this.changeItemAmount(phItemId, 1, queuePush);
                        }
                        if (rewardItems.length < 18) {
                            rewardItems.push({ type: 1, item_id: phItemId, amount: 1 });
                        }
                    }
                }
            }
        }
    },

    grantAllItemsAndEquips: function (rewardItems, queuePush) {
        if (typeof Config !== "undefined" && Config.item) {
            for (var iid in Config.item) {
                var it = Config.item[iid];
                var itType = Number(it.item_type || 0);
                if (itType !== 2) {
                    if (itType === 11) {
                        if (this.getItemAmount(Number(iid)) < 1) {
                            this.changeItemAmount(Number(iid), 1, queuePush);
                        }
                    } else {
                        var giveAmt = (itType === 12) ? 500 : ((itType === 3) ? 999 : 5000);
                        this.changeItemAmount(Number(iid), giveAmt, queuePush);
                        if (rewardItems.length < 12) {
                            rewardItems.push({ type: 1, item_id: Number(iid), amount: giveAmt });
                        }
                    }
                }
            }
        }
        if (typeof Config !== "undefined" && Config.equip) {
            for (var eid in Config.equip) {
                var eq = Config.equip[eid];
                var eqType = Number(eq.type || eq.types || 1);
                if (eqType === 1) {
                    this.changeEquipAmount(Number(eid), 99, queuePush);
                    if (rewardItems.length < 18) {
                        rewardItems.push({ type: 2, item_id: Number(eid), amount: 99 });
                    }
                }
            }
        }
        if (typeof Config !== "undefined" && Config.ninja_tool) {
            for (var ntid in Config.ninja_tool) {
                this.changeNinjaToolAmount(Number(ntid), 10, queuePush);
            }
        }
    },

    computeEventWindow: function (ev, nowSec) {
        if (!ev) return { from_time: 0, to_time: 0 };
        var rec = Number(ev.recurrence_seconds || 0);
        if (rec > 0) {
            if (ev._orig_from_time === undefined) {
                ev._orig_from_time = Number(ev.from_time || 0);
                ev._orig_to_time = Number(ev.to_time || 0);
            }
            if (rec === 86400) {
                var vnOffset = 7 * 3600;
                var vnDayStart = Math.floor((nowSec + vnOffset) / 86400) * 86400 - vnOffset;
                return { from_time: vnDayStart, to_time: vnDayStart + 86400 - 1 };
            }
            var origFrom = ev._orig_from_time;
            var origTo = ev._orig_to_time;
            var k = Math.floor((nowSec - origFrom) / rec);
            return { from_time: origFrom + k * rec, to_time: origTo + k * rec };
        }
        var f = Number(ev.from_time || 0);
        var t = Number(ev.to_time || 0);
        if (f > nowSec) f = nowSec - 3600;
        if (t > 0 && t < nowSec) t = nowSec + 86400 * 30;
        return { from_time: f, to_time: t };
    },

    ensureDailyAndEventReset: function () {
        if (!this.data) return;
        var nowMs = Date.now();
        var nowSec = Math.floor(nowMs / 1000);
        var d = new Date(nowMs + 7 * 3600 * 1000);
        var todayStr = d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");

        if (this.data.last_reset_date !== todayStr) {
            this.data.last_reset_date = todayStr;
            if (this.data.daily_counts && typeof this.data.daily_counts === "object") {
                for (var dk in this.data.daily_counts) {
                    if (
                        dk === "MONTH_CARD_FOREVER" ||
                        dk.indexOf("_EXPIRE_TIME") !== -1 ||
                        dk.indexOf("PLAYER_GOODS_COUNT_ID_") === 0
                    ) {
                        continue;
                    }
                    delete this.data.daily_counts[dk];
                }
            } else {
                this.data.daily_counts = {};
            }
            this.data.daily_recharge_usd = 0;
            this.data.bronze_count = 0;
            this.data.task_refresh_date = todayStr;
            this.data.task_gold_refresh_count = 0;
            this.data.task_today_count = 0;
        }

        if (!this.data.event_cycle_keys) this.data.event_cycle_keys = {};
        if (!this.data.event_claims) this.data.event_claims = {};
        if (!this.data.event_process) this.data.event_process = {};

        var evGroups = this.onlineEvents || [];
        var seenKind = {};
        for (var gi = 0; gi < evGroups.length; gi++) {
            var grp = evGroups[gi];
            if (!Array.isArray(grp)) continue;
            for (var ej = 0; ej < grp.length; ej++) {
                var ev = grp[ej];
                if (!ev || !ev.recurrence_seconds) continue;
                var kind = Number(ev.kind || 0);
                if (!kind || seenKind[kind]) continue;
                seenKind[kind] = true;

                var win = this.computeEventWindow(ev, nowSec);
                if (this.data.event_cycle_keys[kind] !== win.from_time) {
                    this.data.event_cycle_keys[kind] = win.from_time;
                    // Xóa trạng thái đã nhận của tất cả mốc thuộc kind này khi sang chu kỳ mới
                    for (var gj = 0; gj < evGroups.length; gj++) {
                        var g2 = evGroups[gj];
                        if (!Array.isArray(g2)) continue;
                        for (var ek = 0; ek < g2.length; ek++) {
                            if (g2[ek] && Number(g2[ek].kind) === kind) {
                                delete this.data.event_claims[Number(g2[ek].id)];
                            }
                        }
                    }
                    if (kind === 1840) this.data.daily_recharge_usd = 0;
                    else if (kind === 1820) this.data.recharge_3d_usd = 0;
                    else if (kind === 1810) this.data.recharge_weekly_usd = 0;
                    else if (kind === 1830) this.data.single_recharge_counts = {};
                    else if (kind === 1060) {
                        this.data.total_stone_spent = 0;
                        this.data.event_process[5] = 0;
                    } else if (kind === 1070) {
                        this.data.total_gold_spent = 0;
                        this.data.event_process[6] = 0;
                    } else if (kind === 1050) this.data.total_arena_fights = 0;
                    else if (kind === 1010) this.data.total_buy_sp = 0;
                    else if (kind === 1020) this.data.total_buy_gold = 0;
                    else if (kind === 1030) this.data.total_dark_arena_fights = 0;
                    else if (kind === 1000) this.data.total_lucky_spins = 0;
                    else if (kind === 1040) this.data.total_school_count = 0;
                }
            }
        }
    },

    handleEventAndSignInCommand: function (cmd, params, respond, queuePush) {
        if (typeof this.ensureDailyAndEventReset === "function") {
            this.ensureDailyAndEventReset();
        }
        var self = this;

        // 1. Điểm danh hàng ngày (SignInView.js)
        if (cmd === SVRCMD.SignInInfo) {
            if (!Array.isArray(this.data.sign_days)) this.data.sign_days = [];
            respond({ days: this.data.sign_days });
            return true;
        }

        if (cmd === SVRCMD.SignIn) {
            if (!Array.isArray(this.data.sign_days)) this.data.sign_days = [];
            var nowDate = new Date(Date.now() + 7 * 3600 * 1000);
            var today = nowDate.getUTCDate();
            var month = nowDate.getUTCMonth() + 1;
            var already = false;
            for (var i = 0; i < this.data.sign_days.length; i++) {
                if (Number(this.data.sign_days[i].day) === today) {
                    already = true;
                    break;
                }
            }
            if (!already) {
                this.data.sign_days.push({ day: today });
            }
            var signIdx = this.data.sign_days.length;
            var signTable = (typeof Config !== "undefined") ? (Config.signIn || Config.sign) : null;
            if (signTable && signTable[month] && signTable[month][signIdx]) {
                var sCfg = signTable[month][signIdx];
                var vipReq = Number(sCfg.twice_drop_vip_lv || sCfg.vip || 0);
                var mult = (vipReq > 0 && Number(this.data.vip_lv || 0) >= vipReq) ? 2 : 1;
                var amt = Number(sCfg.amount || 1) * mult;
                var iType = Number(sCfg.item_type !== undefined ? sCfg.item_type : (sCfg.reward_type || 1));
                var iId = Number(sCfg.item_id || 0);
                this.grantTaskReward(iType, iId, amt, queuePush);
            } else {
                // Fallback reward if config table missing
                this.addStone(100, queuePush);
            }
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ days: this.data.sign_days });
            return true;
        }

        // 2. Nhiệm vụ hàng ngày (TaskLayer.js -> SVRCMD.DailyTaskAward)
        if (cmd === SVRCMD.DailyTaskAward) {
            var taskId = Number((params && params[0]) || 0);
            if (!this.data.daily_counts) this.data.daily_counts = {};
            this.data.daily_counts["PLAYER_COMPLETE_DAILT_TASK_" + taskId] = 1;

            if (taskId === 12) {
                // Free Stamina (12:00-14:00 -> 120 SP, 18:00-20:00 -> 60 SP, 21:00-24:00 -> 60 SP)
                var vnHour = new Date(Date.now() + 7 * 3600 * 1000).getUTCHours();
                if (vnHour < 14) {
                    this.data.daily_counts["PLAYER_COMPLETE_DAILT_TASK_12_12"] = 1;
                    this.addSp(120, queuePush);
                } else if (vnHour < 20) {
                    this.data.daily_counts["PLAYER_COMPLETE_DAILT_TASK_12_18"] = 1;
                    this.addSp(60, queuePush);
                } else {
                    this.data.daily_counts["PLAYER_COMPLETE_DAILT_TASK_12_21"] = 1;
                    this.addSp(60, queuePush);
                }
            } else if (typeof Config !== "undefined" && Config.daily_task && Config.daily_task[taskId]) {
                var dtCfg = Config.daily_task[taskId];
                for (var ri = 1; ri <= 3; ri++) {
                    var rType = Number(dtCfg["award_type_" + ri] || 0);
                    var rId = Number(dtCfg["award_id_" + ri] || 0);
                    var rAmt = Number(dtCfg["award_amount_" + ri] || 0);
                    if (taskId === 13 && ri === 1) {
                        // VIP daily sweep tickets bonus
                        rAmt = rAmt + Math.max(Number(this.data.vip_lv || 0) - 1, 0) * 10;
                    }
                    if (rType > 0 && rAmt > 0) {
                        this.grantTaskReward(rType, rId, rAmt, queuePush);
                    }
                }
            } else {
                this.addTeamExp(100);
                this.addStone(100, queuePush);
            }
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({});
            return true;
        }

        // 3. Thành tựu (TaskLayer.js -> SVRCMD.ReceiveAchievement)
        if (cmd === SVRCMD.ReceiveAchievement) {
            var achId = Number((params && params[0]) || 0);
            if (!this.data.achievements) this.data.achievements = {};
            this.data.achievements["PLAYER_ACHIEVEMENT_" + achId] = 1;
            var aCfg = (typeof Config !== "undefined" && Config.achievement && Config.achievement[achId]) ? Config.achievement[achId] : null;
            if (aCfg) {
                var r1Type = Number(aCfg.item1_type || 0);
                var r1Id = Number(aCfg.item1_id || 0);
                var r1Amt = Number(aCfg.item1_count || 0);
                if (r1Type > 0 && r1Amt > 0) this.grantTaskReward(r1Type, r1Id, r1Amt, queuePush);

                var r2Type = Number(aCfg.item2_type || 0);
                var r2Id = Number(aCfg.item2_id || 0);
                var r2Amt = Number(aCfg.item2_count || 0);
                if (r2Type > 0 && r2Amt > 0) this.grantTaskReward(r2Type, r2Id, r2Amt, queuePush);

                var r3Type = Number(aCfg.item3_type || 0);
                var r3Id = Number(aCfg.item3_id || 0);
                var r3Amt = Number(aCfg.item_3_count || aCfg.item3_count || 0);
                if (r3Type > 0 && r3Amt > 0) this.grantTaskReward(r3Type, r3Id, r3Amt, queuePush);
            } else {
                this.addStone(100, queuePush);
            }
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({});
            return true;
        }

        // 4. Sự kiện Online (GetAllEvents, GetAllEventsProcess, ReceivedEventAward)
        if (cmd === SVRCMD.GetAllEvents) {
            this.syncOnlineLuckyWithLatestHero();
            var nowSec = Math.floor(Date.now() / 1000);
            var evGroups = this.onlineEvents || [];
            for (var gi = 0; gi < evGroups.length; gi++) {
                var grp = evGroups[gi];
                if (!grp) continue;
                for (var ej = 0; ej < grp.length; ej++) {
                    var ev = grp[ej];
                    var win = this.computeEventWindow(ev, nowSec);
                    ev.from_time = win.from_time;
                    ev.to_time = win.to_time;
                }
            }
            respond({ events: evGroups });
            return true;
        }

        if (cmd === SVRCMD.GetAllEventsProcess || cmd === SVRCMD.GetEventProcess) {
            var pList = [];
            var evGroups2 = this.onlineEvents || [];
            var myPid = this.getNumericId();
            var selfRef = this;
            var computeEventProcessVal = function (evObj) {
                var eid = Number(evObj.id);
                var eType = Number(evObj.types);
                var condStr = String(evObj.conditions || "1");
                var condParts = condStr.split(",");
                switch (eType) {
                    case 1: // TYPE_TOTAL_RECHARG ($ USD accumulated)
                        if (Number(evObj.kind) === 1840) {
                            return Number(selfRef.data.daily_recharge_usd || 0);
                        }
                        if (Number(evObj.kind) === 1820) {
                            return Number(selfRef.data.recharge_3d_usd || 0);
                        }
                        if (Number(evObj.kind) === 1810) {
                            return Number(selfRef.data.recharge_weekly_usd || 0);
                        }
                        return Number(selfRef.data.total_recharge_usd || 0);
                    case 2: // TYPE_DAY_RECHARG
                    case 4: // TYPE_TOTAL_TIMES_RECHARG
                        return Number(selfRef.data.recharge_days || 0);
                    case 3: // TYPE_TIMES_RECHARG (Single Recharge $X)
                    case 14: // TYPE_RECHARGE_N_TIMES
                        if (condParts.length >= 2) {
                            var reqUsd = condParts[1].trim();
                            var reqRound = Math.round(parseFloat(reqUsd) || 0);
                            var sMap = selfRef.data.single_recharge_counts || {};
                            if (sMap[reqUsd] || sMap[reqRound]) {
                                return Number(sMap[reqUsd] || sMap[reqRound] || 0);
                            }
                            return 0;
                        }
                        return Number(selfRef.data.recharge_times || 0);
                    case 5: // TYPE_STONE_COST (Diamonds spent)
                        return Number(selfRef.data.total_stone_spent || (selfRef.data.event_process && selfRef.data.event_process[5]) || 0);
                    case 6: // TYPE_GOLD_COST (Gold spent)
                        return Number(selfRef.data.total_gold_spent || (selfRef.data.event_process && selfRef.data.event_process[6]) || 0);
                    case 7: // TYPE_LOGIN_DAYS
                        return Math.max(1, Array.isArray(selfRef.data.sign_days) ? selfRef.data.sign_days.length : 1);
                    case 8: // TYPE_BOX_TEN
                        return Number(selfRef.data.total_gold_box_ten || 0);
                    case 9: // TYPE_BOX_HUN
                        return Number(selfRef.data.total_mystery_box || 0);
                    case 12: // TYPE_PK_TIMES (Arena fights)
                        return Number(selfRef.data.total_arena_fights || 0);
                    case 13: // TYPE_VIP_REWARD (VIP Pack)
                        var reqVip = Number(condParts[1] !== undefined ? condParts[1] : condParts[0]) || 1;
                        return Number(selfRef.data.vip_lv || 0) >= reqVip ? 1 : 0;
                    case 15: // TYPE_ITEM_EXCHANGE
                        return Number((selfRef.data.event_process && selfRef.data.event_process[eid]) || 0);
                    case 16: // TYPE_BUY_SP
                        return Number(selfRef.data.total_buy_sp || 0);
                    case 17: // TYPE_BUY_GOLD
                        return Number(selfRef.data.total_buy_gold || 0);
                    case 18: // TYPE_DARK_ARENA_COUNT
                        return Number(selfRef.data.total_dark_arena_fights || 0);
                    case 19: // TYPE_LUCKY_COUNT
                        return Number(selfRef.data.total_lucky_spins || 0);
                    case 20: // TYPE_PLUNDER_COUNT
                        return Number(selfRef.data.total_plunder_count || 0);
                    case 21: // TYPE_SCHOOL_COUNT
                        return Number(selfRef.data.total_school_count || 0);
                    default:
                        return 0;
                }
            };

            for (var gi2 = 0; gi2 < evGroups2.length; gi2++) {
                var grp2 = evGroups2[gi2];
                if (!grp2) continue;
                for (var ej2 = 0; ej2 < grp2.length; ej2++) {
                    var ev2 = grp2[ej2];
                    var eid = Number(ev2.id);
                    var eType = Number(ev2.types);
                    var hasRec = (this.data.event_claims && this.data.event_claims[eid]) ? 1 : 0;
                    var procVal = computeEventProcessVal(ev2);
                    if (eType === 15) {
                        var maxEx = parseInt(String(ev2.conditions || "99999").split(";")[0]) || 99999;
                        hasRec = procVal >= maxEx ? 1 : 0;
                    }
                    pList.push({
                        event_id: eid,
                        player_id: myPid,
                        has_received: hasRec,
                        process: procVal
                    });
                }
            }
            respond({ process_list: pList, process: 0 });
            return true;
        }

        if (cmd === SVRCMD.ReceivedEventAward) {
            var evType = Number((params && params[0]) || 0);
            var evId = Number((params && params[1]) || 0);
            var targetEv = null;
            var evGroups3 = this.onlineEvents || [];
            for (var gi3 = 0; gi3 < evGroups3.length; gi3++) {
                var grp3 = evGroups3[gi3];
                if (!grp3) continue;
                for (var ej3 = 0; ej3 < grp3.length; ej3++) {
                    if (Number(grp3[ej3].id) === evId) {
                        targetEv = grp3[ej3];
                        break;
                    }
                }
                if (targetEv) break;
            }
            if (targetEv) {
                var tType = Number(targetEv.types);
                if (tType === 15) {
                    var condSplit = String(targetEv.conditions || "").split(";");
                    var maxExLimit = parseInt(condSplit[0]) || 99999;
                    var curExCnt = Number((this.data.event_process && this.data.event_process[evId]) || 0);
                    if (curExCnt >= maxExLimit) {
                        return respond({}, { code: 1, msg: "Đã đạt giới hạn đổi thưởng của mục này!" }), true;
                    }
                    if (condSplit.length >= 3 && condSplit[2]) {
                        var needArr = condSplit[2].split("-");
                        // First verify all exchange requirements
                        for (var vni = 0; vni < needArr.length; vni++) {
                            var vnp = needArr[vni].split(",");
                            var vnType = Number(vnp[0] || 1);
                            var vnId = Number(vnp[1] || 0);
                            var vnAmt = Number(vnp[2] || 0);
                            if (vnType === 1 && !this.canDeductItem(vnId, vnAmt)) {
                                return respond({}, { code: 1, msg: "Không đủ vật phẩm để đổi thưởng!" }), true;
                            } else if (vnType === 2 && !this.canDeductEquip(vnId, vnAmt)) {
                                return respond({}, { code: 1, msg: "Không đủ trang bị để đổi thưởng!" }), true;
                            } else if (vnType === 3 && !this.canDeductGold(vnAmt)) {
                                return respond({}, { code: 1, msg: "Không đủ Vàng để đổi thưởng!" }), true;
                            } else if (vnType === 4 && !this.canDeductStone(vnAmt)) {
                                return respond({}, { code: 1, msg: "Không đủ Kim Cương để đổi thưởng!" }), true;
                            }
                        }
                        // Deduct all exchange requirements
                        for (var ni = 0; ni < needArr.length; ni++) {
                            var np = needArr[ni].split(",");
                            var nType = Number(np[0] || 1);
                            var nId = Number(np[1] || 0);
                            var nAmt = Number(np[2] || 0);
                            if (nType === 1) this.deductItem(nId, nAmt, queuePush);
                            else if (nType === 2) this.deductEquip(nId, nAmt, queuePush);
                            else if (nType === 3) this.deductGold(nAmt, queuePush);
                            else if (nType === 4) this.deductStone(nAmt, queuePush);
                        }
                    }
                    this.data.event_process[evId] = curExCnt + 1;
                } else {
                    if (this.data.event_claims && this.data.event_claims[evId]) {
                        return respond({}, { code: 1, msg: "Bạn đã nhận phần thưởng này rồi!" }), true;
                    }
                    this.data.event_claims[evId] = 1;
                }
                var itemStr = String(targetEv.items || "");
                if (itemStr.length > 0) {
                    var entries = itemStr.split("-");
                    for (var ei = 0; ei < entries.length; ei++) {
                        var sub = entries[ei].split(",");
                        var rType = Number(sub[0] || 1);
                        var rId = Number(sub[1] || 0);
                        var rAmt = Number(sub[2] || 1);
                        if (rType === 1) {
                            this.changeItemAmount(rId, rAmt, queuePush);
                        } else if (rType === 2) {
                            if (rId >= 30000) {
                                this.addSecretEquip(rId, rAmt, queuePush);
                            } else {
                                this.changeEquipAmount(rId, rAmt, queuePush);
                            }
                        } else if (rType === 3) {
                            this.addGold(rAmt, queuePush);
                        } else if (rType === 4) {
                            this.addStone(rAmt, queuePush);
                        } else if (rType === 5) {
                            this.addSp(rAmt, queuePush);
                        }
                    }
                }
            }
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({});
            return true;
        }

        // 5. Vòng Quay May Mắn (LuckyInfo, PlayerLuckyInfo, LuckyLogs, Lucky)
        if (cmd === SVRCMD.LuckyInfo) {
            this.syncOnlineLuckyWithLatestHero();
            var nowSec = Math.floor(Date.now() / 1000);
            var minTo = nowSec + 86400 * 180;
            if (this.onlineLucky && this.onlineLucky.luckys) {
                for (var lk in this.onlineLucky.luckys) {
                    if (this.onlineLucky.luckys[lk].to_time < minTo) {
                        this.onlineLucky.luckys[lk].to_time = minTo;
                    }
                }
            }
            respond(this.onlineLucky);
            return true;
        }

        if (cmd === SVRCMD.PlayerLuckyInfo) {
            respond({ gold: 0, item: 0, stone: 0 });
            return true;
        }

        if (cmd === SVRCMD.LuckyLogs) {
            respond({
                logs: [
                    { seq: 4, item: 60040, player_name: this.data.team_name || "Nhẫn Giả" },
                    { seq: 2, item: 10230, player_name: "Kurumi" },
                    { seq: 12, item: 30105, player_name: "Kakashi" }
                ]
            });
            return true;
        }

        if (cmd === SVRCMD.Lucky) {
            this.syncOnlineLuckyWithLatestHero();
            var luckyId = Number((params && params[0]) || 11011208);
            var tabIdx = Number((params && params[1]) || 1);
            var count = Number((params && params[2]) || 1);
            var lBasic = (this.onlineLucky && this.onlineLucky.luckys && this.onlineLucky.luckys[luckyId]) ? this.onlineLucky.luckys[luckyId] : null;
            var lItems = (this.onlineLucky && this.onlineLucky.items && this.onlineLucky.items[luckyId]) ? this.onlineLucky.items[luckyId] : [];
            var discRate = (count === 10 && lBasic && lBasic.lucky_10_cost_rate) ? (Number(lBasic.lucky_10_cost_rate) / 100) : 1;
            if (tabIdx === 1) {
                var gCost = Math.floor(Number((lBasic && lBasic.gold_cost) || 999999) * count * discRate);
                if (!this.canDeductGold(gCost)) return respond({}, { code: 1, msg: "Không đủ Vàng!" }), true;
                this.deductGold(gCost, queuePush);
            } else if (tabIdx === 2) {
                var sCost = Math.floor(Number((lBasic && lBasic.stone_cost) || 999) * count * discRate);
                if (!this.canDeductStone(sCost)) return respond({}, { code: 1, msg: "Không đủ Kim Cương!" }), true;
                this.deductStone(sCost, queuePush);
            } else {
                var needItemId = Number((lBasic && lBasic.item_id) || 10050);
                var iCost = Math.floor(Number((lBasic && lBasic.item_amount) || 99) * count * discRate);
                if (!this.canDeductItem(needItemId, iCost)) return respond({}, { code: 1, msg: "Không đủ đạo cụ quay!" }), true;
                this.deductItem(needItemId, iCost, queuePush);
            }
            var outLogs = [];
            for (var li = 0; li < count; li++) {
                if (lItems.length > 0) {
                    var pick = lItems[Math.floor(Math.random() * lItems.length)];
                    var pType = Number(pick.item_type || 1);
                    var pId = Number(pick.item_id || 10230);
                    var pAmt = Number(pick.item_amount || 1);
                    if (pType === 1) {
                        this.changeItemAmount(pId, pAmt, queuePush);
                    } else if (pType === 2) {
                        if (pId >= 30000) this.addSecretEquip(pId, pAmt, queuePush);
                        else this.changeEquipAmount(pId, pAmt, queuePush);
                    } else if (pType === 3) {
                        this.addGold(pAmt, queuePush);
                    } else if (pType === 4) {
                        this.addStone(pAmt, queuePush);
                    }
                    outLogs.push({ seq: pick.seq, item: pId, player_name: this.data.team_name || "Nhẫn Giả" });
                }
            }
            this.data.total_lucky_spins = Number(this.data.total_lucky_spins || 0) + count;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ logs: outLogs });
            return true;
        }

        // 6. Quà Nạp Đầu & Quà VIP (ReceiveFirstRecharge, ReceiveVipGiftBag)
        if (cmd === SVRCMD.ReceiveFirstRecharge) {
            if (Number(this.data.had_recharge_gift) === 2) {
                return respond({}, { code: 1, msg: "Bạn đã nhận quà nạp lần đầu rồi!" }), true;
            }
            this.data.had_recharge_gift = 2;
            this.addGold(500000, queuePush);
            this.addOrConvertHero(10050, queuePush);
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ status: 1 });
            return true;
        }

        if (cmd === SVRCMD.ReceiveVipGiftBag) {
            var vipLv = Number((params && params[0]) || 5);
            if (Number(this.data["had_vip" + vipLv + "_gift"]) === 2) {
                return respond({}, { code: 1, msg: "Bạn đã nhận quà VIP " + vipLv + " rồi!" }), true;
            }
            this.data["had_vip" + vipLv + "_gift"] = 2;
            this.addGold(1000000, queuePush);
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ status: 1 });
            return true;
        }

        // 7. Battle Pass ("Sổ Sứ Mệnh" - BattlePassInfo, BattlePassClaim, BattlePassRedeem)
        if (cmd === "BattlePassInfo" || cmd === "BattlePassClaim" || cmd === "BattlePassRedeem" || cmd === SVRCMD.BattlePassInfo || cmd === SVRCMD.BattlePassClaim || cmd === SVRCMD.BattlePassRedeem) {
            var nowMs = Date.now();
            var tiers = [];
            var freeCycle = [
                { kind: "item", itemId: 10140, name: "Bí Ngô", amount: 5 },
                { kind: "item", itemId: 10210, name: "Kẹo", amount: 5 },
                { kind: "item", itemId: 10440, name: "Chìa Khóa Sắt", amount: 1 },
                { kind: "sp", itemId: 0, name: "Thể Lực", amount: 150 },
                { kind: "item", itemId: 10420, name: "Chìa Khóa Đồng", amount: 1 }
            ];
            var premCycle = [
                { kind: "item", itemId: 10210, name: "Kẹo", amount: 15 },
                { kind: "item", itemId: 10140, name: "Bí Ngô", amount: 15 },
                { kind: "item", itemId: 10420, name: "Chìa Khóa Đồng", amount: 2 },
                { kind: "item", itemId: 10440, name: "Chìa Khóa Sắt", amount: 2 },
                { kind: "item", itemId: 10430, name: "Chìa Khóa Vàng", amount: 2 }
            ];
            for (var t = 1; t <= 30; t++) {
                var fc = freeCycle[(t - 1) % freeCycle.length];
                var pc = premCycle[(t - 1) % premCycle.length];
                var mult = 1 + Math.floor((t - 1) / 10);
                tiers.push({
                    tier: t,
                    free: { kind: fc.kind, itemId: fc.itemId, name: fc.name, amount: fc.amount * mult },
                    premium: { kind: pc.kind, itemId: pc.itemId, name: pc.name, amount: pc.amount * mult }
                });
            }
            if (!this.data.bp_claims) this.data.bp_claims = [];
            if (this.data.bp_xp === undefined) this.data.bp_xp = 1450;
            if (this.data.bp_level === undefined) this.data.bp_level = 5;
            if (this.data.bp_premium === undefined) this.data.bp_premium = true;

            var hasClaimed = function (claimsArr, tr, tk) {
                for (var ci = 0; ci < claimsArr.length; ci++) {
                    if (claimsArr[ci].tier == tr && claimsArr[ci].track == tk) return true;
                }
                return false;
            };
            var grantBpReward = function (selfRef, rw) {
                if (!rw) return;
                if (rw.kind === "sp") {
                    selfRef.addSp(Number(rw.amount || 100), queuePush);
                } else if (rw.itemId > 0) {
                    selfRef.changeItemAmount(rw.itemId, Number(rw.amount || 1), queuePush);
                }
            };

            if (cmd === "BattlePassRedeem" || cmd === SVRCMD.BattlePassRedeem) {
                var rKind = (params && params[0]) || "xp";
                if (rKind === "xp") {
                    this.data.bp_xp = Math.min(8700, Number(this.data.bp_xp || 0) + 500);
                    this.data.bp_level = Math.min(30, Math.floor(this.data.bp_xp / 290));
                } else {
                    this.data.bp_premium = true;
                }
            } else if (cmd === "BattlePassClaim" || cmd === SVRCMD.BattlePassClaim) {
                var cTier = Number((params && params[0]) || 1);
                var cTrack = String((params && params[1]) || "free");
                if (cTrack === "all") {
                    for (var ti = 1; ti <= this.data.bp_level; ti++) {
                        if (!hasClaimed(this.data.bp_claims, ti, "free")) {
                            this.data.bp_claims.push({ tier: ti, track: "free" });
                            grantBpReward(this, tiers[ti - 1].free);
                        }
                        if (this.data.bp_premium && !hasClaimed(this.data.bp_claims, ti, "premium")) {
                            this.data.bp_claims.push({ tier: ti, track: "premium" });
                            grantBpReward(this, tiers[ti - 1].premium);
                        }
                    }
                } else if (cTier >= 1 && cTier <= this.data.bp_level) {
                    if (!hasClaimed(this.data.bp_claims, cTier, cTrack)) {
                        this.data.bp_claims.push({ tier: cTier, track: cTrack });
                        grantBpReward(this, tiers[cTier - 1][cTrack]);
                    }
                }
            }

            var missions = [
                { id: "login", name: "Đăng nhập mỗi ngày", description: "Vào game 1 lần trong ngày", target: 1, xp: 80, progress: 1, completed: true },
                { id: "campaign", name: "Vượt ải cốt truyện", description: "Hoàn thành hoặc càn quét 5 ải", target: 5, xp: 100, progress: 5, completed: true },
                { id: "arena", name: "Khiêu chiến Đấu Trường", description: "Tham gia 3 trận Đấu Trường", target: 3, xp: 100, progress: 3, completed: true },
                { id: "task", name: "Nhiệm vụ Ninja", description: "Hoàn thành 3 Nhiệm vụ Ninja", target: 3, xp: 100, progress: 3, completed: true },
                { id: "tower", name: "Tranh Bá Nhẫn Giới", description: "Chiến thắng 2 trận Lôi Đài / Tháp", target: 2, xp: 100, progress: 2, completed: true },
                { id: "raid", name: "Hợp Chiến Raid Boss", description: "Tham gia 1 trận Raid Boss", target: 1, xp: 100, progress: 1, completed: true }
            ];
            respond({
                entitlements: { xp_uses: 99, premium_uses: 1 },
                season: { id: "s1-20261023", name: "DI SẢN HỎA CHÍ", subtitle: "MÙA 01", start: nowMs - 86400000 * 5, end: nowMs + 86400000 * 25, levels: 30, xpPerLevel: 290 },
                now: nowMs,
                xp: Number(this.data.bp_xp || 1450),
                level: Number(this.data.bp_level || 5),
                premium: !!this.data.bp_premium,
                claims: this.data.bp_claims,
                tiers: tiers,
                missions: missions
            });
            return true;
        }

        // 8. Raid Boss Hợp Chiến (RaidInfo, RaidCreate, RaidJoin, RaidSelect, RaidStart, RaidLeave)
        if (cmd === "RaidInfo" || cmd === "RaidCreate" || cmd === "RaidJoin" || cmd === "RaidSelect" || cmd === "RaidStart" || cmd === "RaidLeave") {
            var keyCount = this.getItemAmount(10440);
            if (keyCount < 1) {
                keyCount = 10;
                this.changeItemAmount(10440, 10, queuePush);
            }
            var bosses = [
                { id: 1, name: "Dễ", heroId: 17001, tailId: 16101, lineup: "Kaguya + Nhất Vĩ", reward: 20 },
                { id: 2, name: "Thường", heroId: 17001, tailId: 16201, lineup: "Kaguya + Nhị Vĩ", reward: 30 },
                { id: 3, name: "Khó", heroId: 17001, tailId: 16301, lineup: "Kaguya + Tam Vĩ", reward: 40 },
                { id: 4, name: "Ác Mộng", heroId: 17001, tailId: 16401, lineup: "Kaguya + Tứ Vĩ", reward: 60 }
            ];
            if (cmd === "RaidCreate" || cmd === "RaidJoin") {
                var bId = Number((params && params[0]) || 1);
                if (isNaN(bId) || bId < 1 || bId > 4) bId = 1;
                var firstHeroId = 10070;
                for (var hk in this.data.heros) {
                    firstHeroId = Number(hk);
                    break;
                }
                this.data.raid_room = {
                    raidId: "raid_" + Date.now(),
                    code: "888888",
                    bossId: bId,
                    hostId: 1,
                    state: "waiting",
                    rewardItemId: 10140,
                    rewardPreview: bosses[bId - 1].reward,
                    members: [
                        { playerId: 1, name: this.data.team_name || "Nhẫn Giả", level: Number(this.data.team_lv || 1), icon: Number(this.data.icon || 80110070), heroId: firstHeroId, heroQuality: 5, hasEntryKey: true },
                        { playerId: 2, name: "Kakashi (AI)", level: 60, icon: 80110050, heroId: 10050, heroQuality: 10, hasEntryKey: true }
                    ]
                };
            } else if (cmd === "RaidSelect") {
                var selHeroId = Number((params && params[0]) || 10070);
                if (this.data.raid_room && this.data.raid_room.members && this.data.raid_room.members[0]) {
                    var hObj = this.data.heros[selHeroId];
                    this.data.raid_room.members[0].heroId = selHeroId;
                    this.data.raid_room.members[0].heroQuality = hObj ? Number(hObj.quality || 1) : 1;
                }
            } else if (cmd === "RaidStart") {
                if (this.data.raid_room) {
                    var bId2 = Number(this.data.raid_room.bossId || 1);
                    var rwAmt = bosses[bId2 - 1] ? bosses[bId2 - 1].reward : 20;
                    this.changeItemAmount(10440, -1, queuePush);
                    this.changeItemAmount(10140, rwAmt, queuePush);
                    this.data.raid_room.state = "done";
                    this.data.raid_room.win = true;
                    this.data.raid_room.reward = rwAmt;
                    this.data.raid_room.damage = 950000;
                    keyCount = Math.max(0, keyCount - 1);
                }
            } else if (cmd === "RaidLeave") {
                this.data.raid_room = null;
            }
            respond({
                serverNow: Date.now(),
                keyId: 10440,
                candyId: 10140,
                rewardItemId: 10140,
                keyCount: keyCount,
                bosses: bosses,
                rules: { minMembers: 2, maxMembers: 5, keyCost: 1, dailyLimit: 0, rewardItemId: 10140 },
                room: this.data.raid_room || null
            });
            return true;
        }

        // 9. Giftcode & Lệnh GM trong Ô Nhập Code (SVRCMD.UseGiftBagCode)
        if (cmd === SVRCMD.UseGiftBagCode) {
            var rawCode = String((params && params[0]) || "").trim();
            var parts = rawCode.toUpperCase().split(/[\s=_:-]+/).filter(Boolean);
            var gmCmd = parts[0] || "";
            var valIdx = 1;

            if (gmCmd === "GM" || gmCmd === "TEST") {
                gmCmd = parts[1] || "ALL";
                valIdx = 2;
            } else if (gmCmd.startsWith("TEST") && gmCmd.length > 4) {
                gmCmd = gmCmd.substring(4);
            } else if (gmCmd.startsWith("GM") && gmCmd.length > 2) {
                gmCmd = gmCmd.substring(2);
            }

            var val = (parts.length > valIdx && !isNaN(parseInt(parts[valIdx]))) ? parseInt(parts[valIdx]) : 0;
            var val2 = (parts.length > valIdx + 1 && !isNaN(parseInt(parts[valIdx + 1]))) ? parseInt(parts[valIdx + 1]) : 0;
            var rewardItems = [];

            // 1. GMGold / GMVang: Cộng Vàng
            if (gmCmd === "GOLD" || gmCmd === "VANG" || gmCmd === "TIEN" || gmCmd === "COIN") {
                var addGold = val > 0 ? val : 1000000000;
                this.addGold(addGold, queuePush);
                rewardItems.push({ type: 3, item_id: 0, amount: addGold });
                respond({ items: rewardItems });
                return true;
            }

            // 2. GMDiamond / GMKC / GMStone: Cộng Kim Cương
            if (gmCmd === "DIAMOND" || gmCmd === "DIA" || gmCmd === "KC" || gmCmd === "KIMCUONG" || gmCmd === "STONE") {
                var addStone = val > 0 ? val : 1000000;
                this.addStone(addStone, queuePush);
                rewardItems.push({ type: 4, item_id: 0, amount: addStone });
                respond({ items: rewardItems });
                return true;
            }

            // 3. GMSoul / GMHero / GMNinja: Cộng Soul (Hồn Ninja) vào túi đồ (tự động từ Config mới nhất)
            if (gmCmd === "HERO" || gmCmd === "SOUL" || gmCmd === "SOULS" || gmCmd === "TUONG" || gmCmd === "NINJA") {
                var soulEntries = this.getPlayableHeroSoulEntries();
                var isKnownSoulOrHero = false;
                if (val > 0) {
                    for (var sei = 0; sei < soulEntries.length; sei++) {
                        if (soulEntries[sei].soulId === val || soulEntries[sei].heroId === val) {
                            isKnownSoulOrHero = true;
                            break;
                        }
                    }
                }
                var specificId = isKnownSoulOrHero ? val : 0;
                var soulAmt = isKnownSoulOrHero ? (val2 > 0 ? val2 : 2000) : (val > 0 ? val : 2000);
                this.grantAllHeroSouls(soulAmt, specificId, rewardItems, queuePush);
                respond({ items: rewardItems });
                return true;
            }

            // 4. GMBiKip / GMSecret: Cộng Bí Kíp + EXP Bí Kíp (type 2 trong Config.equip)
            if (gmCmd === "BIKIP" || gmCmd === "SECRET" || gmCmd === "SECRETS" || gmCmd === "EXPSECRET" || gmCmd === "BIKIPEXP") {
                var giveExpCnt = val > 0 ? val : 50;
                this.grantAllSecrets(giveExpCnt, rewardItems, queuePush);
                respond({ items: rewardItems });
                return true;
            }

            // 5. GMGem / GMNgoc / GMDa: Cộng Đá khảm / Ngọc (type 3 trong Config.equip)
            if (gmCmd === "GEM" || gmCmd === "GEMS" || gmCmd === "DA" || gmCmd === "NGOC" || gmCmd === "DAKHAM") {
                var gemGiveCnt = (val > 0 && val <= 50) ? val : 100;
                this.grantAllGems(gemGiveCnt, rewardItems, queuePush);
                respond({ items: rewardItems });
                return true;
            }

            // 6. GMItem / GMPack / GMDo: Cộng toàn bộ Item, Trang bị, Nhẫn cụ vào túi đồ
            if (gmCmd === "ITEM" || gmCmd === "ITEMS" || gmCmd === "PACK" || gmCmd === "DO" || gmCmd === "RUONG" || gmCmd === "BAG" || gmCmd === "MANUAL") {
                if (val >= 10000 && typeof Config !== "undefined") {
                    if (Config.item && Config.item[val]) {
                        var singleAmt = val2 > 0 ? val2 : 1000;
                        this.changeItemAmount(val, singleAmt, queuePush);
                        rewardItems.push({ type: 1, item_id: val, amount: singleAmt });
                        respond({ items: rewardItems });
                        return true;
                    }
                    if (Config.equip && Config.equip[val]) {
                        var singleEqAmt = val2 > 0 ? val2 : 99;
                        this.changeEquipAmount(val, singleEqAmt, queuePush);
                        rewardItems.push({ type: 2, item_id: val, amount: singleEqAmt });
                        respond({ items: rewardItems });
                        return true;
                    }
                }
                this.grantAllItemsAndEquips(rewardItems, queuePush);
                respond({ items: rewardItems });
                return true;
            }

            // 7. GMExp / GMLv: Cộng EXP Đội
            if (gmCmd === "EXP" || gmCmd === "TEXTEXP" || gmCmd === "LV" || gmCmd === "LEVEL") {
                var expAdd = val > 0 ? val : 500000;
                this.addTeamExp(expAdd);
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                rewardItems.push({ type: 10, item_id: 0, amount: expAdd });
                respond({ items: rewardItems });
                return true;
            }

            // 8. GMSp / GMTheLuc / GMVit: Cộng Thể Lực
            if (gmCmd === "VIT" || gmCmd === "SP" || gmCmd === "TL" || gmCmd === "THELUC" || gmCmd === "ENERGY") {
                var addSp = val > 0 ? val : 5000;
                this.addSp(addSp, queuePush);
                rewardItems.push({ type: 5, item_id: 0, amount: addSp });
                respond({ items: rewardItems });
                return true;
            }

            var applyVipState = function (targetVip) {
                targetVip = Math.min(20, Math.max(0, targetVip));
                self.data.vip_lv = targetVip;
                if (typeof Config !== "undefined" && Config.vipLevel && Config.vipLevel[targetVip]) {
                    self.data.vip_exp = Number(Config.vipLevel[targetVip].upg_vip_exp || 0);
                }
                self.data.had_recharge_gift = 1;
                self.data.had_vip5_gift = 1;
                self.data.had_vip9_gift = 1;
                self.data.had_vip11_gift = 1;
                self.data.had_vip13_gift = 1;
            };

            var applyAllCardsState = function () {
                var nowSecCard = Math.floor(Date.now() / 1000);
                if (!self.data.card_expire_times) self.data.card_expire_times = {};
                self.data.card_expire_times.PLAYER_CARD_EXPIRE_TIME = nowSecCard + 86400 * 30;
                self.data.card_expire_times.MONTH_CARD_FOREVER = 1;
                self.data.card_expire_times.PLAYER_GOLD_CARD_EXPIRE_TIME = nowSecCard + 86400 * 30;
                self.data.card_expire_times.PLAYER_WHITE_GOLD_EXPIRE_TIME = nowSecCard + 86400 * 30;
                self.data.card_expire_times.PLAYER_WEEK_CARD_EXPIRE_TIME = nowSecCard + 86400 * 7;
                self.data.card_expire_times.PLAYER_PLATINUM_WEEK_CARD_EXPIRE_TIME = nowSecCard + 86400 * 7;
            };

            // 9. GMVip: Nâng cấp VIP
            if (gmCmd === "VIP" || gmCmd === "SVIP") {
                applyVipState(val > 0 ? val : 15);
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                rewardItems.push({ type: 4, item_id: 0, amount: 10000 });
                respond({ items: rewardItems });
                return true;
            }

            // 10. GMCard: Kích hoạt toàn bộ Thẻ Tháng / Thẻ Tuần / Thẻ Trọn Đời
            if (gmCmd === "CARD" || gmCmd === "THE" || gmCmd === "THETHANG") {
                applyAllCardsState();
                this.addStone(50000, queuePush);
                rewardItems.push({ type: 4, item_id: 0, amount: 50000 });
                respond({ items: rewardItems });
                return true;
            }

            // 11. GMFullHero / UnlockHero / AllHero: Mở khóa toàn bộ Ninja mới nhất + tặng thêm Hồn
            if (gmCmd === "FULLHERO" || gmCmd === "UNLOCKHERO" || gmCmd === "ALLHERO") {
                var fullEntries = this.getPlayableHeroSoulEntries();
                var extraSoulAmt = val > 0 ? val : 500;
                for (var fi = 0; fi < fullEntries.length; fi++) {
                    var fe = fullEntries[fi];
                    if (fe.heroId > 0 && (!this.data.heros || !this.data.heros[fe.heroId])) {
                        if (typeof this.addOrConvertHero === "function") {
                            this.addOrConvertHero(fe.heroId, queuePush);
                        }
                    }
                    if (fe.soulId > 0) {
                        this.changeItemAmount(fe.soulId, extraSoulAmt, queuePush);
                        if (rewardItems.length < 18) {
                            rewardItems.push({ type: 1, item_id: fe.soulId, amount: extraSoulAmt });
                        }
                    }
                }
                respond({ items: rewardItems });
                return true;
            }

            // 12. GMAvatar / GMHead / GMSkin: Mở khóa toàn bộ Khung & Avatar (bao gồm tướng mới)
            if (gmCmd === "AVATAR" || gmCmd === "HEAD" || gmCmd === "SKIN" || gmCmd === "ICON") {
                this.grantAllAvatars(rewardItems, queuePush);
                respond({ items: rewardItems });
                return true;
            }

            // 13. GMAll / GMFull: Full tài nguyên, VIP 15, Thẻ tháng, toàn bộ Hồn Tướng, Item, Bí Kíp, Ngọc, Avatar mới nhất
            if (gmCmd === "ALL" || gmCmd === "FULL") {
                this.grantAllHeroSouls(2000, 0, rewardItems, queuePush);
                this.grantAllItemsAndEquips(rewardItems, queuePush);
                this.grantAllSecrets(50, rewardItems, queuePush);
                this.grantAllGems(6, rewardItems, queuePush);
                this.grantAllAvatars(rewardItems, queuePush);
                this.addGold(100000000, queuePush);
                this.addStone(1000000, queuePush);
                this.addSp(5000, queuePush);
                applyVipState(15);
                applyAllCardsState();
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                respond({ items: rewardItems });
                return true;
            }

            // 14. GMSync / GMUpdate / GMHotfix: Đồng bộ Config mới nhất từ bản chính & tặng 100 hồn 6 tướng mới nhất
            if (gmCmd === "SYNC" || gmCmd === "UPDATE" || gmCmd === "HOTFIX") {
                syncConfigFromUpstream({ force: true }, function (syncErr, syncRes) {
                    if (syncErr) {
                        console.error("[-] GMSync error:", syncErr.message);
                    }
                    self.syncOnlineLuckyWithLatestHero();
                    var latestEntries = self.getPlayableHeroSoulEntries();
                    var syncSoulAmt = val > 0 ? val : 100;
                    var seenHeroes = {};
                    var grantedCnt = 0;
                    for (var si = 0; si < latestEntries.length && grantedCnt < 6; si++) {
                        var se = latestEntries[si];
                        if (!se || !se.soulId) continue;
                        if (se.heroId > 0 && seenHeroes[se.heroId]) continue;
                        if (se.heroId > 0) seenHeroes[se.heroId] = true;
                        self.changeItemAmount(se.soulId, syncSoulAmt, queuePush);
                        if (rewardItems.length < 18) {
                            rewardItems.push({ type: 1, item_id: se.soulId, amount: syncSoulAmt });
                        }
                        grantedCnt++;
                    }
                    if (rewardItems.length === 0) {
                        rewardItems.push({ type: 4, item_id: 0, amount: 1000 });
                    }
                    respond({ items: rewardItems });
                });
                return true;
            }

            if (gmCmd === "RESET") {
                this.initDefaultData();
                this.ensureDataFields();
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                rewardItems.push({ type: 3, item_id: 0, amount: 100000 });
                respond({ items: rewardItems });
                return true;
            }

            // Default giftcode fallback: gift 100,000 Diamonds & 100,000,000 Gold
            this.addStone(100000, queuePush);
            this.addGold(100000000, queuePush);
            rewardItems.push({ type: 4, item_id: 0, amount: 100000 });
            rewardItems.push({ type: 3, item_id: 0, amount: 100000000 });
            respond({ items: rewardItems });
            return true;
        }

        // 10. Nhiệm Vụ Ninja ("Nhiệm Vụ Ninja" - MissionView.js)
        if (cmd === SVRCMD.TaskInfo || cmd === SVRCMD.RefreshTask || cmd === SVRCMD.TaskSweep || cmd === SVRCMD.AfterTaskFight) {
            var getVnDateStr = function () {
                var d = new Date(Date.now() + 7 * 3600 * 1000);
                var y = d.getUTCFullYear();
                var m = String(d.getUTCMonth() + 1).padStart(2, "0");
                var day = String(d.getUTCDate()).padStart(2, "0");
                return y + "-" + m + "-" + day;
            };
            var getGlobalTaskVar = function (key, fallback) {
                if (typeof Config !== "undefined" && Config.global_var) {
                    if (Config.global_var[key] && Config.global_var[key].v_string !== undefined) {
                        return Number(Config.global_var[key].v_string);
                    }
                    for (var gk in Config.global_var) {
                        var gv = Config.global_var[gk];
                        if (gv && gv.k === key && gv.v_string !== undefined) {
                            return Number(gv.v_string);
                        }
                    }
                }
                return fallback;
            };
            var getAwakeTaskSet = function () {
                var set = {};
                if (typeof Config !== "undefined" && Config.hero) {
                    for (var hid in Config.hero) {
                        var hCfg = Config.hero[hid];
                        if (hCfg && hCfg.awake_task_ids) {
                            var parts = String(hCfg.awake_task_ids).split("/");
                            for (var pi = 0; pi < parts.length; pi++) {
                                var tidNum = Number(parts[pi]);
                                if (tidNum > 0) set[tidNum] = true;
                            }
                        }
                    }
                }
                return set;
            };
            var isSingleHeroLocked = function (taskCfg) {
                var lim = taskCfg && taskCfg.limit_heros ? String(taskCfg.limit_heros).trim() : "0";
                return (lim !== "" && lim !== "0" && lim.indexOf(";") === -1);
            };
            var pickNinjaMissionTaskId = function (mode, excludeTaskId) {
                if (typeof Config === "undefined" || !Config.task) return 11011;
                var awakeSet = getAwakeTaskSet();
                var pool = [];
                var isStone = (mode === "stone");
                for (var tk in Config.task) {
                    var t = Config.task[tk];
                    if (!t) continue;
                    var tidNum = Number(t.id || tk);
                    var baseW = Number(t.weight || 0);
                    var lv = Number(t.lv || 1);
                    if (baseW <= 0) continue; // Bỏ qua toàn bộ nhiệm vụ thức tỉnh / chuỗi nhiệm vụ có weight = 0
                    if (isStone && lv !== 4 && lv !== 5) continue; // Làm mới 30 KC chỉ ra A (lv 4) và S (lv 5)

                    var isAwakeOrSingle = Boolean(awakeSet[tidNum]) || isSingleHeroLocked(t);
                    if (isStone && isAwakeOrSingle) continue; // Làm mới 30 KC không ra nhiệm vụ thức tỉnh khóa 1 tướng

                    var effWeight = baseW;
                    if (!isStone && isAwakeOrSingle) {
                        // Làm mới thường: lâu lâu mới có nhiệm vụ khóa 1 tướng
                        effWeight = 1;
                    } else if (isStone && lv === 5) {
                        // Tăng nhẹ tỉ lệ S thường (Truy sát Akatsuki) trong pool A/S
                        effWeight = Math.max(baseW, 30);
                    }
                    pool.push({ id: tidNum, weight: effWeight });
                }
                if (pool.length === 0) return 11011;
                if (excludeTaskId && pool.length > 1) {
                    var filtered = pool.filter(function (item) { return item.id !== Number(excludeTaskId); });
                    if (filtered.length > 0) pool = filtered;
                }
                var totalWeight = 0;
                for (var i = 0; i < pool.length; i++) totalWeight += pool[i].weight;
                var roll = Math.random() * totalWeight;
                for (var j = 0; j < pool.length; j++) {
                    roll -= pool[j].weight;
                    if (roll <= 0) return pool[j].id;
                }
                return pool[pool.length - 1].id;
            };

            var todayStr = getVnDateStr();
            if (this.data.task_refresh_date !== todayStr) {
                this.data.task_refresh_date = todayStr;
                this.data.task_gold_refresh_count = 0;
                this.data.task_today_count = 0;
            }

            if (cmd === SVRCMD.TaskInfo || cmd === SVRCMD.RefreshTask) {
                if (cmd === SVRCMD.RefreshTask) {
                    var refreshType = Number((params && params[0]) || 1); // 1: Vàng, 2: Kim Cương (30 KC)
                    if (refreshType === 2) {
                        var stoneCost = getGlobalTaskVar("TASK_STONE_REFRESH_COST", 30);
                        if (!this.canDeductStone(stoneCost)) {
                            return respond({}, { code: 1, msg: "Không đủ Kim Cương! (Cần " + stoneCost + " Kim Cương)" }), true;
                        }
                        this.deductStone(stoneCost, queuePush);
                        this.data.active_awake_hero = 0;
                        this.data.cur_task_id = pickNinjaMissionTaskId("stone", this.data.cur_task_id);
                    } else {
                        var maxGoldRefresh = getGlobalTaskVar("TASK_GOLD_REFRESH_PER_DAY_COUNT", 20);
                        var usedGoldRefresh = Number(this.data.task_gold_refresh_count || 0);
                        if (usedGoldRefresh >= maxGoldRefresh) {
                            return respond({}, { code: 1, msg: "Hết lượt làm mới bằng Vàng hôm nay!" }), true;
                        }
                        var goldCost = getGlobalTaskVar("TASK_GOLD_REFRESH_COST", 50000);
                        if (!this.canDeductGold(goldCost)) {
                            return respond({}, { code: 1, msg: "Không đủ Vàng! (Cần " + goldCost + " Vàng)" }), true;
                        }
                        this.deductGold(goldCost, queuePush);
                        this.data.task_gold_refresh_count = usedGoldRefresh + 1;
                        this.data.active_awake_hero = 0;
                        this.data.cur_task_id = pickNinjaMissionTaskId("normal", this.data.cur_task_id);
                    }
                } else {
                    if (this.data.active_awake_hero && this.data.cur_task_id) {
                        // Keep active awake task intact for hero awakening!
                    } else if (!this.data.cur_task_id || (typeof Config !== "undefined" && Config.task && !Config.task[this.data.cur_task_id])) {
                        this.data.cur_task_id = pickNinjaMissionTaskId("normal", 0);
                    }
                }

                // Tính số lượng nhiệm vụ tối đa mỗi ngày theo cấp Đội và cấp VIP (từ 20 đến 35 nhiệm vụ)
                var pLv = Number(this.data.team_lv || 1);
                var pVip = Number(this.data.vip_lv || 0);
                var maxTaskCount = 20 + Math.floor(pLv / 10) + Math.min(10, pVip);

                respond({
                    task_id: this.data.cur_task_id,
                    today_count: Number(this.data.task_today_count || 0),
                    total_count: maxTaskCount,
                    gold_refresh_count: Number(this.data.task_gold_refresh_count || 0)
                });
                return true;
            }

            // SVRCMD.TaskSweep || SVRCMD.AfterTaskFight
            if (cmd === SVRCMD.AfterTaskFight && params && params.length >= 2 && Number(params[1]) === 0) {
                respond({ is_win: 0, items: [], task_id: this.data.cur_task_id || 11011 });
                return true;
            }
            var tid = this.data.cur_task_id || 11011;
            var tCfg = (typeof Config !== "undefined" && Config.task && Config.task[tid]) ? Config.task[tid] : null;
            var expGain = tCfg ? Number(tCfg.team_exp || 20) : 20;
            var goldGain = tCfg ? Number(tCfg.gold || 5000) : 5000;
            this.addTeamExp(expGain);
            this.addGold(goldGain, queuePush);

            var dropItems = [];
            if (tCfg && tCfg.box_id && typeof Config !== "undefined" && Config.box_drop && Config.box_drop[tCfg.box_id]) {
                var grp = Config.box_drop[tCfg.box_id];
                var dKeys = Object.keys(grp);
                for (var dIdx = 0; dIdx < dKeys.length; dIdx++) {
                    var dObj = grp[dKeys[dIdx]];
                    if (dObj) {
                        var granted = this.grantBoxDropReward(dObj, queuePush);
                        if (granted) dropItems.push(granted);
                    }
                }
            } else {
                this.changeItemAmount(10020, 2, queuePush);
                dropItems.push({ type: 1, item_id: 10020, amount: 2 });
            }
            var nextAwakeTaskId = 0;
            if (this.data.active_awake_hero) {
                var aHeroId = Number(this.data.active_awake_hero);
                if (!this.data.awake_task_progress) this.data.awake_task_progress = {};
                var aCfg = (typeof Config !== "undefined" && Config.hero && Config.hero[aHeroId]) ? Config.hero[aHeroId] : null;
                var aTaskIds = (aCfg && aCfg.awake_task_ids) ? String(aCfg.awake_task_ids).split("/").map(Number).filter(function (x) { return x > 0; }) : [];
                if (this.data.awake_task_progress[aHeroId] !== 1) {
                    if (!this.data.awake_task_progress[aHeroId] || typeof this.data.awake_task_progress[aHeroId] !== "object") {
                        this.data.awake_task_progress[aHeroId] = {};
                    }
                    this.data.awake_task_progress[aHeroId][String(tid)] = 1;
                }
                var progMap = (this.data.awake_task_progress[aHeroId] && typeof this.data.awake_task_progress[aHeroId] === "object")
                    ? this.data.awake_task_progress[aHeroId]
                    : null;
                for (var ai = 0; ai < aTaskIds.length; ai++) {
                    if (this.data.awake_task_progress[aHeroId] !== 1 && (!progMap || progMap[String(aTaskIds[ai])] !== 1)) {
                        nextAwakeTaskId = aTaskIds[ai];
                        break;
                    }
                }
                if (nextAwakeTaskId > 0) {
                    // Còn nhiệm vụ tiếp theo trong chuỗi thức tỉnh của tướng
                    this.data.cur_task_id = nextAwakeTaskId;
                } else {
                    if (aCfg && aCfg.awake_equip_id) {
                        this.changeEquipAmount(Number(aCfg.awake_equip_id), 1, queuePush);
                    }
                    this.data.active_awake_hero = 0;
                }
            }
            if (!nextAwakeTaskId) {
                this.data.cur_task_id = pickNinjaMissionTaskId("normal", tid);
            }
            this.data.task_today_count = Number(this.data.task_today_count || 0) + 1;
            this.data.daily_counts["PLAYER_DIALY_TASK_11"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_11"] || 0) + 1;
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ is_win: 1, items: dropItems, task_id: this.data.cur_task_id });
            return true;
        }

        if (cmd === SVRCMD.TreeInfo || cmd === SVRCMD.WaterTree || cmd === SVRCMD.ReceiveTreeAward) {
            respond({ status: 1 });
            return true;
        }

        return false;
    }
};

module.exports = EventAndSignInHandler;
