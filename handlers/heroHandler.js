// ============================================================================
// HANDLER: TƯỚNG, TRANG BỊ, KỸ NĂNG, BÁT MÔN, VĨ THÚ, HỌC VIỆN, BÍ TỊCH, NHẪN CỤ & TÚI ĐỒ
// (Hero, Equip, Skill, BaMen, Awaken, Tailed Beasts, Ninja Academy, Secrets/Gems, Ninja Tools & Bag UseItem/Sell)
// ============================================================================

const HeroHandler = {
    createDefaultHeroRecord: function(hid) {
        hid = Number(hid);
        var star = 1;
        if (typeof Config !== "undefined" && Config.hero && Config.hero[hid] && Config.hero[hid].star) {
            star = Config.hero[hid].star;
        }
        return {
            id: hid,
            hero_id: hid,
            lv: 1,
            level: 1,
            exp: 0,
            quality: 1,
            star: star,
            status: 0,
            has_awake: 0,
            bagate_level: 0,
            equip_1: 0,
            equip_2: 0,
            equip_3: 0,
            equip_4: 0,
            equip_5: 0,
            equip_6: 0,
            ninja_tool_1: 0,
            ninja_tool_2: 0,
            ninja_tool_3: 0,
            ninja_tool_4: 0,
            ninja_tool_5: 0,
            ninja_tool_6: 0,
            skill_1_lv: 1,
            skill_2_lv: 0,
            skill_3_lv: 0,
            skill_4_lv: 0,
            skill_5_lv: 0,
            skill_6_lv: 0,
            skill_7_lv: 0,
            skill_8_lv: 0,
            skill_9_lv: 0,
            skill_10_lv: 0,
            skill_11_lv: 1,
            skill_12_lv: 1,
            sel_tf_skill: 0
        };
    },

    computeHeroPayload: function(hid) {
        hid = Number(hid);
        if (!this.data.heros[hid]) {
            this.data.heros[hid] = this.createDefaultHeroRecord(hid);
        }
        var h = this.data.heros[hid];
        var lv = Number(h.lv || h.level || 1);
        var qVal = Number(h.quality || 1);
        var qty = null;
        if (typeof Config !== "undefined" && Config.heroQuality) {
            for (var q = qVal; q >= 1; q--) {
                if (Config.heroQuality[q] && Config.heroQuality[q][hid]) {
                    qVal = q;
                    qty = Config.heroQuality[q][hid];
                    break;
                }
            }
        }
        h.lv = lv;
        h.level = lv;
        h.quality = qVal;

        if (qVal >= 2 && (!h.skill_2_lv || h.skill_2_lv < 1)) h.skill_2_lv = 1;
        if (qVal >= 4 && (!h.skill_3_lv || h.skill_3_lv < 1)) h.skill_3_lv = 1;
        if (qVal >= 7 && (!h.skill_4_lv || h.skill_4_lv < 1)) h.skill_4_lv = 1;
        if ((qVal >= 12 || h.has_awake) && (!h.skill_5_lv || h.skill_5_lv < 1)) h.skill_5_lv = 1;
        if (!h.skill_1_lv || h.skill_1_lv < 1) h.skill_1_lv = 1;
        if (!h.skill_11_lv || h.skill_11_lv < 1) h.skill_11_lv = 1;
        if (!h.skill_12_lv || h.skill_12_lv < 1) h.skill_12_lv = 1;

        if (typeof Config !== "undefined" && Config.hero_quality_up) {
            for (var k in Config.hero_quality_up) {
                var qUp = Config.hero_quality_up[k];
                if (qUp && qUp.is_open == 1 && qUp.new_skill > 0 && Number(k) < qVal) {
                    var oldSkLv = h["skill_" + qUp.del_skill + "_lv"] || 1;
                    if (!h["skill_" + qUp.new_skill + "_lv"] || h["skill_" + qUp.new_skill + "_lv"] < oldSkLv) {
                        h["skill_" + qUp.new_skill + "_lv"] = oldSkLv;
                    }
                }
            }
        }

        var hp = 150, atk = 20, def = 5, mp = 15, mp_def = 5, cri = 5, mp_cri = 5;
        if (qty) {
            hp = Number(qty.hp || 0) + (lv - 1) * Number(qty.hp_inc || 0);
            atk = Number(qty.atk || 0) + (lv - 1) * Number(qty.atk_inc || 0);
            def = Number(qty.def || 0) + (lv - 1) * Number(qty.def_inc || 0);
            mp = Number(qty.mp || 0) + (lv - 1) * Number(qty.mp_inc || 0);
            mp_def = Number(qty.mpdef || 0) + (lv - 1) * Number(qty.mpdef_inc || 0);
            cri = Number(qty.cri || 0);
            mp_cri = Number(qty.mp_cri || 0);
        }

        // Equipped items stats
        for (var s = 1; s <= 6; s++) {
            var eqStatus = Number(h["equip_" + s] || 0);
            if (eqStatus > 0 && typeof Config !== "undefined" && Config.equip) {
                var eqId = (qty && qty["equip_" + s]) ? qty["equip_" + s] : eqStatus;
                var eqCfg = Config.equip[eqId];
                if (eqCfg) {
                    hp += Number(eqCfg.hp || 0);
                    atk += Number(eqCfg.atk || 0);
                    def += Number(eqCfg.def || 0);
                    mp += Number(eqCfg.mp || 0);
                    mp_def += Number(eqCfg.mpdef || 0);
                    cri += Number(eqCfg.cri || 0);
                    mp_cri += Number(eqCfg.mp_cri || 0);
                }
            }
        }

        // Unlocked Tailed Beasts stats
        var heroBeasts = (this.data.beasts && this.data.beasts[hid]) ? this.data.beasts[hid] : [];
        if (heroBeasts.length > 0 && typeof Config !== "undefined" && Config.beast) {
            for (var bIdx = 0; bIdx < heroBeasts.length; bIdx++) {
                var bObj = heroBeasts[bIdx];
                var bLv = Number(bObj.lv || 1);
                var bCfg = Config.beast[bObj.beast_id] && Config.beast[bObj.beast_id][bLv];
                if (bCfg) {
                    hp += Number(bCfg.hp || 0);
                    atk += Number(bCfg.atk || 0);
                    def += Number(bCfg.def || 0);
                    mp += Number(bCfg.mp || 0);
                    mp_def += Number(bCfg.mp_def || bCfg.mpdef || 0);
                    cri += Number(bCfg.cri || 0);
                    mp_cri += Number(bCfg.mp_cri || 0);
                }
                if (bObj.soul_bonus) {
                    hp += Number(bObj.soul_bonus.hp || 0);
                    atk += Number(bObj.soul_bonus.atk || 0);
                    mp += Number(bObj.soul_bonus.mp || 0);
                    def += Number(bObj.soul_bonus.def || 0);
                    mp_def += Number(bObj.soul_bonus.mp_def || 0);
                }
            }
        }

        // Eight Gates (BaMen) stats
        var bgLv = Number(h.bagate_level || 0);
        if (bgLv > 0 && typeof Config !== "undefined" && Config.bamen) {
            for (var g = 1; g <= bgLv; g++) {
                var gCfg = Config.bamen[g];
                if (gCfg) {
                    hp += Number(gCfg.hp || 0);
                    atk += Number(gCfg.atk || 0);
                    def += Number(gCfg.def || 0);
                    mp += Number(gCfg.chak || 0);
                    mp_def += Number(gCfg.chadef || 0);
                }
            }
        }

        // Equipped secrets (gems pos 101..106 & tactic scrolls pos 1..6) on this hero
        var secMap = {};
        if (this.data.secrets) {
            for (var si = 0; si < this.data.secrets.length; si++) {
                var sec = this.data.secrets[si];
                if (Number(sec.hero_id) === hid && Number(sec.status) === 1) {
                    var sPos = Number(sec.pos || 0);
                    if (sPos >= 1 && sPos <= 6) {
                        secMap[sPos] = sec;
                    }
                    if (typeof Config !== "undefined" && Config.equip && Config.equip[sec.equip_id]) {
                        var sCfg = Config.equip[sec.equip_id];
                        var sLv = Math.max(1, Number(sec.lv || 1));
                        hp += Number(sCfg.hp || 0) + (sLv - 1) * Number(sCfg.hp_inc || 0);
                        atk += Number(sCfg.atk || 0) + (sLv - 1) * Number(sCfg.atk_inc || 0);
                        def += Number(sCfg.def || 0) + (sLv - 1) * Number(sCfg.def_inc || 0);
                        mp += Number(sCfg.mp || 0) + (sLv - 1) * Number(sCfg.mp_inc || 0);
                        mp_def += Number(sCfg.mpdef || 0) + (sLv - 1) * Number(sCfg.mpdef_inc || 0);
                        cri += Number(sCfg.cri || 0);
                        mp_cri += Number(sCfg.mp_cri || 0);
                    }
                }
            }
        }

        return {
            id: hid,
            hero_id: hid,
            lv: lv,
            level: lv,
            exp: Number(h.exp || 0),
            quality: qVal,
            star: Number(h.star || 1),
            status: 0,
            beast: heroBeasts.length,
            has_awake: Number(h.has_awake || 0),
            bagate_level: bgLv,
            hp: Math.floor(hp),
            atk: Math.floor(atk),
            def: Math.floor(def),
            mp: Math.floor(mp),
            mp_def: Math.floor(mp_def),
            cri: Number(cri.toFixed(2)),
            mp_cri: Number(mp_cri.toFixed(2)),
            equip_1: Number(h.equip_1 || 0),
            equip_2: Number(h.equip_2 || 0),
            equip_3: Number(h.equip_3 || 0),
            equip_4: Number(h.equip_4 || 0),
            equip_5: Number(h.equip_5 || 0),
            equip_6: Number(h.equip_6 || 0),
            ninja_tool_1: Number(h.ninja_tool_1 || 0),
            ninja_tool_2: Number(h.ninja_tool_2 || 0),
            ninja_tool_3: Number(h.ninja_tool_3 || 0),
            ninja_tool_4: Number(h.ninja_tool_4 || 0),
            ninja_tool_5: Number(h.ninja_tool_5 || 0),
            ninja_tool_6: Number(h.ninja_tool_6 || 0),
            secret_1_id: secMap[1] ? Number(secMap[1].equip_id) : 0,
            secret_1_lv: secMap[1] ? Number(secMap[1].lv || 1) : 0,
            secret_2_id: secMap[2] ? Number(secMap[2].equip_id) : 0,
            secret_2_lv: secMap[2] ? Number(secMap[2].lv || 1) : 0,
            secret_3_id: secMap[3] ? Number(secMap[3].equip_id) : 0,
            secret_3_lv: secMap[3] ? Number(secMap[3].lv || 1) : 0,
            secret_4_id: secMap[4] ? Number(secMap[4].equip_id) : 0,
            secret_4_lv: secMap[4] ? Number(secMap[4].lv || 1) : 0,
            secret_5_id: secMap[5] ? Number(secMap[5].equip_id) : 0,
            secret_5_lv: secMap[5] ? Number(secMap[5].lv || 1) : 0,
            secret_6_id: secMap[6] ? Number(secMap[6].equip_id) : 0,
            secret_6_lv: secMap[6] ? Number(secMap[6].lv || 1) : 0,
            skill_1_lv: Number(h.skill_1_lv || 1),
            skill_2_lv: Number(h.skill_2_lv || 0),
            skill_3_lv: Number(h.skill_3_lv || 0),
            skill_4_lv: Number(h.skill_4_lv || 0),
            skill_5_lv: Number(h.skill_5_lv || 0),
            skill_6_lv: Number(h.skill_6_lv || 0),
            skill_7_lv: Number(h.skill_7_lv || 0),
            skill_8_lv: Number(h.skill_8_lv || 0),
            skill_9_lv: Number(h.skill_9_lv || 0),
            skill_10_lv: Number(h.skill_10_lv || 0),
            skill_11_lv: Number(h.skill_11_lv || 1),
            skill_12_lv: Number(h.skill_12_lv || 1),
            sel_tf_skill: Number(h.sel_tf_skill || 0)
        };
    },

    handleHeroCommand: function(cmd, params, respond, queuePush) {
        var self = this;

        if (cmd === SVRCMD.LearnEquip || cmd === SVRCMD.HeroEquip) {
            var equipId = Number((params && params[0]) || 0);
            var heroId = Number((params && params[1]) || 0);
            var slotIdx = Number((params && params[2]) || 1);
            if (this.data.heros[heroId]) {
                if (!self.canDeductEquip(equipId, 1)) {
                    return respond({}, { code: 1, msg: "Không có trang bị trong túi!" }), true;
                }
                self.deductEquip(equipId, 1, queuePush);
                this.data.heros[heroId]["equip_" + slotIdx] = equipId || 1;
                var hPayload = this.computeHeroPayload(heroId);
                queuePush(SVRCMD.Hero, { hero: hPayload });
            }
            respond({ status: 1 });
            return true;
        }

        if (cmd === SVRCMD.UpgradeQuality || cmd === SVRCMD.AwakeHero) {
            var heroId = Number((params && params[0]) || 0);
            if (this.data.heros[heroId]) {
                var h = this.data.heros[heroId];
                var oldQ = Number(h.quality || 1);
                var nextQ = oldQ + 1;
                var hCfg = (typeof Config !== "undefined" && Config.hero) ? Config.hero[heroId] : null;
                if (typeof Config !== "undefined" && Config.heroQuality && Config.heroQuality[nextQ] && Config.heroQuality[nextQ][heroId]) {
                    var qUp = (Config.hero_quality_up && Config.hero_quality_up[oldQ]) ? Config.hero_quality_up[oldQ] : null;
                    if (oldQ === 11) {
                        // Awakening (11 -> 12): uses 200 souls + awake_equip_id
                        var soulId11 = this.findSoulItemId(heroId);
                        if (this.getItemAmount(soulId11) >= 200) {
                            this.deductItem(soulId11, 200, queuePush);
                        }
                        if (hCfg && hCfg.awake_equip_id && this.getEquipAmount(hCfg.awake_equip_id) >= 1) {
                            this.deductEquip(hCfg.awake_equip_id, 1, queuePush);
                        }
                    } else if (qUp && Number(qUp.type) === 2) {
                        // Awaken+1 (12 -> 13): uses 300 souls + awake2_equip_ids
                        var soulId12 = this.findSoulItemId(heroId);
                        if (this.getItemAmount(soulId12) >= 300) {
                            this.deductItem(soulId12, 300, queuePush);
                        }
                        if (hCfg && hCfg.awake2_equip_ids) {
                            var eqArr2 = String(hCfg.awake2_equip_ids).split(",");
                            for (var ei2 = 0; ei2 < eqArr2.length; ei2++) {
                                var eqId2 = Number(eqArr2[ei2]);
                                if (eqId2 > 0 && this.getEquipAmount(eqId2) >= 1) {
                                    this.deductEquip(eqId2, 1, queuePush);
                                }
                            }
                        }
                    } else if (qUp) {
                        var needSoul = Number(qUp.need_soul || qUp.soul_count || 0);
                        if (needSoul > 0) {
                            var soulIdQ = this.findSoulItemId(heroId);
                            if (this.getItemAmount(soulIdQ) > 0) {
                                this.changeItemAmount(soulIdQ, -needSoul, queuePush);
                            }
                        }
                        var needItemStr = String(qUp.need_item || "");
                        if (needItemStr && needItemStr !== "0") {
                            var eqParts = needItemStr.split(",");
                            for (var epi = 0; epi < eqParts.length; epi++) {
                                var needEqId = Number(eqParts[epi]);
                                if (needEqId > 0) {
                                    if (Config.equip && Config.equip[needEqId] && this.getEquipAmount(needEqId) > 0) {
                                        this.deductEquip(needEqId, 1, queuePush);
                                    } else if (Config.item && Config.item[needEqId] && this.getItemAmount(needEqId) > 0) {
                                        this.deductItem(needEqId, 1, queuePush);
                                    }
                                }
                            }
                        }
                    }
                    h.quality = nextQ;
                    h.equip_1 = 0;
                    h.equip_2 = 0;
                    h.equip_3 = 0;
                    h.equip_4 = 0;
                    h.equip_5 = 0;
                    h.equip_6 = 0;
                    if (nextQ >= 12) {
                        h.has_awake = 1;
                    }
                }
                var hPayload = this.computeHeroPayload(heroId);
                queuePush(SVRCMD.Hero, { hero: hPayload });
            }
            respond({ status: 1 });
            return true;
        }

        if (cmd === SVRCMD.SkillUpgradeInfo) {
            respond({ leftCount: 9999, point: 9999, lastTime: Math.floor(Date.now() / 1000) });
            return true;
        }

        if (cmd === SVRCMD.UpgradeSkill) {
            var heroId = Number((params && params[0]) || 0);
            var skillParam = Number((params && params[1]) || 1);
            var newLv = 2;
            if (this.data.heros[heroId]) {
                var h = this.data.heros[heroId];
                var skillIndex = skillParam;
                var skillId = skillParam;
                if (skillParam > 12 && typeof Config !== "undefined" && Config.hero && Config.hero[heroId]) {
                    var hCfg = Config.hero[heroId];
                    for (var sIdx = 1; sIdx <= 12; sIdx++) {
                        if (Number(hCfg["skill_id_" + sIdx]) === skillParam) {
                            skillIndex = sIdx;
                            break;
                        }
                    }
                } else if (skillParam <= 12 && typeof Config !== "undefined" && Config.hero && Config.hero[heroId]) {
                    skillId = Number(Config.hero[heroId]["skill_id_" + skillIndex] || skillParam);
                }
                if (skillIndex < 1 || skillIndex > 12) skillIndex = 1;
                var curLv = Number(h["skill_" + skillIndex + "_lv"] !== undefined ? h["skill_" + skillIndex + "_lv"] : 1);

                var maxLv = 80;
                if (skillIndex === 3 || skillIndex === 8) maxLv = 60;
                else if (skillIndex === 4 || skillIndex === 5 || skillIndex === 9 || skillIndex === 10) maxLv = 40;

                newLv = Math.min(maxLv, curLv + 1);
                var costGold = 100 * Math.max(1, curLv);
                if (typeof Config !== "undefined" && Config.skillLevel && Config.skillLevel[curLv]) {
                    var q = (Config.skill && Config.skill[skillId]) ? Number(Config.skill[skillId].quality || 1) : 1;
                    if (Config.skillLevel[curLv][q] && Config.skillLevel[curLv][q].price !== undefined) {
                        costGold = Number(Config.skillLevel[curLv][q].price || costGold);
                    }
                }
                if (!self.canDeductGold(costGold)) {
                    return respond({}, { code: 1, msg: "Không đủ Vàng để nâng cấp kỹ năng!" }), true;
                }
                self.deductGold(costGold, queuePush);
                h["skill_" + skillIndex + "_lv"] = newLv;
                if (skillIndex <= 5 && Number(h["skill_" + (skillIndex + 5) + "_lv"] || 0) > 0) {
                    h["skill_" + (skillIndex + 5) + "_lv"] = newLv;
                } else if (skillIndex >= 6 && skillIndex <= 10) {
                    h["skill_" + (skillIndex - 5) + "_lv"] = newLv;
                }
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            respond({ skillLv: newLv, leftCount: 9999, point: 9999, lastTime: Math.floor(Date.now() / 1000) });
            return true;
        }

        if (cmd === SVRCMD.SelectTfSkill) {
            var heroId = Number((params && params[0]) || 0);
            var skillId = Number((params && params[1]) || 0);
            if (this.data.heros[heroId]) {
                this.data.heros[heroId].sel_tf_skill = skillId;
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            respond({ status: 1, selTfSkill: skillId });
            return true;
        }

        if (cmd === SVRCMD.UpgradeTfSkill) {
            var heroId = Number((params && params[0]) || 0);
            var skillId = Number((params && params[1]) || 0);
            var targetNewLv = 2;
            if (this.data.heros[heroId] && typeof Config !== "undefined" && Config.hero && Config.hero[heroId]) {
                var h = this.data.heros[heroId];
                var hCfg = Config.hero[heroId];
                if (hCfg.skill_id_11 == skillId) {
                    var curLv = Number(h.skill_11_lv || 1);
                    targetNewLv = Math.min(6, curLv + 1);
                    h.skill_11_lv = targetNewLv;
                } else if (hCfg.skill_id_12 == skillId) {
                    var curLv = Number(h.skill_12_lv || 1);
                    targetNewLv = Math.min(6, curLv + 1);
                    h.skill_12_lv = targetNewLv;
                }
                var soulId = this.findSoulItemId(heroId);
                if (this.getItemAmount(soulId) >= 10) {
                    this.deductItem(soulId, 10, queuePush);
                }
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            respond({ status: 1, skillLv: targetNewLv });
            return true;
        }

        if (cmd === SVRCMD.GetHeroAwakeTasks) {
            var heroId = Number((params && params[0]) || 0);
            var heroCfg = (typeof Config !== "undefined" && Config.hero) ? Config.hero[heroId] : null;
            var taskIds = [];
            if (heroCfg && heroCfg.awake_task_ids) {
                taskIds = String(heroCfg.awake_task_ids).split("/");
            }
            var respData = {};
            var isAwakened = (this.data.heros[heroId] && Number(this.data.heros[heroId].has_awake) === 1);
            var isTaskDone = (this.data.awake_task_progress && this.data.awake_task_progress[heroId] === 1);
            for (var ti = 0; ti < taskIds.length; ti++) {
                var tid = taskIds[ti];
                if (tid) {
                    respData[String(tid)] = (isAwakened || isTaskDone) ? 1 : 0;
                }
            }
            respond(respData);
            return true;
        }

        if (cmd === SVRCMD.GenerateAwakeTask) {
            var heroId = Number((params && params[0]) || 0);
            var heroCfg = (typeof Config !== "undefined" && Config.hero) ? Config.hero[heroId] : null;
            var taskIds = [];
            if (heroCfg && heroCfg.awake_task_ids) {
                taskIds = String(heroCfg.awake_task_ids).split("/");
            }
            var activeTaskId = (taskIds.length > 0) ? Number(taskIds[taskIds.length - 1]) : 16461;
            this.data.active_awake_hero = heroId;
            this.data.cur_task_id = activeTaskId;
            this.data.task_id = activeTaskId;
            respond({ status: 1 });
            return true;
        }

        if (cmd === SVRCMD.UpgradeBaMen) {
            var heroId = Number((params && params[0]) || 0);
            var targetLv = Number((params && params[1]) || 0);
            var respLv = 1;
            if (this.data.heros[heroId]) {
                var h = this.data.heros[heroId];
                var curBg = Number(h.bagate_level || 0);
                var nextBg = targetLv > 0 ? targetLv : (curBg + 1);
                if (nextBg > 200) nextBg = 200;

                var bgCfg = (typeof Config !== "undefined" && Config.bamen && Config.bamen[nextBg]) ? Config.bamen[nextBg] : null;
                var costGold = bgCfg ? Number(bgCfg.gold || 0) : (nextBg * 10000);
                var costStone = bgCfg ? Number(bgCfg.stone || 0) : 0;
                var costSoul = bgCfg ? Number(bgCfg.soul || 0) : 0;
                var costItemId = bgCfg ? Number(bgCfg.item_id || 10140) : 10140;
                var costItemCount = bgCfg ? Number(bgCfg.item_count || 0) : 5;

                if (costGold > 0 && !self.canDeductGold(costGold)) {
                    return respond({}, { code: 1, msg: "Không đủ Vàng để mở Bát Môn!" }), true;
                }
                if (costStone > 0 && !self.canDeductStone(costStone)) {
                    return respond({}, { code: 1, msg: "Không đủ Kim Cương để mở Bát Môn!" }), true;
                }
                if (costItemId > 0 && costItemCount > 0 && this.getItemAmount(costItemId) >= costItemCount) {
                    self.deductItem(costItemId, costItemCount, queuePush);
                }
                if (costSoul > 0) {
                    var soulIdBg = this.findSoulItemId(heroId);
                    if (this.getItemAmount(soulIdBg) >= costSoul) {
                        self.deductItem(soulIdBg, costSoul, queuePush);
                    }
                }
                if (costGold > 0) self.deductGold(costGold, queuePush);
                if (costStone > 0) self.deductStone(costStone, queuePush);

                h.bagate_level = nextBg;
                respLv = nextBg;
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            respond({ status: 1, bagate_level: respLv });
            return true;
        }

        if (cmd === SVRCMD.UseItem || cmd === SVRCMD.ComposeItem || cmd === SVRCMD.ComposeEquip || cmd === SVRCMD.ForgeEquip) {
            var itemId = Number((params && params[0]) || 0);
            var param1 = (params && params.length >= 2) ? Number(params[1] || 0) : 0;
            var param2 = (params && params.length >= 3) ? Number(params[2] || 0) : 0;
            var count = Math.max(1, param2 || param1 || 1);
            var targetHeroId = param1;
            var itCfg = (typeof Config !== "undefined" && Config.item && Config.item[itemId]) ? Config.item[itemId] : null;
            var outItems = [];

            if (cmd === SVRCMD.ComposeEquip || cmd === SVRCMD.ForgeEquip) {
                // Direct equip synthesis from sub-equips/shards
                var eqTargetId = itemId;
                var eqTargetCfg = (typeof Config !== "undefined" && Config.equip && Config.equip[eqTargetId]) ? Config.equip[eqTargetId] : null;
                if (eqTargetCfg) {
                    var forgeCoin = Number(eqTargetCfg.forge_coin || 0);
                    if (forgeCoin > 0 && !this.canDeductGold(forgeCoin)) {
                        return respond({}, { code: 1, msg: "Không đủ Vàng để ghép trang bị!" }), true;
                    }
                    if (forgeCoin > 0) this.deductGold(forgeCoin, queuePush);
                    this.changeEquipAmount(eqTargetId, 1, queuePush);
                }
                respond({ status: 1, success: 1 });
                return true;
            }

            if (itCfg) {
                var iType = Number(itCfg.item_type || 0);
                if ((iType === 1 || (typeof Config !== "undefined" && Config.expItem && Config.expItem[itemId])) && targetHeroId > 0 && this.data.heros[targetHeroId]) {
                    // Case 1: Hero EXP book (single or Quick Upgrade in UpgradeView.js)
                    var ownedCnt = this.getItemAmount(itemId);
                    var useCnt = Math.min(ownedCnt > 0 ? ownedCnt : count, count);
                    this.changeItemAmount(itemId, -useCnt, queuePush);
                    var perExp = 60;
                    if (typeof Config !== "undefined" && Config.expItem && Config.expItem[itemId] && Config.expItem[itemId].add_exp) {
                        perExp = Number(Config.expItem[itemId].add_exp);
                    } else if (itCfg.add_hero_exp) {
                        perExp = Number(itCfg.add_hero_exp);
                    }
                    this.addHeroExp(targetHeroId, perExp * useCnt);
                    queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(targetHeroId) });
                } else if (iType === 2) {
                    // Case 2: Hero Soul (Hồn Ninja 20010..21060) -> Summon or Star-Up Ninja
                    var summonHeroId = Number(targetHeroId || itCfg.merge_id || itCfg.hero_id || 0);
                    var hExists = !!(summonHeroId > 0 && this.data.heros[summonHeroId]);
                    if (hExists) {
                        // Star-Up existing hero!
                        var hObj = this.data.heros[summonHeroId];
                        var curStar = Number(hObj.star || 1);
                        var nextStar = Math.min(5, curStar + 1);
                        var starCfg = (typeof Config !== "undefined" && Config.heroStar && Config.heroStar[nextStar]) ? Config.heroStar[nextStar] : null;
                        var needStarSoul = param2 > 0 ? param2 : (starCfg ? Number(starCfg.soul || 20) : 20);
                        var starGold = starCfg ? Number(starCfg.gold || 20000) : 20000;
                        if (!this.canDeductItem(itemId, needStarSoul)) {
                            return respond({}, { code: 1, msg: "Không đủ Hồn Ninja để nâng sao!" }), true;
                        }
                        if (!this.canDeductGold(starGold)) {
                            return respond({}, { code: 1, msg: "Không đủ Vàng để nâng sao!" }), true;
                        }
                        this.deductItem(itemId, needStarSoul, queuePush);
                        this.deductGold(starGold, queuePush);
                        hObj.star = nextStar;
                        queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(summonHeroId) });
                    } else {
                        // Summon new hero from shards!
                        var needSoul = param2 > 0 ? param2 : ((typeof Config !== "undefined" && Config.hero && Config.hero[summonHeroId]) ? Number(Config.hero[summonHeroId].sum_soul || 10) : 10);
                        var goldCost = (typeof Config !== "undefined" && Config.hero && Config.hero[summonHeroId]) ? Number(Config.hero[summonHeroId].sum_gold || 0) : 0;
                        if (!this.canDeductItem(itemId, needSoul)) {
                            return respond({}, { code: 1, msg: "Không đủ Hồn Ninja để chiêu mộ!" }), true;
                        }
                        this.deductItem(itemId, needSoul, queuePush);
                        if (goldCost > 0) {
                            this.deductGold(goldCost, queuePush);
                        }
                        if (summonHeroId > 0) {
                            this.addOrConvertHero(summonHeroId, queuePush);
                        }
                    }
                } else if (iType === 3) {
                    // Case 3: Ninjutsu Shard (Mảnh Thuật 30101..31705) -> Synthesize Ninjutsu Equip
                    var eqId = Number(itCfg.merge_id || itCfg.equip_id || 0);
                    var eqCfg = (typeof Config !== "undefined" && Config.equip && Config.equip[eqId]) ? Config.equip[eqId] : null;
                    var needChip = eqCfg ? Number(eqCfg.forge_amount || 5) : 5;
                    var goldCost2 = Number(itCfg.item_com_coin || (eqCfg && eqCfg.forge_coin) || 5000);
                    if (!this.canDeductItem(itemId, needChip)) {
                        return respond({}, { code: 1, msg: "Không đủ mảnh để ghép!" }), true;
                    }
                    this.deductItem(itemId, needChip, queuePush);
                    this.deductGold(goldCost2, queuePush);
                    if (eqId > 0) {
                        if (eqId >= 30000) {
                            this.addSecretEquip(eqId, 1, queuePush);
                        } else {
                            this.changeEquipAmount(eqId, 1, queuePush);
                        }
                    }
                } else if (iType === 12) {
                    // Case 4: Ninja Tool Chest (Rương Nhẫn Cụ 11010, 11020, 11021, 11030)
                    if (!this.canDeductItem(itemId, count)) {
                        return respond({}, { code: 1, msg: "Không đủ rương trong túi!" }), true;
                    }
                    this.deductItem(itemId, count, queuePush);
                    var boxId = Number(itCfg.merge_id || 52003);
                    var drops = this.rollBoxDrops(boxId, count);
                    for (var dri = 0; dri < drops.length; dri++) {
                        var dr = drops[dri];
                        var granted = this.grantBoxDropReward(dr, queuePush);
                        if (granted) outItems.push(granted);
                    }
                } else {
                    // Consumable / Resource pack
                    if (!this.canDeductItem(itemId, count)) {
                        return respond({}, { code: 1, msg: "Không đủ vật phẩm trong túi!" }), true;
                    }
                    this.deductItem(itemId, count, queuePush);
                    var goldAdd = Number(itCfg.add_gold || itCfg.sell_price || 0) * count;
                    var stoneAdd = Number(itCfg.add_stone || 0) * count;
                    var spAdd = Number(itCfg.add_sp || 0) * count;
                    if (goldAdd > 0) {
                        this.addGold(goldAdd, queuePush);
                        outItems.push({ type: 3, item_id: 0, amount: goldAdd });
                    }
                    if (stoneAdd > 0) {
                        this.addStone(stoneAdd, queuePush);
                        outItems.push({ type: 4, item_id: 0, amount: stoneAdd });
                    }
                    if (spAdd > 0) {
                        this.addSp(spAdd, queuePush);
                        outItems.push({ type: 5, item_id: 0, amount: spAdd });
                    }
                }
            }
            respond({ success: 1, status: 1, use_item_id: itemId, items: outItems });
            return true;
        }

        if (cmd === SVRCMD.SellManyItems) {
            var idListStr = String((params && params[0]) || "");
            var idArr = idListStr.split(",");
            var totalGoldAdd = 0;
            for (var si = 0; si < idArr.length; si++) {
                var sItemId = Number(idArr[si]);
                if (sItemId > 0) {
                    var curAmt = this.getItemAmount(sItemId);
                    if (curAmt > 0) {
                        var sCfg = (typeof Config !== "undefined" && Config.item && Config.item[sItemId]) ? Config.item[sItemId] : null;
                        var unitPrice = sCfg ? Number(sCfg.sell_price || 100) : 100;
                        totalGoldAdd += unitPrice * curAmt;
                        this.deductItem(sItemId, curAmt, queuePush);
                    }
                }
            }
            if (totalGoldAdd > 0) {
                this.addGold(totalGoldAdd, queuePush);
            }
            respond({});
            return true;
        }

        if (cmd === SVRCMD.SellItem || cmd === SVRCMD.SellEquip) {
            var sellId = Number((params && params[0]) || 0);
            var sellCnt = Math.max(1, Number((params && params[1]) || 1));
            var sellType = Number((params && params[2]) || (cmd === SVRCMD.SellEquip ? 2 : 1));
            var sellGold = 5000 * sellCnt;
            if (sellType === 2) {
                if (!this.canDeductEquip(sellId, sellCnt)) {
                    return respond({}, { code: 1, msg: "Không đủ trang bị để bán!" }), true;
                }
                var eCfg = (typeof Config !== "undefined" && Config.equip && Config.equip[sellId]) ? Config.equip[sellId] : null;
                if (eCfg && eCfg.sell_price) sellGold = Number(eCfg.sell_price) * sellCnt;
                this.deductEquip(sellId, sellCnt, queuePush);
            } else {
                if (!this.canDeductItem(sellId, sellCnt)) {
                    return respond({}, { code: 1, msg: "Không đủ vật phẩm để bán!" }), true;
                }
                var iCfg = (typeof Config !== "undefined" && Config.item && Config.item[sellId]) ? Config.item[sellId] : null;
                if (iCfg && iCfg.sell_price) sellGold = Number(iCfg.sell_price) * sellCnt;
                this.deductItem(sellId, sellCnt, queuePush);
            }
            this.addGold(sellGold, queuePush);
            respond({ status: 1, gold: this.data.gold });
            return true;
        }

        // Tailed Beasts ("Vĩ Thú Giải Ấn" - TailsUpgrade.js)
        if (cmd === SVRCMD.BeastInfo) {
            respond({ Beasts: this.data.beasts || {} });
            return true;
        }
        if (cmd === SVRCMD.UnlockBreast) {
            var heroId = Number((params && params[0]) || 0);
            if (!this.data.beasts[heroId]) this.data.beasts[heroId] = [];
            var curList = this.data.beasts[heroId];
            var nextIdx = curList.length;
            if (nextIdx < 9) {
                var beastId = 30001 + nextIdx;
                var needSouls = [10, 20, 30, 50, 80, 120, 170, 230, 300];
                if (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.BEAST_UNLOCK_NEED_SOUL) {
                    needSouls = String(ConfigGlobalVar.BEAST_UNLOCK_NEED_SOUL).split(",");
                }
                var costSoul = Number(needSouls[nextIdx] || 10);
                var soulId = this.findSoulItemId(heroId);
                if (this.getItemAmount(soulId) >= costSoul) {
                    this.deductItem(soulId, costSoul, queuePush);
                }
                curList.push({
                    hero_id: heroId,
                    beast_id: beastId,
                    lv: 1,
                    exp: 0
                });
                if (this.data.heros[heroId]) {
                    queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
                }
            }
            respond({ Beasts: this.data.beasts });
            return true;
        }

        if (cmd === SVRCMD.UpgradeBeastByEquip) {
            var heroId = Number((params && params[0]) || 0);
            var beastId = Number((params && params[1]) || 30001);
            var useEquips = (params && params[2]) || {};
            var useSouls = (params && params[3]) || {};
            var totalExp = 0;
            var totalSoulsAbsorbed = 0;

            for (var sid in useSouls) {
                var scnt = Number(useSouls[sid] || 0);
                if (scnt > 0 && !this.canDeductItem(Number(sid), scnt)) {
                    return respond({}, { code: 1, msg: "Không đủ Hồn Ninja để nuốt!" }), true;
                }
            }
            for (var eid in useEquips) {
                var ecnt = Number(useEquips[eid] || 0);
                if (ecnt > 0) {
                    if (!this.canDeductEquip(Number(eid), ecnt)) {
                        return respond({}, { code: 1, msg: "Không đủ trang bị trong túi!" }), true;
                    }
                    var eqCfg = (typeof Config !== "undefined" && Config.equip && Config.equip[eid]) ? Config.equip[eid] : null;
                    var perExp = eqCfg ? Number(eqCfg.add_weishou_exp || eqCfg.forge_coin || 10) : 10;
                    totalExp += perExp * ecnt;
                }
            }

            var goldPerExp = (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.BEAST_USE_EQUIP_EXP) ? Number(ConfigGlobalVar.BEAST_USE_EQUIP_EXP) : 10;
            var goldCost = totalExp * goldPerExp;
            if (goldCost > 0 && !this.canDeductGold(goldCost)) {
                return respond({}, { code: 1, msg: "Không đủ Vàng để nâng cấp Vĩ Thú!" }), true;
            }

            for (var sid in useSouls) {
                var scnt = Number(useSouls[sid] || 0);
                if (scnt > 0) {
                    this.deductItem(Number(sid), scnt, queuePush);
                    totalSoulsAbsorbed += scnt;
                }
            }
            for (var eid in useEquips) {
                var ecnt = Number(useEquips[eid] || 0);
                if (ecnt > 0) {
                    this.deductEquip(Number(eid), ecnt, queuePush);
                }
            }
            if (goldCost > 0) {
                this.deductGold(goldCost, queuePush);
            }

            if (!this.data.beasts) this.data.beasts = {};
            if (!this.data.beasts[heroId]) this.data.beasts[heroId] = [];

            var updatedBeast = null;
            for (var bi = 0; bi < this.data.beasts[heroId].length; bi++) {
                if (this.data.beasts[heroId][bi].beast_id == beastId) {
                    updatedBeast = this.data.beasts[heroId][bi];
                    break;
                }
            }
            if (!updatedBeast) {
                updatedBeast = { hero_id: heroId, beast_id: beastId, lv: 1, exp: 0, soul_absorbed: 0 };
                this.data.beasts[heroId].push(updatedBeast);
            }

            var lv = Number(updatedBeast.lv || 1);
            var exp = Number(updatedBeast.exp || 0) + totalExp;
            if (typeof Config !== "undefined" && Config.beast && Config.beast[beastId]) {
                while (lv < 10 && Config.beast[beastId][lv] && Config.beast[beastId][lv].upg_exp > 0 && exp >= Config.beast[beastId][lv].upg_exp) {
                    exp -= Config.beast[beastId][lv].upg_exp;
                    lv++;
                }
                if (lv >= 10 && Config.beast[beastId][10]) exp = 0;
            }
            updatedBeast.lv = lv;
            updatedBeast.exp = exp;
            updatedBeast.hero_id = heroId;

            updatedBeast.soul_absorbed = Number(updatedBeast.soul_absorbed || 0) + totalSoulsAbsorbed;
            var sa = updatedBeast.soul_absorbed;
            updatedBeast.soul_bonus = {
                hp: sa * 10,
                atk: sa * 1,
                mp: sa * 1,
                def: sa * 1,
                mp_def: sa * 1
            };

            queuePush(SVRCMD.Beast, { beast: updatedBeast });
            if (this.data.heros && this.data.heros[heroId]) {
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            respond({ beast: updatedBeast });
            return true;
        }

        if (cmd === SVRCMD.UpgradeBeastByStone) {
            var heroId = Number((params && params[0]) || 0);
            var beastId = Number((params && params[1]) || 30001);
            var stoneCost = (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.BEAST_PER_STONE) ? Number(ConfigGlobalVar.BEAST_PER_STONE) : 20;
            var expGain = (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.BEAST_PER_STONE_EXP) ? Number(ConfigGlobalVar.BEAST_PER_STONE_EXP) : 20;
            if (!this.canDeductStone(stoneCost)) {
                return respond({}, { code: 1, msg: "Không đủ Kim Cương!" }), true;
            }
            this.deductStone(stoneCost, queuePush);
            this.data.daily_counts["BEAST_STONE_EXP"] = Number(this.data.daily_counts["BEAST_STONE_EXP"] || 0) + expGain;

            var updatedBeast2 = { beast_id: beastId, lv: 1, exp: 0 };
            if (this.data.beasts[heroId]) {
                for (var bi2 = 0; bi2 < this.data.beasts[heroId].length; bi2++) {
                    var b2 = this.data.beasts[heroId][bi2];
                    if (b2.beast_id == beastId) {
                        var lv2 = Number(b2.lv || 1);
                        var exp2 = Number(b2.exp || 0) + expGain;
                        if (typeof Config !== "undefined" && Config.beast && Config.beast[beastId]) {
                            while (lv2 < 10 && Config.beast[beastId][lv2] && Config.beast[beastId][lv2].upg_exp > 0 && exp2 >= Config.beast[beastId][lv2].upg_exp) {
                                exp2 -= Config.beast[beastId][lv2].upg_exp;
                                lv2++;
                            }
                            if (lv2 >= 10 && Config.beast[beastId][10]) {
                                exp2 = 0;
                            }
                        }
                        b2.lv = lv2;
                        b2.exp = exp2;
                        updatedBeast2 = b2;
                        queuePush(SVRCMD.Beast, { beast: b2 });
                        break;
                    }
                }
            }
            if (this.data.heros[heroId]) {
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            respond({ beast: updatedBeast2 });
            return true;
        }

        // Ninja Academy ("Học Viện Ninja" - SchoolView.js, TrainView.js, InlayView.js, CompoundView.js) & Ninja Tools / Gems
        if (cmd === SVRCMD.PlayerSchoolInfo) {
            if (!this.data.player_school || !this.data.player_school.school_1) {
                this.data.player_school = {
                    school_1: 1101,
                    school_2: 0,
                    school_2_expire_time: 0,
                    school_3: 0,
                    school_3_expire_time: 0,
                    school_4: 0,
                    school_4_expire_time: 0,
                    school_5: 0,
                    school_5_expire_time: 0
                };
            }
            respond({ playerSchool: this.data.player_school });
            return true;
        }
        if (cmd === SVRCMD.CompleteSchoolWithoutFight || cmd === SVRCMD.SchoolSweep || cmd === SVRCMD.AfterSchoolFight) {
            var slot = Number((params && params[0]) || 1);
            var nowSec = Math.floor(Date.now() / 1000);
            if (!this.data.player_school) {
                this.data.player_school = {
                    school_1: 1101,
                    school_2: 0,
                    school_2_expire_time: 0,
                    school_3: 0,
                    school_3_expire_time: 0,
                    school_4: 0,
                    school_4_expire_time: 0,
                    school_5: 0,
                    school_5_expire_time: 0
                };
            }
            if (slot >= 1 && slot < 5) {
                var nextSlot = slot + 1;
                this.data.player_school["school_" + nextSlot] = 1000 + nextSlot * 100 + 1;
                this.data.player_school["school_" + nextSlot + "_expire_time"] = nowSec + 3600;
            }
            var goldCost = slot * 2500;
            if (!this.canDeductGold(goldCost)) {
                return respond({}, { code: 1, msg: "Không đủ Vàng!" }), true;
            }
            this.deductGold(goldCost, queuePush);

            var dropItemId = 50010;
            var dropType = 1;
            if (slot >= 3) {
                dropItemId = 30101 + Math.floor(Math.random() * 8);
                dropType = 2;
                this.addSecretEquip(dropItemId, 1, queuePush);
            } else {
                this.changeItemAmount(dropItemId, 1, queuePush);
            }
            this.save();
            respond({
                playerSchool: this.data.player_school,
                items: [{ box_id: 96000 + slot * 100 + 1, type: dropType, item_id: dropItemId, amount: 1 }]
            });
            return true;
        }

        if (cmd === SVRCMD.WearSecret || cmd === SVRCMD.WearGem) {
            if (params && params[0] === 'swap') {
                var heroA = Number(params[1]);
                var heroB = Number(params[2]);
                var reqId = String(params[3] || "");
                if (this.data.secrets) {
                    for (var si = 0; si < this.data.secrets.length; si++) {
                        var sObj = this.data.secrets[si];
                        var sPos = Number(sObj.pos || 0);
                        if (sPos >= 1 && sPos <= 6 && Number(sObj.status) === 1) {
                            if (Number(sObj.hero_id) === heroA) {
                                sObj.hero_id = heroB;
                                queuePush(SVRCMD.Secret, { secret: sObj });
                            } else if (Number(sObj.hero_id) === heroB) {
                                sObj.hero_id = heroA;
                                queuePush(SVRCMD.Secret, { secret: sObj });
                            }
                        }
                    }
                }
                if (heroA > 0) queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroA) });
                if (heroB > 0) queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroB) });
                this.save();
                respond({ swap_id: reqId, from: heroA, to: heroB, replayed: false });
                return true;
            }

            var heroId = Number((params && params[0]) || 0);
            var pos = Number((params && params[1]) || 1);
            var secretId = Number((params && params[2]) || 0);

            if (this.data.secrets) {
                for (var si = 0; si < this.data.secrets.length; si++) {
                    var sec = this.data.secrets[si];
                    if (Number(sec.hero_id) === heroId && Number(sec.pos) === pos && sec.id != secretId) {
                        sec.hero_id = 0;
                        sec.pos = 0;
                        sec.status = 0;
                        queuePush(SVRCMD.Secret, { secret: sec });
                    }
                }
                for (var sj = 0; sj < this.data.secrets.length; sj++) {
                    var sec2 = this.data.secrets[sj];
                    if (sec2.id == secretId) {
                        sec2.hero_id = heroId;
                        sec2.pos = pos;
                        sec2.status = 1;
                        queuePush(SVRCMD.Secret, { secret: sec2 });
                        break;
                    }
                }
            }
            if (heroId > 0 && this.data.heros && this.data.heros[heroId]) {
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            this.save();
            respond({ status: 1 });
            return true;
        }

        if (cmd === SVRCMD.UnWearSecret || cmd === SVRCMD.UnWearGem) {
            var secretId = Number((params && params[0]) || 0);
            var affectedHeroId = 0;
            if (this.data.secrets) {
                for (var si = 0; si < this.data.secrets.length; si++) {
                    var sec = this.data.secrets[si];
                    if (sec.id == secretId) {
                        affectedHeroId = Number(sec.hero_id || 0);
                        sec.hero_id = 0;
                        sec.pos = 0;
                        sec.status = 0;
                        queuePush(SVRCMD.Secret, { secret: sec });
                        break;
                    }
                }
            }
            if (affectedHeroId > 0 && this.data.heros && this.data.heros[affectedHeroId]) {
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(affectedHeroId) });
            }
            this.save();
            respond({ status: 1 });
            return true;
        }

        if (cmd === SVRCMD.UpgradeSecret) {
            var targetId = Number((params && params[0]) || 0);
            var matStr = String((params && params[1]) || "");
            var matIds = matStr.split(",");
            var targetSec = null;
            for (var si = 0; si < this.data.secrets.length; si++) {
                if (this.data.secrets[si].id == targetId) {
                    targetSec = this.data.secrets[si];
                    break;
                }
            }
            if (targetSec) {
                var expAdd = 0;
                for (var mi = 0; mi < matIds.length; mi++) {
                    var mid = Number(matIds[mi]);
                    if (!mid) continue;
                    for (var sj = this.data.secrets.length - 1; sj >= 0; sj--) {
                        if (this.data.secrets[sj].id == mid) {
                            var mSec = this.data.secrets[sj];
                            var eqCfg = (typeof Config !== "undefined" && Config.equip && Config.equip[mSec.equip_id]) ? Config.equip[mSec.equip_id] : null;
                            expAdd += (eqCfg ? Number(eqCfg.forge_coin || 50) : 50) + Number(mSec.exp || 0);
                            this.data.secrets.splice(sj, 1);
                            queuePush(SVRCMD.DeleteSecret, { secret: mid });
                            break;
                        }
                    }
                }
                var tCfg = (typeof Config !== "undefined" && Config.equip && Config.equip[targetSec.equip_id]) ? Config.equip[targetSec.equip_id] : null;
                var q = tCfg ? Number(tCfg.quality || 1) : 1;
                var lv = Number(targetSec.lv || 1);
                var exp = Number(targetSec.exp || 0) + expAdd;
                if (typeof Config !== "undefined" && Config.equip_level) {
                    while (Config.equip_level[lv] && Config.equip_level[lv][q] && Config.equip_level[lv][q].exp > 0 && exp >= Config.equip_level[lv][q].exp) {
                        exp -= Config.equip_level[lv][q].exp;
                        lv++;
                    }
                } else {
                    lv += 1;
                }
                targetSec.lv = lv;
                targetSec.exp = exp;
                queuePush(SVRCMD.Secret, { secret: targetSec });
                if (targetSec.hero_id > 0 && this.data.heros[targetSec.hero_id]) {
                    queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(targetSec.hero_id) });
                }
            }
            respond({ status: 1 });
            return true;
        }

        if (cmd === SVRCMD.UpgradeGem) {
            var gemEquipId = Number((params && params[0]) || 0);
            var upgType = Number((params && params[1]) || 0);
            var gCfg = (typeof Config !== "undefined" && Config.equip && Config.equip[gemEquipId]) ? Config.equip[gemEquipId] : null;
            var nextGemId = Number((gCfg && (gCfg.forge_id || gCfg.target_item)) || ((gemEquipId % 100 < 10) ? (gemEquipId + 1) : 0));
            if (nextGemId > 0) {
                var needAmt = Math.max(1, Number((gCfg && gCfg.forge_amount) || 4));
                var matchingIdxs = [];
                for (var gi = this.data.secrets.length - 1; gi >= 0; gi--) {
                    if (Number(this.data.secrets[gi].equip_id) === gemEquipId && Number(this.data.secrets[gi].status) === 0) {
                        matchingIdxs.push(gi);
                    }
                }
                var craftCount = (upgType === 1) ? Math.floor(matchingIdxs.length / needAmt) : (matchingIdxs.length >= needAmt ? 1 : 0);
                if (craftCount > 0) {
                    var toRemove = craftCount * needAmt;
                    var costCoin = Number((gCfg && gCfg.forge_coin) || 10000) * craftCount;
                    var costItemId = Number((gCfg && gCfg.forge_item_id) || 0);
                    var costItemAmt = Number((gCfg && gCfg.forge_item_amount) || 0) * craftCount;
                    if (costCoin > 0 && !this.canDeductGold(costCoin)) {
                        return respond({}, { code: 1, msg: "Không đủ Vàng để ghép Ngọc!" }), true;
                    }
                    if (costCoin > 0) {
                        this.deductGold(costCoin, queuePush);
                    }
                    if (costItemId > 0 && costItemAmt > 0 && this.getItemAmount(costItemId) >= costItemAmt) {
                        this.deductItem(costItemId, costItemAmt, queuePush);
                    }
                    for (var r = 0; r < toRemove; r++) {
                        var remIdx = matchingIdxs[r];
                        var remSec = this.data.secrets[remIdx];
                        this.data.secrets.splice(remIdx, 1);
                        queuePush(SVRCMD.DeleteSecret, { secret: remSec.id });
                    }
                    for (var c = 0; c < craftCount; c++) {
                        var nSecId = (this.data.next_secret_id || 10) + 1;
                        this.data.next_secret_id = nSecId;
                        var nSec = { id: nSecId, lv: 1, exp: 0, pos: 0, status: 0, hero_id: 0, equip_id: nextGemId };
                        this.data.secrets.push(nSec);
                        queuePush(SVRCMD.Secret, { secret: nSec });
                    }
                    this.save();
                }
            }
            respond({ status: 1 });
            return true;
        }

        if (cmd === SVRCMD.WearNinjaTool) {
            var heroId = Number((params && params[0]) || 0);
            var slotType = Number((params && params[1]) || 1);
            var toolId = Number((params && params[2]) || 0);
            if (this.data.heros[heroId] && slotType >= 1 && slotType <= 6 && toolId > 0) {
                var h = this.data.heros[heroId];
                var prevTool = Number(h["ninja_tool_" + slotType] || 0);
                if (prevTool > 0) {
                    this.changeNinjaToolAmount(prevTool, 1, queuePush);
                }
                this.changeNinjaToolAmount(toolId, -1, queuePush);
                h["ninja_tool_" + slotType] = toolId;
                queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
            }
            respond({});
            return true;
        }

        if (cmd === SVRCMD.UnWearNinjaTool) {
            var heroId = Number((params && params[0]) || 0);
            var slotType = Number((params && params[1]) || 1);
            var updatedToolObj = null;
            if (this.data.heros[heroId] && slotType >= 1 && slotType <= 6) {
                var h = this.data.heros[heroId];
                var prevTool = Number(h["ninja_tool_" + slotType] || 0);
                if (prevTool > 0) {
                    h["ninja_tool_" + slotType] = 0;
                    var newAmt = this.changeNinjaToolAmount(prevTool, 1, queuePush);
                    updatedToolObj = { ninja_tool_id: prevTool, amount: newAmt };
                    queuePush(SVRCMD.Hero, { hero: this.computeHeroPayload(heroId) });
                }
            }
            respond({ ninja_tool: updatedToolObj });
            return true;
        }

        if (cmd === SVRCMD.UpgradeNinjaTool) {
            var baseToolId = Number((params && params[0]) || 0);
            var matStr = String((params && params[1]) || "");
            var ntCfg = (typeof Config !== "undefined" && Config.ninja_tool && Config.ninja_tool[baseToolId]) ? Config.ninja_tool[baseToolId] : null;
            var outItems = [];
            var targetToolId = ntCfg ? Number(ntCfg.target_item || 0) : 0;
            if (targetToolId > 0) {
                this.changeNinjaToolAmount(baseToolId, -1, queuePush);
                var mats = matStr.split(",");
                for (var mi = 0; mi < mats.length; mi++) {
                    var mId = Number(mats[mi]);
                    if (mId > 0) {
                        this.changeNinjaToolAmount(mId, -1, queuePush);
                    }
                }
                if (ntCfg.forge_item && ntCfg.forge_item != "0") {
                    var forgeItemParts = String(ntCfg.forge_item).split(";");
                    for (var fi = 0; fi < forgeItemParts.length; fi++) {
                        var p = forgeItemParts[fi].split(",");
                        if (p.length >= 2) {
                            var fItemId = Number(p[0]);
                            var fItemAmt = Number(p[1]);
                            if (fItemId > 0 && fItemAmt > 0) {
                                this.changeItemAmount(fItemId, -fItemAmt, queuePush);
                            }
                        }
                    }
                }
                if (ntCfg.forge_coin > 0) {
                    this.deductGold(Number(ntCfg.forge_coin), queuePush);
                }
                if (ntCfg.forge_stone > 0) {
                    this.deductStone(Number(ntCfg.forge_stone), queuePush);
                }

                this.changeNinjaToolAmount(targetToolId, 1, queuePush);
                outItems.push({ type: 13, item_id: targetToolId, amount: 1 });
            }
            respond({ items: outItems });
            return true;
        }

        return false;
    }
};

module.exports = HeroHandler;
