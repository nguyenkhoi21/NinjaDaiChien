/**
 * Player Handler
 * Handle Tài khoản, Nhân vật, Túi đồ, Tân thủ, Thư, Hảo hữu, Quà cấp độ
 */

function handlePlayer(cmd, params, respond, queuePush) {
    // 1. Server Time & Login & CreateRole
    if (cmd === SVRCMD.Time) {
        const nowSec = Math.floor(Date.now() / 1000);
        respond({ time: nowSec, offset: 25200 });
        return true;
    }
    if (cmd === SVRCMD.Login) {
        respond({ status: 1 });
        return true;
    }
    if (cmd === SVRCMD.CreateRole) {
        const newName = (params && params[0]) ? String(params[0]) : "Nhẫn Giả";
        this.data.team_name = newName;
        queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        respond({ status: 1 });
        return true;
    }
    if (cmd === SVRCMD.PlayerInfo) {
        const nowSec = Math.floor(Date.now() / 1000);
        const pIdNum = this.getNumericId();
        respond({
            player: {
                id: pIdNum,
                user_id: pIdNum,
                user_name: this.data.team_name || "Nhẫn Giả",
                platform: "ninja",
                create_time: this.data.create_time || (nowSec - 86400),
                last_signin_time: nowSec,
                last_signin_ip: "127.0.0.1",
                avatar_frame_ids: [801, 802, 803, 804, 805, 806, 807, 808, 809, 810, 811]
            },
            player_attr: this.buildPlayerAttrPayload()
        });
        return true;
    }
    if (cmd === SVRCMD.BagInfo) {
        this.syncGemsAndSecrets(queuePush);
        respond({
            items: this.data.items || {},
            equip: this.data.equip || {},
            ninja_tools: this.data.ninja_tools || {}
        });
        return true;
    }
    if (cmd === SVRCMD.GetSecrets) {
        this.syncGemsAndSecrets(queuePush);
        respond({ secrets: this.data.secrets || [] });
        return true;
    }
    if (cmd === SVRCMD.GetHeros) {
        const outHeros = {};
        for (const hid in (this.data.heros || {})) {
            outHeros[hid] = this.computeHeroPayload(hid);
        }
        respond({ heros: outHeros });
        return true;
    }
    if (cmd === SVRCMD.GetAllHeroStatus) {
        const stMap = {};
        for (const hk in (this.data.heros || {})) {
            stMap[hk] = 0;
        }
        respond({ status: stMap });
        return true;
    }

    // 2. Tutorial & Guide State
    if (cmd === SVRCMD.GetLastGuide) {
        respond({ lastGuideId: (this.data.guide_step !== undefined) ? this.data.guide_step : 0 });
        return true;
    }
    if (cmd === SVRCMD.SetLastGuide) {
        if (params && params.length) {
            const newStep = Number(params[0]);
            this.data.guide_step = newStep;
            if (newStep >= 1 && !this.data.heros[10070]) {
                this.data.heros[10070] = this.createDefaultHeroRecord(10070);
                const leePayload = this.computeHeroPayload(10070);
                queuePush(SVRCMD.Hero, { hero: leePayload });
            }
        }
        respond({ status: 1 });
        return true;
    }
    if (cmd === SVRCMD.GetLastDialog) {
        respond({ lastDialogId: 999999 });
        return true;
    }
    if (cmd === SVRCMD.SetLastDialog) {
        respond({ status: 1 });
        return true;
    }
    if (cmd === SVRCMD.Get) {
        const key = (params && params[0]) || "";
        const v = (this.data.guide_vars && this.data.guide_vars[key] !== undefined)
            ? this.data.guide_vars[key]
            : (key === "releaseSkill" ? 1 : 0);
        respond({ value: v });
        return true;
    }
    if (cmd === SVRCMD.Set) {
        const key = params && params[0];
        const v = params && params[1];
        if (!this.data.guide_vars) this.data.guide_vars = {};
        if (key !== undefined) this.data.guide_vars[key] = v;
        respond({ status: 1 });
        return true;
    }

    // 3. DailyInfo, ServerInfo, SpInfo, DailyGet, MidnightGet
    if (cmd === SVRCMD.DailyInfo) {
        const nowSec = Math.floor(Date.now() / 1000);
        const dc = {
            "BRONZE_BOX_TODAY_BUT_COUNT": Number(this.data.bronze_count || 0),
            "BRONZE_BOX_LAST_BUT_TIME": Number(this.data.bronze_time || 0),
            "GOLD_BOX_COUNT": Number(this.data.gold_box_count || 0),
            "GOLD_BOX_LAST_BUY_TIME": Number(this.data.gold_box_time || 0),
            "PLAYER_CARD_EXPIRE_TIME": nowSec + 86400 * 30,
            "MONTH_CARD_FOREVER": 1,
            "PLAYER_GOLD_CARD_EXPIRE_TIME": nowSec + 86400 * 30,
            "PLAYER_WHITE_GOLD_EXPIRE_TIME": nowSec + 86400 * 30,
            "PLAYER_WEEK_CARD_EXPIRE_TIME": nowSec + 86400 * 30,
            "PLAYER_PLATINUM_WEEK_CARD_EXPIRE_TIME": nowSec + 86400 * 30,
            "DUG_COUNT": 0,
            "PLUNDER_COUNT": 0
        };
        if (typeof Config !== "undefined" && Config.daily_task) {
            for (const dtId in Config.daily_task) {
                dc["PLAYER_DIALY_TASK_" + dtId] = 99;
            }
        }
        if (this.data.daily_counts) {
            for (const dk in this.data.daily_counts) {
                dc[dk] = this.data.daily_counts[dk];
            }
        }
        respond({ dailyCount: dc });
        return true;
    }
    if (cmd === SVRCMD.ServerInfo) {
        const nowSec = Math.floor(Date.now() / 1000);
        const pInfo = {
            "GOLD_BOX_BUY_COUNT": 0,
            "GOLD_BOX_COUNT": Number(this.data.gold_box_count || 0),
            "GOLD_BOX_LAST_BUY_TIME": Number(this.data.gold_box_time || 0),
            "BRONZE_BOX_TODAY_BUT_COUNT": Number(this.data.bronze_count || 0),
            "BRONZE_BOX_LAST_BUT_TIME": Number(this.data.bronze_time || 0),
            "FIRST_BUY_NONE_FREE_BRONZE_BOX": Number(this.data.first_bronze_paid || 0),
            "FIRST_BUY_NONE_FREE_GOLD_BOX": Number(this.data.first_gold_paid || 0),
            "PLAYER_CARD_EXPIRE_TIME": nowSec + 86400 * 30,
            "MONTH_CARD_FOREVER": 1,
            "PLAYER_GOLD_CARD_EXPIRE_TIME": nowSec + 86400 * 30,
            "PLAYER_WHITE_GOLD_EXPIRE_TIME": nowSec + 86400 * 30,
            "PLAYER_WEEK_CARD_EXPIRE_TIME": nowSec + 86400 * 30,
            "PLAYER_PLATINUM_WEEK_CARD_EXPIRE_TIME": nowSec + 86400 * 30
        };
        if (this.data.achievements) {
            for (const ak in this.data.achievements) {
                pInfo[ak] = this.data.achievements[ak];
            }
        }
        if (this.data.daily_counts) {
            for (const dk2 in this.data.daily_counts) {
                pInfo[dk2] = this.data.daily_counts[dk2];
            }
        }
        respond({ playerInfo: pInfo });
        return true;
    }
    if (cmd === SVRCMD.DailyGet || cmd === SVRCMD.MidnightGet) {
        const k = (params && params[0]) || "";
        respond({ key: k, value: Number((this.data.daily_counts && this.data.daily_counts[k]) || 0) });
        return true;
    }
    if (cmd === SVRCMD.SpInfo) {
        respond({ sp: Number(this.data.sp || 120), spTime: Math.floor(Date.now() / 1000), next_time: 0, max_sp: 194 });
        return true;
    }

    // 4. Avatar, Frame, TeamName, Messages, Level Rewards, Friendship
    if (cmd === SVRCMD.ChangeIcon) {
        const newHero = Number((params && params[0]) || 10010) % 100000;
        const curIcon = Number(this.data.icon || 10010);
        const curFrame = Math.floor(curIcon / 100000);
        this.data.icon = curFrame * 100000 + newHero;
        queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        respond({ icon: this.data.icon });
        return true;
    }
    if (cmd === SVRCMD.ChangeFrame) {
        const newFrame = Number((params && params[0] !== undefined) ? params[0] : 0);
        const curIcon = Number(this.data.icon || 10010);
        const baseHero = curIcon % 100000;
        this.data.icon = newFrame * 100000 + baseHero;
        queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        respond({
            icon: this.data.icon,
            avatar_frame_ids: [10, 21, 22, 23, 24, 25, 50, 60, 330, 340, 350, 360, 370, 690, 801, 802, 803, 804, 805, 806, 807, 808, 809, 810, 811]
        });
        return true;
    }
    if (cmd === SVRCMD.ChangeTeamName) {
        if (params && params[0]) {
            this.data.team_name = String(params[0]);
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        }
        respond({ status: 1 });
        return true;
    }
    if (cmd === SVRCMD.MessageInfo) {
        respond({ messages: this.data.messages || [] });
        return true;
    }
    if (cmd === "ReadMessage" || cmd === SVRCMD.ReadMessage || cmd === SVRCMD.ReceiveAttachment) {
        respond({ status: 1, id: params && params[0] });
        return true;
    }
    if (cmd === SVRCMD.GetLvRewardInfo) {
        respond(this.data.lv_rewards || []);
        return true;
    }
    if (cmd === SVRCMD.ReceiveLevelAward || cmd === SVRCMD.GetLvReward) {
        const lvAwardId = Number((params && params[0]) || 1);
        if (!this.data.lv_rewards) this.data.lv_rewards = [];
        if (this.data.lv_rewards.indexOf(lvAwardId) === -1) {
            this.data.lv_rewards.push(lvAwardId);
            let rwCfg = null;
            if (typeof Config !== "undefined" && Array.isArray(Config.lvReward)) {
                for (let i = 0; i < Config.lvReward.length; i++) {
                    if (Number(Config.lvReward[i].id) === lvAwardId || Number(Config.lvReward[i].lv) === lvAwardId) {
                        rwCfg = Config.lvReward[i];
                        break;
                    }
                }
            }
            if (rwCfg) {
                if (Number(rwCfg.sp || 0) > 0) this.addSp(Number(rwCfg.sp), queuePush);
                if (Number(rwCfg.exp || 0) > 0) this.addTeamExp(Number(rwCfg.exp), queuePush);
                if (Number(rwCfg.item_id_1 || 0) > 0 && Number(rwCfg.item_amount_1 || 0) > 0) {
                    this.changeItemAmount(Number(rwCfg.item_id_1), Number(rwCfg.item_amount_1), queuePush);
                }
                if (Number(rwCfg.item_id_2 || 0) > 0 && Number(rwCfg.item_amount_2 || 0) > 0) {
                    this.changeItemAmount(Number(rwCfg.item_id_2), Number(rwCfg.item_amount_2), queuePush);
                }
            } else {
                this.addStone(300, queuePush);
                this.addGold(100000, queuePush);
            }
        }
        queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        respond({ rewards: this.data.lv_rewards });
        return true;
    }
    if (cmd === SVRCMD.PlayerFriendship) {
        respond({ friendships: this.data.friendships || [] });
        return true;
    }
    if (cmd === SVRCMD.UpgradeFriendship) {
        const fid = Number((params && params[0]) || 1);
        if (!this.data.friendships) this.data.friendships = [];
        let fObj = null;
        for (let i = 0; i < this.data.friendships.length; i++) {
            if (Number(this.data.friendships[i].friendship_id) === fid) {
                fObj = this.data.friendships[i];
                break;
            }
        }
        if (!fObj) {
            fObj = { friendship_id: fid, lv: 1 };
            this.data.friendships.push(fObj);
        } else {
            fObj.lv = Number(fObj.lv || 1) + 1;
        }
        respond({ friendship: fObj });
        return true;
    }
    if (cmd === SVRCMD.BlackList) {
        respond({ blacks: this.data.blacks || [] });
        return true;
    }

    return false;
}

module.exports = handlePlayer;
