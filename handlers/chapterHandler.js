/**
 * Chapter & Battle Handler
 * Handle Ải cốt truyện, Càn quét (Sweep), Khu rừng chết, Thử thách, Vĩ thú (Special Chapter)
 */

function rollChapterDrops(self, cid, queuePush, grantImmediately) {
    const dropItems = [];
    if (typeof Config !== "undefined" && Config.chapter_box && Config.chapter_box[cid]) {
        const cbMap = Config.chapter_box[cid];
        const bKeys = Object.keys(cbMap);
        for (let i = 0; i < bKeys.length; i++) {
            const boxId = Number(bKeys[i]);
            const cbObj = cbMap[boxId];
            const weight = Number((cbObj && cbObj.weight) || 5000);
            if (Math.random() * 10000 <= Math.max(weight, 3500)) {
                const drops = self.rollBoxDrops(boxId, 1);
                if (drops && drops.length > 0) {
                    const d = drops[0];
                    dropItems.push(d);
                    if (grantImmediately) {
                        self.grantBoxDropReward(d, queuePush);
                    }
                }
            }
            if (dropItems.length >= 3) break;
        }
    }
    if (dropItems.length === 0) {
        const fallback = { type: 1, item_id: 10010, amount: 1 };
        dropItems.push(fallback);
        if (grantImmediately) {
            self.changeItemAmount(10010, 1, queuePush);
        }
    }
    return dropItems;
}

function updateChapterProgress(chaptersObj, cid, star) {
    if (!chaptersObj) return false;
    cid = Number(cid);
    star = Number(star || 3);
    let diffKey = "1";
    if (cid >= 50010 && cid < 51000) diffKey = "1";
    else if (cid >= 51000 && cid < 52000) diffKey = "2";
    else if (cid >= 52000 && cid < 53000) diffKey = "3";
    else if (cid >= 53000 && cid < 54000) diffKey = "16";
    else if (typeof Config !== "undefined" && Config.chapter && Config.chapter[cid]) {
        diffKey = String(Config.chapter[cid].difficult || 4);
    }
    if (!Array.isArray(chaptersObj[diffKey])) {
        chaptersObj[diffKey] = [];
    }
    const arr = chaptersObj[diffKey];
    let isFirst3Star = false;
    let found = null;
    for (let i = 0; i < arr.length; i++) {
        if (Number(arr[i].chapter_id) === cid) {
            found = arr[i];
            break;
        }
    }
    if (!found) {
        if (star === 3) isFirst3Star = true;
        arr.push({ chapter_id: cid, star: star, difficulty: Number(diffKey) });
    } else {
        if (Number(found.star || 0) < 3 && star === 3) isFirst3Star = true;
        if (star > Number(found.star || 0)) found.star = star;
    }
    return isFirst3Star;
}

function recordDailyChapterTask(self, cid, times) {
    times = Math.max(1, Number(times || 1));
    cid = Number(cid || 0);
    if (!self.data.daily_counts) self.data.daily_counts = {};
    if (cid >= 50010 && cid < 51000) {
        self.data.daily_counts["PLAYER_DIALY_TASK_3"] = Number(self.data.daily_counts["PLAYER_DIALY_TASK_3"] || 0) + times;
    } else if (cid >= 51000 && cid < 52000) {
        self.data.daily_counts["PLAYER_DIALY_TASK_4"] = Number(self.data.daily_counts["PLAYER_DIALY_TASK_4"] || 0) + times;
    } else if (cid >= 52000 && cid < 53000) {
        self.data.daily_counts["PLAYER_DIALY_TASK_5"] = Number(self.data.daily_counts["PLAYER_DIALY_TASK_5"] || 0) + times;
    } else if (cid >= 53000 && cid < 55000) {
        self.data.daily_counts["PLAYER_DIALY_TASK_6"] = Number(self.data.daily_counts["PLAYER_DIALY_TASK_6"] || 0) + times;
    } else if (cid >= 55000) {
        self.data.daily_counts["PLAYER_DIALY_TASK_6"] = Number(self.data.daily_counts["PLAYER_DIALY_TASK_6"] || 0) + times;
        self.data.daily_counts["PLAYER_DIALY_TASK_18"] = Number(self.data.daily_counts["PLAYER_DIALY_TASK_18"] || 0) + times;
    }
}

function handleChapter(cmd, params, respond, queuePush) {
    if (cmd === SVRCMD.ChapterInfo) {
        if (this.data.chapters) {
            for (const k in this.data.chapters) {
                if (Number(k) >= 50000 && !Array.isArray(this.data.chapters[k])) {
                    delete this.data.chapters[k];
                }
            }
            if (!Array.isArray(this.data.chapters["1"]) || this.data.chapters["1"].length === 0) {
                this.data.chapters["1"] = [{ chapter_id: 50011, star: 0 }];
            }
        }
        respond({ chapters: this.data.chapters });
        return true;
    }

    if (cmd === SVRCMD.BeforeFight || cmd === SVRCMD.BeforeTowerFight || cmd === SVRCMD.BeforeTaskFight || cmd === SVRCMD.BeforeSchoolFight || cmd === SVRCMD.BeforeSpecialFight) {
        const cid = Number((params && params[0]) || 50011);
        if (!isNaN(cid) && cid >= 50000) {
            this.data.last_fight_cid = cid;
        }

        // Kiểm tra điều kiện Level và Ngày mở của Ải
        if (typeof Config !== "undefined" && Config.chapter && Config.chapter[cid]) {
            const cCfg = Config.chapter[cid];
            const pLv = Number(this.data.team_lv || 1);
            if (cCfg.lv_limit && pLv < Number(cCfg.lv_limit)) {
                return respond({}, { code: 1, msg: "Cấp Đội chưa đạt Lv." + cCfg.lv_limit + " để mở ải này!" }), true;
            }
            if (cCfg.open_weekday && cCfg.open_weekday !== "0") {
                const nowVN = new Date(Date.now() + 7 * 3600 * 1000);
                let curDay = nowVN.getUTCDay(); // 0 is Sunday, 1..6 is Mon..Sat
                if (curDay === 0) curDay = 7;
                const openDays = String(cCfg.open_weekday).split("/").map(Number);
                if (openDays.indexOf(curDay) === -1) {
                    return respond({}, { code: 1, msg: "Ải này hôm nay chưa mở (Mở vào Thứ: " + cCfg.open_weekday + ")!" }), true;
                }
            }
        }

        if (params && params[2]) {
            this.data.last_fight_heros = String(params[2]).split(",");
        }
        const dropItems = rollChapterDrops(this, cid, null, false);
        this.data.last_fight_drops = dropItems;
        respond({ sign: String(cid || "OFFLINE_SIGN"), items: dropItems });
        return true;
    }

    if (cmd === SVRCMD.AfterFight) {
        // FightScene sends: [bm.signCode, iswin, star]
        let cid = Number((params && params[0]) || 0);
        if (isNaN(cid) || cid < 50000) {
            cid = Number(this.data.last_fight_cid || 50011);
        }
        let isWin = 1;
        let star = 3;
        if (params && params.length >= 3) {
            isWin = Number(params[1] ? 1 : 0);
            star = Number(params[2] || 3);
        } else if (params && params.length === 2) {
            star = Number(params[1] || 3);
        }

        const chCfg = (typeof Config !== "undefined" && Config.chapter && Config.chapter[cid]) ? Config.chapter[cid] : null;
        if (!isWin) {
            respond({ isFirst3Star: false, gold: 0, exp: 0, items: [] });
            return true;
        }

        const isFirst3Star = updateChapterProgress(this.data.chapters, cid, star);
        recordDailyChapterTask(this, cid, 1);

        if (!this.data.chapter_counts) this.data.chapter_counts = {};
        const cInfo = this.data.chapter_counts[cid] || { todayCount: 0, resetCount: 0 };
        cInfo.todayCount = Number(cInfo.todayCount || 0) + 1;
        this.data.chapter_counts[cid] = cInfo;

        const baseGold = chCfg ? Number(chCfg.coin || chCfg.gold || 500) : 500;
        const goldReward = (isFirst3Star && cid < 55000) ? (baseGold * 3) : baseGold;
        const expReward = chCfg ? Number(chCfg.team_exp || chCfg.exp || 6) : 6;
        const heroExpReward = chCfg ? Number(chCfg.hero_exp || 15) : 15;
        const spCost = chCfg ? Number(chCfg.cost_sp || chCfg.sp_cost || 6) : 6;

        this.deductSp(Math.min(Number(this.data.sp || 0), spCost), null);
        this.addGold(goldReward, null);
        this.addTeamExp(expReward, null);

        if (Array.isArray(this.data.last_fight_heros)) {
            for (let hi = 0; hi < this.data.last_fight_heros.length; hi++) {
                const hid = Number(this.data.last_fight_heros[hi]);
                if (hid > 0 && this.data.heros && this.data.heros[hid]) {
                    this.addHeroExp(hid, heroExpReward);
                    queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(hid) });
                }
            }
        }
        queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

        const dropItems = (Array.isArray(this.data.last_fight_drops) && this.data.last_fight_drops.length > 0)
            ? this.data.last_fight_drops
            : rollChapterDrops(this, cid, null, false);
        for (let di = 0; di < dropItems.length; di++) {
            this.grantBoxDropReward(dropItems[di], queuePush);
        }
        this.data.last_fight_drops = null;

        respond({ isFirst3Star: isFirst3Star, gold: goldReward, exp: expReward, items: dropItems });
        return true;
    }

    if (cmd === SVRCMD.AfterSpecialFight) {
        let isWin = 1;
        if (params && params.length >= 2) {
            isWin = Number(params[1] ? 1 : 0);
        }
        if (!isWin) {
            respond({ isFirst3Star: false, gold: 0, exp: 0, items: [] });
            return true;
        }

        const cid = Number(this.data.last_fight_cid || 55013);
        const chCfg = (typeof Config !== "undefined" && Config.chapter && Config.chapter[cid]) ? Config.chapter[cid] : null;
        const goldGain = chCfg ? Number(chCfg.coin || 20000) : 20000;
        const expGain = chCfg ? Number(chCfg.team_exp || 6) : 6;
        const spCost = chCfg ? Number(chCfg.cost_sp || 6) : 6;
        this.deductSp(Math.min(Number(this.data.sp || 0), spCost), null);
        this.addGold(goldGain, null);
        this.addTeamExp(expGain, null);
        updateChapterProgress(this.data.chapters, cid, 3);
        recordDailyChapterTask(this, cid, 1);
        const dropItems = rollChapterDrops(this, cid, queuePush, true);
        queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        respond({ isFirst3Star: false, gold: goldGain, exp: expGain, items: dropItems });
        return true;
    }

    if (cmd === SVRCMD.Sweep) {
        const cid = Number((params && params[0]) || 50011);
        const diff = Number((params && params[1]) || 1);
        const times = Math.max(1, Number((params && params[2]) || 1));

        const chCfg = (typeof Config !== "undefined" && Config.chapter && Config.chapter[cid]) ? Config.chapter[cid] : null;
        const goldPer = chCfg ? Number(chCfg.coin || chCfg.gold || 500) : (diff === 2 ? 1100 : 500);
        const expPer = chCfg ? Number(chCfg.team_exp || chCfg.exp || 6) : (diff === 2 ? 10 : 6);
        const spPer = chCfg ? Number(chCfg.cost_sp || chCfg.sp_cost || 6) : (diff === 2 ? 12 : 6);

        const totalSpCost = spPer * times;
        if (!this.canDeductSp(totalSpCost)) {
            return respond({}, { code: 1, msg: "Không đủ Thể Lực để càn quét!" });
        }

        // Sweep tickets (40010) or Diamond sweep (5 diamonds/run)
        const curTickets = this.getItemAmount(40010);
        if (curTickets >= times) {
            this.deductItem(40010, times, queuePush);
        } else {
            const remainDiamondRuns = times - Math.max(0, curTickets);
            const diamondCost = remainDiamondRuns * 5;
            if (!this.canDeductStone(diamondCost)) {
                return respond({}, { code: 1, msg: "Không đủ Vé Càn Quét hoặc Kim Cương!" });
            }
            if (curTickets > 0) {
                this.deductItem(40010, curTickets, queuePush);
            }
            this.deductStone(diamondCost, null);
        }

        if (!this.data.chapter_counts) this.data.chapter_counts = {};
        const cInfo = this.data.chapter_counts[cid] || { todayCount: 0, resetCount: 0 };
        cInfo.todayCount = Number(cInfo.todayCount || 0) + times;
        this.data.chapter_counts[cid] = cInfo;
        recordDailyChapterTask(this, cid, times);

        this.deductSp(totalSpCost, null);
        this.addGold(goldPer * times, null);
        this.addTeamExp(expPer * times, null);
        queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

        const allItems = [];
        for (let t = 0; t < times; t++) {
            const roundDrops = rollChapterDrops(this, cid, queuePush, true);
            allItems.push(roundDrops);
        }

        respond({
            exp: expPer,
            gold: goldPer * times,
            allItems: allItems
        });
        return true;
    }

    if (cmd === SVRCMD.HasSepcialChapterOpenInEvent) {
        respond({ hasOpenInEvent: false });
        return true;
    }
    if (cmd === SVRCMD.GetChapterPerDayCountMulti) {
        respond({ multi: 0, mulit: 0 });
        return true;
    }
    if (cmd === SVRCMD.ChapterCountInfo) {
        const cid = Number((params && params[0]) || 0);
        if (!this.data.chapter_counts) this.data.chapter_counts = {};
        const cInfo = this.data.chapter_counts[cid] || { todayCount: 0, resetCount: 0 };
        respond({ todayCount: Number(cInfo.todayCount || 0), resetCount: Number(cInfo.resetCount || 0) });
        return true;
    }
    if (cmd === SVRCMD.ResetChapter) {
        const cid = Number((params && params[0]) || 0);
        if (!this.data.chapter_counts) this.data.chapter_counts = {};
        const cInfo = this.data.chapter_counts[cid] || { todayCount: 0, resetCount: 0 };
        const rCount = Number(cInfo.resetCount || 0);
        const nextTier = rCount + 1;
        let resetPrice = nextTier * 10;
        if (typeof Config !== "undefined" && Config.goods2 && Config.goods2[9201] && Config.goods2[9201][nextTier]) {
            resetPrice = Number(Config.goods2[9201][nextTier].price || resetPrice);
        }
        if (!this.canDeductStone(resetPrice)) {
            return respond({}, { code: 1, msg: "Không đủ Kim Cương để làm mới ải!" });
        }
        this.deductStone(resetPrice, queuePush);
        cInfo.resetCount = nextTier;
        cInfo.todayCount = 0;
        this.data.chapter_counts[cid] = cInfo;
        respond({});
        return true;
    }
    if (cmd === SVRCMD.SweepSpecial) {
        const cid = Number((params && params[0]) || 55013);
        const times = Math.max(1, Number((params && params[2]) || 1));
        const chCfg = (typeof Config !== "undefined" && Config.chapter && Config.chapter[cid]) ? Config.chapter[cid] : null;
        const spPer = chCfg ? Number(chCfg.cost_sp || 6) : 6;
        const expPer = chCfg ? Number(chCfg.team_exp || 6) : 6;
        const goldPer = chCfg ? Number(chCfg.coin || 0) : 0;

        if (!this.canDeductSp(spPer * times)) {
            return respond({}, { code: 1, msg: "Không đủ Thể Lực!" });
        }

        if (!this.data.chapter_counts) this.data.chapter_counts = {};
        const cInfo = this.data.chapter_counts[cid] || { todayCount: 0, resetCount: 0 };
        cInfo.todayCount = Number(cInfo.todayCount || 0) + times;
        this.data.chapter_counts[cid] = cInfo;
        recordDailyChapterTask(this, cid, times);

        this.deductSp(spPer * times, null);
        this.addGold(goldPer * times, null);
        this.addTeamExp(expPer * times, null);
        queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

        const allItems = [];
        for (let t = 0; t < times; t++) {
            const roundDrops = rollChapterDrops(this, cid, queuePush, true);
            allItems.push(roundDrops);
        }
        respond({ exp: expPer, gold: goldPer * times, allItems: allItems });
        return true;
    }
    if (cmd === SVRCMD.AfterSpecialFight) {
        const cid = Number(this.data.last_fight_cid || 55013);
        const chCfg = (typeof Config !== "undefined" && Config.chapter && Config.chapter[cid]) ? Config.chapter[cid] : null;
        const goldGain = chCfg ? Number(chCfg.coin || 20000) : 20000;
        const expGain = chCfg ? Number(chCfg.team_exp || 6) : 6;
        const spCost = chCfg ? Number(chCfg.cost_sp || 6) : 6;
        this.deductSp(Math.min(Number(this.data.sp || 0), spCost), null);
        this.addGold(goldGain, null);
        this.addTeamExp(expGain, null);
        updateChapterProgress(this.data.chapters, cid, 3);
        recordDailyChapterTask(this, cid, 1);
        const dropItems = rollChapterDrops(this, cid, queuePush, true);
        queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        respond({ isFirst3Star: false, gold: goldGain, exp: expGain, items: dropItems });
        return true;
    }

    return false;
}

module.exports = handleChapter;
