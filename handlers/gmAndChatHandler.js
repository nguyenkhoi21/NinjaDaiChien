// ============================================================================
// HANDLER: CHAT, THÔNG BÁO LOA, REPLAY & LỆNH GM (Command.js)
// (Chat, LsvChatSend/History, LanternInfo, Battle Replay Fallbacks, GM* Debug Commands)
// ============================================================================

const globalChats = [
    {
        id: 1,
        source_server: 1,
        player_id: 100,
        player_name: "Hokage Đệ Thất",
        player_icon: 10010,
        player_lv: 90,
        player_vip: 15,
        create_time: Math.floor(Date.now() / 1000) - 60,
        fight_record_id: 0,
        msg: "Chào mừng các Nhẫn Giả đến với máy chủ Ninja Đại Chiến!",
        send_to: 0,
        send_to_name: ""
    }
];

const globalLsvChats = [
    {
        id: 1,
        source_server: 1,
        player_id: 100,
        player_name: "Hokage Đệ Thất",
        player_icon: 10010,
        player_lv: 90,
        player_vip: 15,
        create_time: Math.floor(Date.now() / 1000) - 60,
        fight_record_id: 0,
        msg: "Kênh chat Liên Server đã sẵn sàng!",
        send_to: 0,
        lsv: true
    }
];

const globalLanterns = [
    {
        id: 1,
        msg: "Chào mừng các Nhẫn Giả bước vào thế giới Shinobi Saga!",
        content: "Chào mừng các Nhẫn Giả bước vào thế giới Shinobi Saga!",
        from: 0,
        to: 2147483647,
        interval: 60,
        type: 1
    }
];

let globalChatSeq = 100;

const GmAndChatHandler = {
    handleGmAndChatCommand: function(cmd, params, respond, queuePush) {
        var noFight = { code: 1, msg: "Không có dữ liệu trận đấu để xem lại!" };

        if (cmd === "GetFaceBookUrl" || cmd === SVRCMD.GetFaceBookUrl) {
            respond({ url: "" });
            return true;
        }

        if (cmd === SVRCMD.LanternInfo) {
            respond({
                lanterns: globalLanterns.slice(0, 10)
            });
            return true;
        }

        if (cmd === "SendLatern" || cmd === SVRCMD.SendLatern) {
            var lanternText = String((params && params[0]) || "").trim();
            if (lanternText) {
                var senderName = this.data.team_name || "Nhẫn Giả";
                var fullText = "[" + senderName + "]: " + lanternText;
                var lObj = {
                    id: ++globalChatSeq,
                    msg: fullText,
                    content: fullText,
                    from: 0,
                    to: 2147483647,
                    interval: 30,
                    type: 1
                };
                globalLanterns.unshift(lObj);
                if (globalLanterns.length > 20) globalLanterns.pop();

                // Also add to World Chat so everyone sees the shout in chat log
                var shoutChatObj = {
                    id: ++globalChatSeq,
                    source_server: 1,
                    player_id: this.getNumericId(),
                    player_name: senderName,
                    player_icon: Number(this.data.icon || 10010),
                    player_lv: Number(this.data.team_lv || 1),
                    player_vip: Number(this.data.vip_lv || 0),
                    create_time: Math.floor(Date.now() / 1000),
                    fight_record_id: 0,
                    msg: "[LOA] " + lanternText,
                    send_to: 0,
                    send_to_name: ""
                };
                globalChats.unshift(shoutChatObj);
                if (globalChats.length > 100) globalChats.pop();
            }
            respond({ status: 1 });
            return true;
        }

        if (cmd === SVRCMD.Chat || cmd === "Chat") {
            // Client sends: [chatType, targetName, targetId, chatLog, fightRecordId]
            // Fallback 2-param: [msgText, chatChannel]
            var chatType = 0;
            var targetName = "";
            var targetId = 0;
            var msgText = "";
            var fightRecordId = 0;

            if (params && params.length >= 4) {
                chatType = Number(params[0] || 0);
                targetName = String(params[1] || "");
                targetId = Number(params[2] || 0);
                msgText = String(params[3] || "");
                fightRecordId = Number(params[4] || 0);
            } else if (params && params.length >= 1) {
                msgText = String(params[0] || "");
                chatType = (params[1] !== undefined) ? Number(params[1]) : 0;
            }

            var sendTo = (chatType === -2) ? (targetId > 0 ? targetId : 1) : chatType;
            var cId = ++globalChatSeq;
            var chatObj = {
                id: cId,
                source_server: 1,
                player_id: this.getNumericId(),
                player_name: this.data.team_name || "Nhẫn Giả",
                player_icon: Number(this.data.icon || 10010),
                player_lv: Number(this.data.team_lv || 1),
                player_vip: Number(this.data.vip_lv || 0),
                create_time: Math.floor(Date.now() / 1000),
                fight_record_id: fightRecordId,
                msg: msgText,
                send_to: sendTo,
                send_to_name: targetName,
                group_id: Number(this.data.group_id || 1)
            };

            globalChats.unshift(chatObj);
            if (globalChats.length > 100) globalChats.pop();

            if (!this.data.chats) this.data.chats = [];
            this.data.chats.unshift(chatObj);
            if (this.data.chats.length > 50) this.data.chats.pop();

            if (chatType === 0) {
                if (!this.data.daily_counts) this.data.daily_counts = {};
                this.data.daily_counts["WORLD_CHAT_COUNT"] = Number(this.data.daily_counts["WORLD_CHAT_COUNT"] || 0) + 1;
            }

            respond({ chat: chatObj });
            return true;
        }

        if (cmd === SVRCMD.ChatMessage || cmd === "ChatMessage") {
            var reqType = (params && params[0] !== undefined) ? Number(params[0]) : 0;
            var myUid = this.getNumericId();
            var myGroupId = Number(this.data.group_id || 1);
            var filtered = globalChats.filter(function(c) {
                if (reqType === 0) {
                    return Number(c.send_to) === 0 && !c.lsv;
                }
                if (reqType === -1) {
                    return Number(c.send_to) === -1 && (!c.group_id || Number(c.group_id) === myGroupId);
                }
                if (reqType === -2) {
                    return Number(c.send_to) > 0 && (Number(c.player_id) === myUid || Number(c.send_to) === myUid);
                }
                return true;
            });
            // Return in chronological order (oldest first so ChatWorldView.pushMsg appends newest at bottom/top properly)
            respond({ chats: filtered.slice(0, 50).reverse() });
            return true;
        }

        if (cmd === SVRCMD.LsvChatSend || cmd === "LsvChatSend") {
            var lsvMsg = (params && params[0]) ? String(params[0]) : "";
            var lsvId = ++globalChatSeq;
            var lsvChatObj = {
                id: lsvId,
                source_server: 1,
                player_id: this.getNumericId(),
                player_name: this.data.team_name || "Nhẫn Giả",
                player_icon: Number(this.data.icon || 10010),
                player_lv: Number(this.data.team_lv || 1),
                player_vip: Number(this.data.vip_lv || 0),
                create_time: Math.floor(Date.now() / 1000),
                fight_record_id: 0,
                msg: lsvMsg,
                send_to: 0,
                lsv: true
            };
            globalLsvChats.unshift(lsvChatObj);
            if (globalLsvChats.length > 100) globalLsvChats.pop();
            respond({ chat: lsvChatObj });
            return true;
        }

        if (cmd === SVRCMD.LsvChatHistory || cmd === "LsvChatHistory") {
            respond({ chats: globalLsvChats.slice(0, 50).reverse() });
            return true;
        }

        if (cmd === "BuyWorldChatCount" || cmd === SVRCMD.BuyWorldChatCount) {
            var chatCost = 20;
            if (!this.canDeductStone(chatCost)) {
                return respond({}, { code: 1, msg: "Không đủ Kim Cương!" }), true;
            }
            this.deductStone(chatCost, queuePush);
            if (!this.data.daily_counts) this.data.daily_counts = {};
            this.data.daily_counts["WORLD_CHAT_COUNT"] = 0;
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
