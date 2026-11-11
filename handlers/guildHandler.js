// ============================================================================
// HANDLER: BANG HỘI, LÍNH ĐÁNH THUÊ, KỸ NĂNG BANG, CÔNG THÀNH CHIẾN & BANG CHIẾN LIÊN SERVER
// (Guild, GuildGrowth/Donate/Skills, Worship, Hires, GroupFight, CsGroupFight, CrossUnionWar)
// ============================================================================

const globalGuilds = {};
let guildIdCounter = 100;

function getGuild(gid) {
    gid = Number(gid);
    if (!gid) return null;
    if (!globalGuilds[gid]) {
        if (gid === 1) {
            globalGuilds[1] = {
                id: 1,
                name: "Làng Lá",
                level: 5,
                exp: 1500,
                notice: "Kế thừa Hỏa Chí! Chào mừng tất cả Nhẫn Giả.",
                president_id: 101,
                created_at: 1793709061,
                icon: 20806,
                capacity: 30,
                join_type: 1,
                min_lv: 30,
                resource: 50000,
                members: [
                    { player_id: 101, team_name: "Uchiha Sasuke", team_lv: 95, icon: 10020, role: 1, contribution: 8500, last_signin_time: Math.floor(Date.now() / 1000) - 1800 },
                    { player_id: 102, team_name: "Haruno Sakura", team_lv: 92, icon: 10040, role: 2, contribution: 6200, last_signin_time: Math.floor(Date.now() / 1000) - 3600 },
                    { player_id: 103, team_name: "Hatake Kakashi", team_lv: 98, icon: 10010, role: 3, contribution: 7800, last_signin_time: Math.floor(Date.now() / 1000) - 7200 }
                ],
                apply_logs: []
            };
        } else if (gid === 2) {
            globalGuilds[2] = {
                id: 2,
                name: "Akatsuki",
                level: 6,
                exp: 3000,
                notice: "Thế giới sẽ biết nỗi đau.",
                president_id: 201,
                created_at: 1793709061,
                icon: 20002,
                capacity: 30,
                join_type: 1,
                min_lv: 40,
                resource: 80000,
                members: [
                    { player_id: 201, team_name: "Pain Tendo", team_lv: 99, icon: 10010, role: 1, contribution: 12000, last_signin_time: Math.floor(Date.now() / 1000) - 900 }
                ],
                apply_logs: []
            };
        }
    }
    return globalGuilds[gid] || null;
}

const GuildHandler = {
    handleGuildCommand: function(cmd, params, respond, queuePush) {
        var nowTs = Math.floor(Date.now() / 1000);

        if (cmd === SVRCMD.GetGroupHires) {
            var hiresList = [
                {
                    id: 14,
                    player_id: 302,
                    player_name: "Minato Namikaze",
                    player_lv: 100,
                    player_icon: 1010020,
                    hero_id: 11060,
                    hero: JSON.stringify(this.computeHeroPayload(11060))
                },
                {
                    id: 19,
                    player_id: 251,
                    player_name: "Itachi Uchiha",
                    player_lv: 100,
                    player_icon: 24011061,
                    hero_id: 11000,
                    hero: JSON.stringify(this.computeHeroPayload(11000))
                },
                {
                    id: 5453,
                    player_id: 1123,
                    player_name: "Jiraiya",
                    player_lv: 95,
                    player_icon: 30611060,
                    hero_id: 10650,
                    hero: JSON.stringify(this.computeHeroPayload(10650))
                }
            ];
            respond({ hires: hiresList });
            return true;
        }

        if (cmd === "GetPlayerHires" || cmd === "GetPlayerHireEx") {
            if (!this.data.my_hires) this.data.my_hires = [];
            var myHiresList = [];
            for (var mhi = 0; mhi < this.data.my_hires.length; mhi++) {
                var mhHeroId = Number(this.data.my_hires[mhi]);
                myHiresList.push({
                    id: mhi + 1,
                    hero_id: mhHeroId,
                    hero: JSON.stringify(this.computeHeroPayload(mhHeroId)),
                    hire_time: nowTs - 3600,
                    camp_gold: 50000,
                    hire_gold: 12400,
                    max_gold: 115000
                });
            }
            respond({ hires: myHiresList });
            return true;
        }

        if (cmd === SVRCMD.SetHire) {
            var hId = Number((params && params[0]) || 0);
            if (!this.data.my_hires) this.data.my_hires = [];
            if (hId > 0 && this.data.my_hires.indexOf(hId) === -1) {
                this.data.my_hires.push(hId);
            }
            if (!this.data.daily_counts) this.data.daily_counts = {};
            this.data.daily_counts["PLAYER_DIALY_TASK_15"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_15"] || 0) + 1;
            this.save();
            respond({ success: true, hero_id: hId });
            return true;
        }

        if (cmd === "RemoveHire" || cmd === SVRCMD.RemoveHire) {
            var hId = Number((params && params[0]) || 0);
            if (!this.data.my_hires) this.data.my_hires = [];
            var idx = this.data.my_hires.indexOf(hId);
            if (idx !== -1) {
                this.data.my_hires.splice(idx, 1);
            }
            var goldGained = 62400;
            this.addGold(goldGained, queuePush);
            this.save();
            respond({ hire_gold: 0, camp_gold: goldGained, total_gold: goldGained });
            return true;
        }

        if (cmd === SVRCMD.PlayerGroupInfo) {
            var myGid = Number(this.data.group_id || 0);
            if (myGid > 0) {
                var gObj = getGuild(myGid);
                if (!gObj) {
                    this.data.group_id = 0;
                    this.data.group_name = "";
                    this.data.group_role = 0;
                    return respond({}), true;
                }
                respond({
                    playerGroup: {
                        group_id: gObj.id,
                        player_id: this.getNumericId(),
                        role: Number(this.data.group_role || 4),
                        contribution: Number(this.data.group_contribution || 0)
                    },
                    group: {
                        id: gObj.id,
                        name: gObj.name,
                        level: Number(gObj.level || 1),
                        exp: Number(gObj.exp || 0),
                        notice: gObj.notice || "",
                        president_id: Number(gObj.president_id || 101),
                        created_at: gObj.created_at || nowTs,
                        icon: Number(gObj.icon || 20806),
                        capacity: Number(gObj.capacity || 30),
                        join_type: Number(gObj.join_type || 1),
                        min_lv: Number(gObj.min_lv || 30),
                        size: (gObj.members || []).length,
                        resource: Number(gObj.resource || 10000),
                        last_opponent: "",
                        last_opponent_icon: 0,
                        last_point: 0,
                        last_opponent_point: 0,
                        last_is_win: 0
                    }
                });
            } else {
                respond({});
            }
            return true;
        }

        if (cmd === "BestMatchGroups" || cmd === SVRCMD.BestMatchGroups) {
            var gList = [];
            getGuild(1);
            getGuild(2);
            for (var k in globalGuilds) {
                var g = globalGuilds[k];
                var presName = "Bang Chủ";
                if (g.members) {
                    for (var mi = 0; mi < g.members.length; mi++) {
                        if (g.members[mi].role === 1) {
                            presName = g.members[mi].team_name;
                            break;
                        }
                    }
                }
                gList.push({
                    id: g.id,
                    name: g.name,
                    level: g.level,
                    icon: g.icon,
                    capacity: g.capacity,
                    size: (g.members || []).length,
                    min_lv: g.min_lv,
                    president_name: presName,
                    notice: g.notice
                });
            }
            respond({ groups: gList });
            return true;
        }

        if (cmd === SVRCMD.CreateGroup) {
            var newGid = ++guildIdCounter;
            var gName = (params && params[0]) ? String(params[0]) : "Bang Hội Mới";
            var gIcon = (params && params[1]) ? Number(params[1]) : 20806;
            var myUid = this.getNumericId();

            var newGuild = {
                id: newGid,
                name: gName,
                level: 1,
                exp: 0,
                notice: "Chào mừng thành viên mới gia nhập Bang!",
                president_id: myUid,
                created_at: nowTs,
                icon: gIcon,
                capacity: 30,
                join_type: 1,
                min_lv: 30,
                resource: 5000,
                members: [
                    {
                        player_id: myUid,
                        team_name: this.data.team_name || "Nhẫn Giả",
                        team_lv: Number(this.data.team_lv || 1),
                        icon: Number(this.data.icon || 10020),
                        role: 1, // 会长 (Boss)
                        contribution: 0,
                        last_signin_time: nowTs
                    }
                ],
                apply_logs: []
            };
            globalGuilds[newGid] = newGuild;

            this.data.group_id = newGid;
            this.data.group_name = gName;
            this.data.group_icon = gIcon;
            this.data.group_role = 1;
            this.data.group_level = 1;
            this.data.group_exp = 0;
            this.data.group_contribution = 0;
            this.data.group_resource = 5000;
            this.data.group_size = 1;
            this.save();

            respond({
                playerGroup: {
                    group_id: newGid,
                    player_id: myUid,
                    role: 1,
                    contribution: 0
                },
                group: {
                    id: newGid,
                    name: gName,
                    level: 1,
                    exp: 0,
                    notice: newGuild.notice,
                    president_id: myUid,
                    created_at: nowTs,
                    icon: gIcon,
                    capacity: 30,
                    join_type: 1,
                    min_lv: 30,
                    size: 1,
                    resource: 5000,
                    last_opponent: "",
                    last_opponent_icon: 0,
                    last_point: 0,
                    last_opponent_point: 0,
                    last_is_win: 0
                }
            });
            return true;
        }

        if (cmd === SVRCMD.ApplyGroup) {
            var targetGid = (params && params[0]) ? Number(params[0]) : 1;
            var targetGuild = getGuild(targetGid) || getGuild(1);
            if (!targetGuild) return respond({}, { code: 1, msg: "Không tìm thấy bang hội!" }), true;

            var myUid = this.getNumericId();
            // Thêm trực tiếp nếu bang chế độ tự do duyệt (join_type === 1)
            if (!targetGuild.members) targetGuild.members = [];
            targetGuild.members.push({
                player_id: myUid,
                team_name: this.data.team_name || "Nhẫn Giả",
                team_lv: Number(this.data.team_lv || 1),
                icon: Number(this.data.icon || 10020),
                role: 4, // 普通会员 (Normal)
                contribution: 0,
                last_signin_time: nowTs
            });

            this.data.group_id = targetGuild.id;
            this.data.group_name = targetGuild.name;
            this.data.group_icon = targetGuild.icon;
            this.data.group_role = 4;
            this.data.group_level = targetGuild.level;
            this.save();

            respond({ joined: true });
            return true;
        }

        if (cmd === SVRCMD.ExitGroup) {
            var kickTargetId = (params && params[0]) ? Number(params[0]) : this.getNumericId();
            var myGid = Number(this.data.group_id || 0);
            var myGuild = getGuild(myGid);

            if (myGuild && myGuild.members) {
                myGuild.members = myGuild.members.filter(function(m) { return Number(m.player_id) !== kickTargetId; });
            }

            // Nếu chính bản thân rời bang / bị kick
            if (kickTargetId === this.getNumericId()) {
                this.data.group_id = 0;
                this.data.group_name = "";
                this.data.group_role = 0;
                this.save();
                respond({ dissolved: true });
            } else {
                respond({ status: 1 });
            }
            return true;
        }

        if (cmd === SVRCMD.SetGroupRole) {
            var tPid = Number((params && params[0]) || 0);
            var newRole = Number((params && params[1]) || 4);
            var myGid = Number(this.data.group_id || 0);
            var myGuild = getGuild(myGid);
            if (myGuild && myGuild.members) {
                for (var mi = 0; mi < myGuild.members.length; mi++) {
                    if (Number(myGuild.members[mi].player_id) === tPid) {
                        myGuild.members[mi].role = newRole;
                        break;
                    }
                }
            }
            if (tPid === this.getNumericId()) {
                this.data.group_role = newRole;
                this.save();
            }
            respond({ status: 1 });
            return true;
        }

        if (cmd === "TransferBoss" || cmd === SVRCMD.TransferBoss) {
            var newBossId = Number((params && params[0]) || 0);
            var myGid = Number(this.data.group_id || 0);
            var myGuild = getGuild(myGid);
            if (myGuild && myGuild.members) {
                myGuild.president_id = newBossId;
                for (var mi = 0; mi < myGuild.members.length; mi++) {
                    if (Number(myGuild.members[mi].player_id) === newBossId) {
                        myGuild.members[mi].role = 1;
                    } else if (Number(myGuild.members[mi].player_id) === this.getNumericId()) {
                        myGuild.members[mi].role = 2; // Hạ xuống Trưởng lão
                    }
                }
            }
            this.data.group_role = 2;
            this.save();
            respond({ status: 1 });
            return true;
        }

        if (cmd === SVRCMD.GroupMembers) {
            var myGid = Number(this.data.group_id || 0);
            var myGuild = getGuild(myGid);
            if (myGuild && myGuild.members) {
                // Cập nhật thông tin bản thân trong danh sách
                var foundSelf = false;
                for (var mi = 0; mi < myGuild.members.length; mi++) {
                    if (Number(myGuild.members[mi].player_id) === this.getNumericId()) {
                        myGuild.members[mi].team_name = this.data.team_name || "Nhẫn Giả";
                        myGuild.members[mi].team_lv = Number(this.data.team_lv || 1);
                        myGuild.members[mi].icon = Number(this.data.icon || 10020);
                        myGuild.members[mi].role = Number(this.data.group_role || 1);
                        myGuild.members[mi].last_signin_time = nowTs;
                        foundSelf = true;
                        break;
                    }
                }
                if (!foundSelf) {
                    myGuild.members.unshift({
                        player_id: this.getNumericId(),
                        team_name: this.data.team_name || "Nhẫn Giả",
                        team_lv: Number(this.data.team_lv || 1),
                        icon: Number(this.data.icon || 10020),
                        role: Number(this.data.group_role || 1),
                        contribution: Number(this.data.group_contribution || 0),
                        last_signin_time: nowTs
                    });
                }
                respond({ members: myGuild.members });
            } else {
                respond({ members: [] });
            }
            return true;
        }

        if (cmd === SVRCMD.GroupSetting) {
            var myGid = Number(this.data.group_id || 0);
            var myGuild = getGuild(myGid);
            if (params && params.length >= 3) {
                this.data.group_icon = Number(params[0]) || this.data.group_icon;
                this.data.group_join_type = Number(params[1]) || this.data.group_join_type;
                this.data.group_min_lv = Number(params[2]) || this.data.group_min_lv;
                if (myGuild) {
                    myGuild.icon = this.data.group_icon;
                    myGuild.join_type = this.data.group_join_type;
                    myGuild.min_lv = this.data.group_min_lv;
                }
                this.save();
            }
            respond({});
            return true;
        }

        if (cmd === SVRCMD.GroupApplyLogList) {
            respond({ logs: [] });
            return true;
        }

        if (cmd === "GuildGrowthInfo") {
            var gLv = Number(this.data.group_level || 1);
            var reqExp = gLv * 1000;
            respond({
                guildId: Number(this.data.group_id || 1),
                level: gLv,
                exp: Number(this.data.group_exp || 0),
                expRequired: reqExp,
                maxLevel: 20,
                fund: Number(this.data.group_fund || 500),
                contribution: Number(this.data.group_contribution || 0),
                canUpgrade: true,
                donations: {
                    gold: { currency: "gold", cost: 500000, limit: 5, exp: 100, fund: 100, contribution: 100, used: Number(this.data.guild_donate_gold || 0), left: Math.max(0, 5 - Number(this.data.guild_donate_gold || 0)) },
                    diamond: { currency: "diamond", cost: 100, limit: 3, exp: 100, fund: 100, contribution: 100, used: Number(this.data.guild_donate_gem || 0), left: Math.max(0, 3 - Number(this.data.guild_donate_gem || 0)) }
                },
                skills: [
                    { key: "hp", name: "Sinh lực", level: Number((this.data.guild_skills && this.data.guild_skills.hp) || 0), percent: 0, cap: gLv, cost: 500 },
                    { key: "atk", name: "Công kích", level: Number((this.data.guild_skills && this.data.guild_skills.atk) || 0), percent: 0, cap: gLv, cost: 500 },
                    { key: "def", name: "Phòng thủ", level: Number((this.data.guild_skills && this.data.guild_skills.def) || 0), percent: 0, cap: gLv, cost: 500 }
                ],
                logs: []
            });
            return true;
        }

        if (cmd === "GuildDonate") {
            var kind = (params && params[0]) ? String(params[0]) : "gold";
            if (kind === "diamond") {
                if (!this.canDeductStone(100)) return respond({}, { code: 1, msg: "Không đủ Kim Cương!" }), true;
                this.deductStone(100, queuePush);
                this.data.guild_donate_gem = Number(this.data.guild_donate_gem || 0) + 1;
            } else {
                if (!this.canDeductGold(500000)) return respond({}, { code: 1, msg: "Không đủ Vàng!" }), true;
                this.deductGold(500000, queuePush);
                this.data.guild_donate_gold = Number(this.data.guild_donate_gold || 0) + 1;
            }
            this.data.group_exp = Number(this.data.group_exp || 0) + 100;
            this.data.group_fund = Number(this.data.group_fund || 0) + 100;
            this.data.group_contribution = Number(this.data.group_contribution || 0) + 100;
            this.addCurrency(12, 100, queuePush);
            var gLv = Number(this.data.group_level || 1);
            if (this.data.group_exp >= gLv * 1000 && gLv < 20) {
                this.data.group_level = gLv + 1;
                this.data.group_exp = 0;
            }
            this.save();
            respond({
                guildId: Number(this.data.group_id || 1),
                level: Number(this.data.group_level || 1),
                exp: Number(this.data.group_exp || 0),
                expRequired: Number(this.data.group_level || 1) * 1000,
                maxLevel: 20,
                fund: Number(this.data.group_fund || 500),
                contribution: Number(this.data.group_contribution || 0),
                canUpgrade: true,
                donations: {
                    gold: { currency: "gold", cost: 500000, limit: 5, exp: 100, fund: 100, contribution: 100, used: Number(this.data.guild_donate_gold || 0), left: Math.max(0, 5 - Number(this.data.guild_donate_gold || 0)) },
                    diamond: { currency: "diamond", cost: 100, limit: 3, exp: 100, fund: 100, contribution: 100, used: Number(this.data.guild_donate_gem || 0), left: Math.max(0, 3 - Number(this.data.guild_donate_gem || 0)) }
                },
                skills: [
                    { key: "hp", name: "Sinh lực", level: Number((this.data.guild_skills && this.data.guild_skills.hp) || 0), percent: 0, cap: Number(this.data.group_level || 1), cost: 500 },
                    { key: "atk", name: "Công kích", level: Number((this.data.guild_skills && this.data.guild_skills.atk) || 0), percent: 0, cap: Number(this.data.group_level || 1), cost: 500 },
                    { key: "def", name: "Phòng thủ", level: Number((this.data.guild_skills && this.data.guild_skills.def) || 0), percent: 0, cap: Number(this.data.group_level || 1), cost: 500 }
                ],
                logs: []
            });
            return true;
        }

        if (cmd === "GuildSkillUpgrade") {
            var sKey = (params && params[0]) ? String(params[0]) : "hp";
            if (!this.data.guild_skills) this.data.guild_skills = { hp: 0, atk: 0, def: 0 };
            this.data.guild_skills[sKey] = Number(this.data.guild_skills[sKey] || 0) + 1;
            this.data.group_contribution = Math.max(0, Number(this.data.group_contribution || 0) - 500);
            this.save();
            respond({});
            return true;
        }

        if (cmd === "GetWorShipGold") {
            respond({ count2: 0, gold: 0 });
            return true;
        }

        if (cmd === "Worship") {
            this.addGold(100000, queuePush);
            this.save();
            respond({ gold: 100000, count: 1 });
            return true;
        }

        if (cmd === "ReceiveWorship") {
            this.addGold(50000, queuePush);
            respond({ gold: 50000 });
            return true;
        }

        if (cmd === "GetGroupResource") {
            respond({ resource: Number(this.data.group_resource || 10000) });
            return true;
        }

        if (cmd === "SearchGroup") {
            var q = String((params && params[0]) || "");
            var allG = [
                { id: 1, name: "Làng Lá", level: 5, icon: 20806, capacity: 30, size: 18, min_lv: 30, president_name: "Naruto", notice: "Kế thừa Hỏa Chí!" },
                { id: 2, name: "Akatsuki", level: 6, icon: 20002, capacity: 30, size: 24, min_lv: 40, president_name: "Pain", notice: "Thế giới sẽ biết nỗi đau." },
                { id: 3, name: "Uchiha Clan", level: 4, icon: 20003, capacity: 30, size: 15, min_lv: 30, president_name: "Itachi", notice: "Gia tộc Uchiha chiêu mộ." }
            ];
            respond({ groups: allG.filter(function(g) { return String(g.id) === q || g.name.indexOf(q) >= 0; }), logs: [] });
            return true;
        }

        if (cmd === "CancelApplyGroup" || cmd === "AduitGroupApplyLog" || cmd === "SetGroupRole" ||
            cmd === "TransferBoss" || cmd === "ExtendGroupBoss") {
            respond({ status: 1 });
            return true;
        }

        if (cmd === "SetGroupNotice") {
            this.data.group_notice = String((params && params[0]) || "");
            respond({ status: 1 });
            return true;
        }

        if (cmd === "GroupEventLogs") {
            respond({ logs: [], hires: [] });
            return true;
        }

        if (cmd === "GetGroupInfo") {
            respond({ group: { id: Number(this.data.group_id || 1), name: this.data.group_name || "Làng Lá", level: Number(this.data.group_level || 1), icon: Number(this.data.group_icon || 20806), point: 0, rank: 0 } });
            return true;
        }

        // Guild War & Cross Guild War
        var gwDefStr = JSON.stringify([
            this.computeHeroPayload(10010),
            this.createDefaultHeroRecord(10020),
            this.createDefaultHeroRecord(10040)
        ]);

        if (cmd === "GroupStatus") {
            respond({ status: Number(this.data.group_war_status !== undefined ? this.data.group_war_status : 1), cs_status: 1 });
            return true;
        }

        if (cmd === "GroupFightStatus" || cmd === "CsGroupFightStatus") {
            respond({ status: Number(this.data.group_fight_status !== undefined ? this.data.group_fight_status : 4), change_time: nowTs + 86400 });
            return true;
        }

        if (cmd === "GetGroupLinuUp") {
            respond({
                lineup: {
                    heros: gwDefStr,
                    def_heros: gwDefStr,
                    def_heros1: gwDefStr,
                    def_heros2: gwDefStr,
                    def_heros3: "",
                    def_heros4: "",
                    def_heros5: ""
                }
            });
            return true;
        }

        if (cmd === "CsGetGroupLinuUp") {
            respond({
                status: Number(this.data.group_fight_status !== undefined ? this.data.group_fight_status : 4),
                change_time: nowTs + 86400,
                lineup: {
                    heros: gwDefStr,
                    def_heros: gwDefStr,
                    def_heros1: gwDefStr,
                    def_heros2: gwDefStr,
                    def_heros3: "",
                    def_heros4: "",
                    def_heros5: ""
                }
            });
            return true;
        }

        if (cmd === SVRCMD.SetGroupFightLineupEx || cmd === "SetGroupFightLineup" || cmd === "CsSetGroupFightLineup") {
            respond({ status: 1 });
            return true;
        }

        if (cmd === "GroupRank" || cmd === "CsGroupRank" || cmd === "CsGroupSeasonRank") {
            respond({
                groups: [
                    { id: 1, name: this.data.group_name || "Làng Lá", level: Number(this.data.group_level || 5), icon: Number(this.data.group_icon || 20806), point: Number(this.data.war_my_point || 1200), rank: 1, server_id: 1, president_name: this.data.team_name || "Nhẫn Giả" },
                    { id: 2, name: "Akatsuki", level: 6, icon: 20002, point: 980, rank: 2, server_id: 2, president_name: "Pain" },
                    { id: 3, name: "Uchiha Clan", level: 4, icon: 20003, point: 850, rank: 3, server_id: 1, president_name: "Itachi" }
                ]
            });
            return true;
        }

        if (cmd === "GroupFightHistorys" || cmd === "CsGroupFightHistorys") {
            respond({
                history: [
                    {
                        id: 101,
                        time: nowTs - 3600,
                        atk_id: this.getNumericId(),
                        atk_name: this.data.team_name || "Nhẫn Giả",
                        atk_lv: Number(this.data.team_lv || 1),
                        atk_icon: Number(this.data.icon || 2010080),
                        atk_group_name: this.data.group_name || "Làng Lá",
                        def_id: 201,
                        def_name: "Pain Tendo",
                        def_lv: 90,
                        def_icon: 10050,
                        def_group_name: "Akatsuki",
                        is_win: 1,
                        star: 3,
                        point: 30
                    }
                ]
            });
            return true;
        }

        if (cmd === "HireStatus") {
            respond({ hireStatus: 0 });
            return true;
        }

        if (cmd === "HireStatusInfo") {
            respond({ hireStatus: 0, hires: [] });
            return true;
        }

        if (cmd === "Registration" || cmd === "CsRegistration") {
            this.data.group_war_status = 1;
            respond({ status: 1 });
            return true;
        }

        if (cmd === "GroupFightInfo" || cmd === "CsGroupFightInfo") {
            respond({
                status: Number(this.data.group_fight_status !== undefined ? this.data.group_fight_status : 4),
                group: {
                    id: Number(this.data.group_id || 1),
                    name: this.data.group_name || "Làng Lá",
                    icon: Number(this.data.group_icon || 20806),
                    level: Number(this.data.group_level || 5),
                    server_id: 1
                },
                opponent: [
                    { player_id: this.getNumericId(), name: this.data.team_name || "Nhẫn Giả", lv: Number(this.data.team_lv || 80), icon: Number(this.data.icon || 2010080), role: Number(this.data.group_role || 1) },
                    { player_id: 101, name: "Uchiha Sasuke", lv: 95, icon: 10020, role: 2 },
                    { player_id: 102, name: "Haruno Sakura", lv: 92, icon: 10030, role: 3 },
                    { player_id: 103, name: "Hatake Kakashi", lv: 98, icon: 10050, role: 4 }
                ]
            });
            return true;
        }

        if (cmd === "OpponentInfo" || cmd === "CsOpponentInfo") {
            respond({
                status: Number(this.data.group_fight_status !== undefined ? this.data.group_fight_status : 4),
                group: { id: 2, name: "Akatsuki", icon: 20002, level: 6, server_id: 2 },
                opponent: [
                    { player_id: 201, name: "Pain Tendo", lv: 95, icon: 10050, role: 1 },
                    { player_id: 202, name: "Uchiha Itachi", lv: 94, icon: 11000, role: 2 },
                    { player_id: 203, name: "Konan", lv: 90, icon: 10040, role: 3 },
                    { player_id: 204, name: "Kisame", lv: 88, icon: 10020, role: 4 },
                    { player_id: 205, name: "Deidara", lv: 86, icon: 10010, role: 4 },
                    { player_id: 206, name: "Sasori", lv: 85, icon: 10070, role: 4 }
                ]
            });
            return true;
        }

        if (cmd === "BattleInfo" || cmd === "CsBattleInfo") {
            respond({
                status: Number(this.data.group_fight_status !== undefined ? this.data.group_fight_status : 4),
                point: { group_id: Number(this.data.group_id || 1), point: Number(this.data.war_my_point || 120) },
                targetPoint: { group_id: 2, point: 80 },
                lineupStatus: [
                    { player_id: this.getNumericId(), star: 0, last_atk_time: 0 },
                    { player_id: 101, star: 0, last_atk_time: 0 },
                    { player_id: 102, star: 0, last_atk_time: 0 },
                    { player_id: 103, star: 0, last_atk_time: 0 }
                ],
                targetLineupStatus: [
                    { player_id: 201, star: 0, last_atk_time: 0 },
                    { player_id: 202, star: 1, last_atk_time: 0 },
                    { player_id: 203, star: 2, last_atk_time: 0 },
                    { player_id: 204, star: 0, last_atk_time: 0 },
                    { player_id: 205, star: 0, last_atk_time: 0 },
                    { player_id: 206, star: 3, last_atk_time: 0 }
                ],
                hireStatus: {}
            });
            return true;
        }

        if (cmd === "DynamicBattleInfo" || cmd === "CsDynamicBattleInfo") {
            respond({
                pointInfo: [
                    { group_id: Number(this.data.group_id || 1), point: Number(this.data.war_my_point || 120) },
                    { group_id: 2, point: 80 }
                ],
                status: { group_id: 2, player_id: 201, star: 1, last_atk_time: 0 },
                blacks: []
            });
            return true;
        }

        if (cmd === "GetGroupFighter" || cmd === "CsGetGroupFighter") {
            respond({
                status: Number(this.data.group_fight_status !== undefined ? this.data.group_fight_status : 4),
                fighter: {
                    player_id: this.getNumericId(),
                    group_id: Number(this.data.group_id || 1),
                    role: Number(this.data.group_role || 1),
                    atk_count: Number(this.data.war_atk_count || 0),
                    gold: Number(this.data.war_gold || 50000),
                    group_point: Number(this.data.war_point || 100),
                    hero_info: "",
                    hire_info: "",
                    hire_key: "",
                    hire_hero: ""
                }
            });
            return true;
        }

        if (cmd === "GetHeroLineup" || cmd === "CsGetHeroLineup") {
            respond({
                lineup: {
                    heros: gwDefStr,
                    def_heros: gwDefStr,
                    def_heros1: gwDefStr,
                    def_heros2: gwDefStr,
                    def_heros3: "",
                    def_heros4: "",
                    def_heros5: ""
                }
            });
            return true;
        }

        if (cmd === "AfterGroupFight" || cmd === "CsAfterGroupFight") {
            this.addGold(100000, queuePush);
            this.addCurrency(12, 200, queuePush);
            this.addCurrency(15, 200, queuePush);
            this.data.war_my_point = Number(this.data.war_my_point || 120) + 30;
            this.data.war_atk_count = Number(this.data.war_atk_count || 0) + 1;
            respond({
                result: 1,
                isWin: 1,
                useZip: false,
                fightData: "",
                fightDatas: []
            });
            return true;
        }

        if (cmd === "CrossUnionWar" || cmd === "CrossUnionWarInfo") {
            respond({
                status: 1,
                team_count: 7,
                round: 1,
                union_name: "Konoha Liên Minh",
                enemy_union_name: "Akatsuki Quân Đoàn",
                my_teams: [
                    { team_id: 1, leader: "Naruto", power: 2000000, alive: 5 },
                    { team_id: 2, leader: "Sasuke", power: 1950000, alive: 5 },
                    { team_id: 3, leader: "Kakashi", power: 1800000, alive: 5 },
                    { team_id: 4, leader: "Itachi", power: 1850000, alive: 5 },
                    { team_id: 5, leader: "Jiraiya", power: 1750000, alive: 5 },
                    { team_id: 6, leader: "Tsunade", power: 1700000, alive: 5 },
                    { team_id: 7, leader: "Orochimaru", power: 1700000, alive: 5 }
                ]
            });
            return true;
        }

        return false;
    }
};

module.exports = GuildHandler;
