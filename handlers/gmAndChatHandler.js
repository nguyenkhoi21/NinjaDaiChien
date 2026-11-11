// ============================================================================
// HANDLER: CHAT, THÔNG BÁO LOA, REPLAY & LỆNH GM (Command.js)
// (Chat, LsvChatSend/History, LanternInfo, Battle Replay Fallbacks, GM* Debug Commands)
// ============================================================================

const GmAndChatHandler = {
    handleGmAndChatCommand: function(cmd, params, respond, queuePush) {
        var noFight = { code: 1, msg: "Không có dữ liệu trận đấu để xem lại!" };

        if (cmd === "GetFaceBookUrl" || cmd === SVRCMD.GetFaceBookUrl) {
            respond({ url: "" });
            return true;
        }

        if (cmd === SVRCMD.LanternInfo) {
            respond({
                lanterns: [
                    {
                        id: 1,
                        msg: "Chào mừng các Nhẫn Giả bước vào thế giới Shinobi Saga!",
                        content: "Chào mừng các Nhẫn Giả bước vào thế giới Shinobi Saga!",
                        from: 0,
                        to: 2147483647,
                        interval: 60,
                        type: 1
                    }
                ]
            });
            return true;
        }

        if (cmd === "SendLatern" || cmd === SVRCMD.SendLatern) {
            respond({ status: 1 });
            return true;
        }

        if (cmd === SVRCMD.LsvChatSend || cmd === SVRCMD.Chat) {
            var msgText = (params && params[0]) ? String(params[0]) : "";
            var chatChannel = (params && params[1] !== undefined) ? Number(params[1]) : 0;
            var cId = (this.data.chat_seq = (this.data.chat_seq || 100) + 1);
            var chatObj = {
                id: cId,
                source_server: 1,
                player_id: this.getNumericId(),
                player_name: this.data.team_name || "Nhẫn Giả",
                player_icon: Number(this.data.icon || 2010080),
                player_lv: Number(this.data.team_lv || 1),
                player_vip: Number(this.data.vip_lv || 15),
                create_time: Math.floor(Date.now() / 1000),
                fight_record_id: 0,
                msg: msgText,
                send_to: chatChannel,
                chat_type: chatChannel,
                lsv: true
            };
            if (!this.data.chats) this.data.chats = [];
            this.data.chats.unshift(chatObj);
            if (this.data.chats.length > 50) this.data.chats.pop();
            respond({ chat: chatObj });
            return true;
        }

        if (cmd === SVRCMD.LsvChatHistory || cmd === SVRCMD.ChatMessage) {
            respond({ chats: this.data.chats || [] });
            return true;
        }

        if (cmd === "BuyWorldChatCount" || cmd === SVRCMD.BuyWorldChatCount) {
            var chatCost = 20;
            if (!this.canDeductStone(chatCost)) {
                return respond({}, { code: 1, msg: "Không đủ Kim Cương!" }), true;
            }
            this.deductStone(chatCost, queuePush);
            respond({ value: 10 });
            return true;
        }

        // Battle replays: no stored fight data -> clean error instead of client crash
        if (["GetChatFightData", "GroupFightHistoryInfo", "CsGroupFightHistoryInfo", "CrossArenaFightHistoryInfo",
             "CrossDarkArenaFightHistoryInfo", "PlunderHistoryInfo"].indexOf(cmd) >= 0) {
            respond({}, noFight);
            return true;
        }

        // GM & Debug Commands (Command.js)
        if (cmd === "GMAddGold") {
            this.addGold(Number((params && params[0]) || 1000000), queuePush);
            respond({ status: 1 });
            return true;
        }
        if (cmd === "GMAddStone") {
            this.addStone(Number((params && params[0]) || 10000), queuePush);
            respond({ status: 1 });
            return true;
        }
        if (cmd === "GMAddSp") {
            this.addSp(Number((params && params[0]) || 500), queuePush);
            respond({ status: 1 });
            return true;
        }
        if (cmd === "GMAddTeamExp") {
            this.addTeamExp(Number((params && params[0]) || 1000));
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ status: 1 });
            return true;
        }
        if (cmd === "GMAddItem") {
            var gmItemId = Number((params && params[0]) || 10030);
            var gmItemAmt = Number((params && params[1]) || 100);
            this.changeItemAmount(gmItemId, gmItemAmt, queuePush);
            respond({ status: 1 });
            return true;
        }
        if (cmd === "GMAddEquip") {
            var gmEqId = Number((params && params[0]) || 20001);
            var gmEqAmt = Number((params && params[1]) || 10);
            if (gmEqId >= 30000) this.addSecretEquip(gmEqId, gmEqAmt, queuePush);
            else this.changeEquipAmount(gmEqId, gmEqAmt, queuePush);
            respond({ status: 1 });
            return true;
        }
        if (cmd === "GMAddHero") {
            var gmHeroId = Number((params && params[0]) || 10010);
            this.addOrConvertHero(gmHeroId, queuePush);
            respond({ status: 1 });
            return true;
        }
        if (cmd === "GMAddHeroExp") {
            var gmHid = Number((params && params[0]) || 10010);
            var gmHexp = Number((params && params[1]) || 10000);
            this.addHeroExp(gmHid, gmHexp);
            if (this.data.heros && this.data.heros[gmHid]) {
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(gmHid) });
            }
            respond({ status: 1 });
            return true;
        }
        if (cmd === "GMRecharge") {
            var gmAmt = Number((params && params[0]) || 100);
            this.addStone(gmAmt * 100, queuePush);
            this.addVipExp(gmAmt * 10);
            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ status: 1 });
            return true;
        }
        if (cmd === "GMAddGroupResource") {
            this.data.group_resource = Number(this.data.group_resource || 0) + Number((params && params[0]) || 10000);
            respond({ status: 1, resource: this.data.group_resource });
            return true;
        }
        if (cmd === "SetGroupFightStatus" || cmd === "GMSetGroupStatus") {
            this.data.group_fight_status = Number((params && params[0]) || 4);
            respond({ status: 1 });
            return true;
        }
        if (cmd === "GMSetMyGroupStatus") {
            this.data.group_war_status = Number((params && params[0]) || 1);
            respond({ status: 1 });
            return true;
        }
        if (cmd === "GMAddDarkArenaPoint" || cmd === "GMCalDarkArenaPoint") {
            this.addCurrency(13, Number((params && params[0]) || 1000), queuePush);
            respond({ status: 1 });
            return true;
        }
        if (cmd === "GMClearSecret") {
            this.data.secrets = [];
            respond({ status: 1 });
            return true;
        }
        if (cmd === "GMCompleteAllChapter") {
            if (typeof Config !== "undefined" && Config.chapter) {
                this.data.chapters = { "1": [], "2": [], "3": [], "16": [] };
                for (var ck in Config.chapter) {
                    var cObj = Config.chapter[ck];
                    var cType = String(cObj.type || 1);
                    if (!this.data.chapters[cType]) this.data.chapters[cType] = [];
                    this.data.chapters[cType].push({ chapter_id: Number(ck), star: 3, difficulty: Number(cType) });
                }
            }
            respond({ status: 1, chapters: this.data.chapters });
            return true;
        }
        if (["GMSetSkillCount", "GMOnDay", "GMResetTask", "GMResetSpecialChapter", "GMSendArenaReward",
             "GMSendFiveStar", "ReloadBaseData", "Check_user", "Check_anysdk_user", "Check_vietnam_user", "FiveStar"].indexOf(cmd) >= 0) {
            respond({ status: 1 });
            return true;
        }

        return false;
    }
};

module.exports = GmAndChatHandler;
