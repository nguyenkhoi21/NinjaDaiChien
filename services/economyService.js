/**
 * Economy & Resource Service
 * Handle trừ vàng, trừ thể lực, trừ kim cương, tiền tệ các shop, thêm/trừ item, trang bị, tướng, bí tịch, nhẫn cụ, EXP.
 */

const { getOrAssignUid } = require('../db/database');

const EconomyService = {
    getNumericId: function() {
        if (this.data && this.data.uid) return Number(this.data.uid);
        return getOrAssignUid((this.data && this.data.player_id) || "1", this.data);
    },

    // ================= 1. HANDLE VÀNG (GOLD) =================
    canDeductGold: function(cost) {
        return Number(this.data.gold || 0) >= Number(cost || 0);
    },

    deductGold: function(cost, queuePush) {
        cost = Math.max(0, Number(cost || 0));
        if (!this.canDeductGold(cost)) return false;
        this.data.gold = Number(this.data.gold || 0) - cost;
        if (!this.data.event_process) this.data.event_process = {};
        this.data.event_process[6] = Number(this.data.event_process[6] || 0) + cost;
        if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        return true;
    },

    addGold: function(amount, queuePush) {
        amount = Math.max(0, Number(amount || 0));
        if (amount <= 0) return Number(this.data.gold || 0);
        this.data.gold = Number(this.data.gold || 0) + amount;
        if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        return this.data.gold;
    },

    // ================= 2. HANDLE KIM CƯƠNG (STONE / DIAMOND) =================
    canDeductStone: function(cost) {
        return Number(this.data.stone || 0) >= Number(cost || 0);
    },

    deductStone: function(cost, queuePush) {
        cost = Math.max(0, Number(cost || 0));
        if (!this.canDeductStone(cost)) return false;
        this.data.stone = Number(this.data.stone || 0) - cost;
        if (!this.data.event_process) this.data.event_process = {};
        this.data.event_process[5] = Number(this.data.event_process[5] || 0) + cost;
        if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        return true;
    },

    addStone: function(amount, queuePush) {
        amount = Math.max(0, Number(amount || 0));
        if (amount <= 0) return Number(this.data.stone || 0);
        this.data.stone = Number(this.data.stone || 0) + amount;
        if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        return this.data.stone;
    },

    // ================= 3. HANDLE THỂ LỰC (SP / STAMINA) =================
    canDeductSp: function(cost) {
        return Number(this.data.sp || 0) >= Number(cost || 0);
    },

    deductSp: function(cost, queuePush) {
        cost = Math.max(0, Number(cost || 0));
        if (!this.canDeductSp(cost)) return false;
        this.data.sp = Number(this.data.sp || 0) - cost;
        if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        return true;
    },

    addSp: function(amount, queuePush) {
        amount = Math.max(0, Number(amount || 0));
        if (amount <= 0) return Number(this.data.sp || 0);
        this.data.sp = Number(this.data.sp || 0) + amount;
        if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        return this.data.sp;
    },

    // ================= 4. HANDLE TIỀN TỆ CÁC SHOP (ARENA, WAR, GUILD, SHADOW) =================
    // Mapping theo ConfigGoods / ShopPriceType trên Client:
    // 1: Vàng (gold), 2: Kim cương (stone), 10: Điểm Đấu trường (arena_point),
    // 11: Điểm Viễn chinh (ninja_point), 12: Cống hiến Bang (group_point),
    // 13: Điểm Ám bộ / Lôi đài (dark_arena_point), 14: CS Shadow (cs_dark_arena_point),
    // 15: CS Guild (cs_group_point), 50: Thể lực (sp)
    getCurrencyField: function(priceType) {
        const pt = Number(priceType || 1);
        if (pt === 1) return 'gold';
        if (pt === 2) return 'stone';
        if (pt === 10) return 'arena_point';
        if (pt === 11) return 'ninja_point';
        if (pt === 12) return 'group_point';
        if (pt === 13) return 'dark_arena_point';
        if (pt === 14) return 'cs_dark_arena_point';
        if (pt === 15) return 'cs_group_point';
        if (pt === 50) return 'sp';
        return 'gold';
    },

    canDeductCurrency: function(priceType, cost) {
        cost = Math.max(0, Number(cost || 0));
        const pt = Number(priceType || 1);
        if (pt === 1) return this.canDeductGold(cost);
        if (pt === 2) return this.canDeductStone(cost);
        if (pt === 50) return this.canDeductSp(cost);
        const field = this.getCurrencyField(pt);
        return Number(this.data[field] || 0) >= cost;
    },

    deductCurrency: function(priceType, cost, queuePush) {
        cost = Math.max(0, Number(cost || 0));
        const pt = Number(priceType || 1);
        if (pt === 1) return this.deductGold(cost, queuePush);
        if (pt === 2) return this.deductStone(cost, queuePush);
        if (pt === 50) return this.deductSp(cost, queuePush);
        if (!this.canDeductCurrency(pt, cost)) return false;
        const field = this.getCurrencyField(pt);
        this.data[field] = Math.max(0, Number(this.data[field] || 0) - cost);
        if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        return true;
    },

    addCurrency: function(priceType, amount, queuePush) {
        amount = Math.max(0, Number(amount || 0));
        const pt = Number(priceType || 1);
        if (pt === 1) return this.addGold(amount, queuePush);
        if (pt === 2) return this.addStone(amount, queuePush);
        if (pt === 50) return this.addSp(amount, queuePush);
        const field = this.getCurrencyField(pt);
        this.data[field] = Number(this.data[field] || 0) + amount;
        if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
        return this.data[field];
    },

    // ================= 5. HANDLE ITEM, MẢNH TƯỚNG, MẢNH TRANG BỊ =================
    getItemAmount: function(itemId) {
        itemId = Number(itemId);
        if (!this.data || !this.data.items) return 0;
        const entry = this.data.items[itemId];
        if (!entry) return 0;
        return typeof entry === 'object' ? Number(entry.amount || 0) : Number(entry || 0);
    },

    canDeductItem: function(itemId, amount) {
        return this.getItemAmount(itemId) >= Number(amount || 0);
    },

    deductItem: function(itemId, amount, queuePush) {
        amount = Math.max(0, Number(amount || 0));
        if (!this.canDeductItem(itemId, amount)) return false;
        this.changeItemAmount(itemId, -amount, queuePush);
        return true;
    },

    changeItemAmount: function(itemId, delta, queuePush) {
        itemId = Number(itemId);
        delta = Number(delta || 0);
        if (!this.data.items) this.data.items = {};
        const cur = this.getItemAmount(itemId);
        const next = Math.max(0, cur + delta);
        if (next > 0) {
            this.data.items[itemId] = { item_id: itemId, amount: next };
        } else {
            delete this.data.items[itemId];
        }
        if (queuePush) {
            queuePush(SVRCMD.Item, { item: { item_id: itemId, amount: next } });
        }
        return next;
    },

    // ================= 6. HANDLE TRANG BỊ, BÍ TỊCH, NGỌC & NHẪN CỤ =================
    getEquipAmount: function(equipId) {
        equipId = Number(equipId);
        if (!this.data || !this.data.equip) return 0;
        const entry = this.data.equip[equipId];
        if (!entry) return 0;
        return typeof entry === 'object' ? Number(entry.amount || 0) : Number(entry || 0);
    },

    canDeductEquip: function(equipId, amount) {
        return this.getEquipAmount(equipId) >= Number(amount || 0);
    },

    deductEquip: function(equipId, amount, queuePush) {
        amount = Math.max(0, Number(amount || 0));
        if (!this.canDeductEquip(equipId, amount)) return false;
        this.changeEquipAmount(equipId, -amount, queuePush);
        return true;
    },

    changeEquipAmount: function(equipId, delta, queuePush) {
        equipId = Number(equipId);
        delta = Number(delta || 0);
        if (!this.data.equip) this.data.equip = {};
        const cur = this.getEquipAmount(equipId);
        const next = Math.max(0, cur + delta);
        if (next > 0) {
            this.data.equip[equipId] = { equip_id: equipId, amount: next };
        } else {
            delete this.data.equip[equipId];
        }
        if (queuePush) {
            queuePush(SVRCMD.Equip, { equip: { equip_id: equipId, amount: next } });
        }
        if (typeof Config !== "undefined" && Config.equip && Config.equip[equipId] && Number(Config.equip[equipId].type) === 3) {
            this.syncGemsAndSecrets(queuePush);
        }
        return next;
    },

    getNinjaToolAmount: function(toolId) {
        toolId = Number(toolId);
        if (!this.data || !this.data.ninja_tools) return 0;
        const curObj = this.data.ninja_tools[toolId];
        if (!curObj) return 0;
        return Number(curObj.amount !== undefined ? curObj.amount : (curObj.count || 0)) || 0;
    },

    changeNinjaToolAmount: function(toolId, delta, queuePush) {
        toolId = Number(toolId);
        delta = Number(delta || 0);
        if (!this.data.ninja_tools) this.data.ninja_tools = {};
        const cur = this.getNinjaToolAmount(toolId);
        const next = Math.max(0, cur + delta);
        if (next > 0) {
            this.data.ninja_tools[toolId] = { ninja_tool_id: toolId, amount: next };
        } else {
            delete this.data.ninja_tools[toolId];
        }
        if (queuePush) {
            queuePush(SVRCMD.NinjaTool, { ninja_tool: { ninja_tool_id: toolId, amount: next } });
        }
        return next;
    },

    syncGemsAndSecrets: function(queuePush) {
        if (!this.data.secrets) this.data.secrets = [];
        if (!this.data.equip) this.data.equip = {};
        if (typeof Config === "undefined" || !Config.equip) return;
        for (const eqId in this.data.equip) {
            const eqNum = Number(eqId);
            const eqCfg = Config.equip[eqNum];
            if (eqCfg && Number(eqCfg.type) === 3) {
                const targetAmount = this.getEquipAmount(eqNum);
                const existing = [];
                for (let si = 0; si < this.data.secrets.length; si++) {
                    if (Number(this.data.secrets[si].equip_id) === eqNum && Number(this.data.secrets[si].status) === 0) {
                        existing.push(this.data.secrets[si]);
                    }
                }
                const diff = targetAmount - existing.length;
                if (diff > 0) {
                    for (let a = 0; a < diff; a++) {
                        const nId = (this.data.next_secret_id || 100) + 1;
                        this.data.next_secret_id = nId;
                        const secObj = { id: nId, lv: 1, exp: 0, pos: 0, status: 0, hero_id: 0, equip_id: eqNum };
                        this.data.secrets.push(secObj);
                        if (queuePush) queuePush(SVRCMD.Secret, { secret: secObj });
                    }
                } else if (diff < 0) {
                    let toRemove = -diff;
                    for (let r = this.data.secrets.length - 1; r >= 0 && toRemove > 0; r--) {
                        if (Number(this.data.secrets[r].equip_id) === eqNum && Number(this.data.secrets[r].status) === 0) {
                            const rem = this.data.secrets.splice(r, 1)[0];
                            toRemove--;
                            if (queuePush) queuePush(SVRCMD.DeleteSecret, { secret: rem.id });
                        }
                    }
                }
            }
        }
    },

    addSecretEquip: function(equipId, count, queuePush) {
        equipId = Number(equipId);
        count = Math.max(1, Number(count || 1));
        if (!this.data.secrets) this.data.secrets = [];
        for (let i = 0; i < count; i++) {
            const nId = (this.data.next_secret_id || 100) + 1;
            this.data.next_secret_id = nId;
            const secObj = {
                id: nId,
                lv: 1,
                exp: 0,
                pos: 0,
                status: 0,
                hero_id: 0,
                equip_id: equipId
            };
            this.data.secrets.push(secObj);
            if (queuePush) {
                queuePush(SVRCMD.Secret, { secret: secObj });
            }
        }
    },

    // ================= 7. HANDLE EXP, VIP & TƯỚNG =================
    addTeamExp: function(expAdd, queuePush) {
        expAdd = Number(expAdd || 0);
        if (expAdd <= 0) return;
        let lv = Number(this.data.team_lv || 1);
        let exp = Number(this.data.team_exp || 0) + expAdd;
        if (typeof Config !== "undefined" && Config.level) {
            while (Config.level[lv] && Config.level[lv].upg_exp > 0 && exp >= Config.level[lv].upg_exp) {
                exp -= Config.level[lv].upg_exp;
                lv++;
                const addSp = Number(Config.level[lv] ? (Config.level[lv].init_sp || Config.level[lv].Present_sp || 20) : 20);
                this.data.sp = Number(this.data.sp || 0) + addSp;
            }
        }
        this.data.team_lv = lv;
        this.data.team_exp = exp;
        if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
    },

    addVipExp: function(vipAdd, queuePush) {
        vipAdd = Number(vipAdd || 0);
        if (vipAdd <= 0) return;
        this.data.vip_exp = Number(this.data.vip_exp || 0) + vipAdd;
        let vLv = Number(this.data.vip_lv || 0);
        if (typeof Config !== "undefined" && Config.vipLevel) {
            for (const vk in Config.vipLevel) {
                const vCfg = Config.vipLevel[vk];
                if (vCfg && Number(vCfg.upg_vip_exp) >= 0 && this.data.vip_exp >= Number(vCfg.upg_vip_exp)) {
                    if (Number(vCfg.vip) > vLv) vLv = Number(vCfg.vip);
                }
            }
        }
        this.data.vip_lv = vLv;
        if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
    },

    addHeroExp: function(hid, expAdd) {
        hid = Number(hid);
        expAdd = Number(expAdd || 0);
        if (!this.data.heros[hid] || expAdd <= 0) return;
        const h = this.data.heros[hid];
        const maxLv = Math.max(Number(this.data.team_lv || 1), 1);
        let lv = Number(h.lv || 1);
        let exp = Number(h.exp || 0) + expAdd;
        if (typeof Config !== "undefined" && Config.heroLevel) {
            while (Config.heroLevel[lv] && Config.heroLevel[lv].upg_exp > 0 && exp >= Config.heroLevel[lv].upg_exp) {
                if (lv >= maxLv) {
                    exp = Config.heroLevel[lv].upg_exp;
                    break;
                }
                exp -= Config.heroLevel[lv].upg_exp;
                lv++;
            }
        }
        h.lv = lv;
        h.level = lv;
        h.exp = exp;
    },

    findSoulItemId: function(heroId) {
        heroId = Number(heroId);
        if (typeof Config !== "undefined" && Config.item) {
            for (const k in Config.item) {
                if (Number(Config.item[k].item_type) === 2 && Number(Config.item[k].merge_id) === heroId) {
                    return Number(k);
                }
            }
        }
        return 20000 + (heroId - 10000);
    },

    addOrConvertHero: function(hid, queuePush) {
        hid = Number(hid);
        if (!this.data.heros) this.data.heros = {};
        if (this.data.heros[hid]) {
            const soulId = this.findSoulItemId(hid);
            let soulNum = 18;
            if (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.HERO2SOUL) {
                soulNum = Number(ConfigGlobalVar.HERO2SOUL) || 18;
            }
            this.changeItemAmount(soulId, soulNum, queuePush);
            if (queuePush) {
                queuePush(SVRCMD.Hero2Soul, { heroId: hid });
            }
            return false;
        } else {
            this.data.heros[hid] = this.createDefaultHeroRecord(hid);
            const payload = this.computeHeroPayload(hid);
            if (queuePush) {
                queuePush(SVRCMD.Hero, { hero: payload });
            }
            return true;
        }
    },

    // ================= 8. REWARD DISPATCHERS =================
    /**
     * Grant reward theo chuẩn TaskReward (SignIn, DailyTaskAward, ReceiveAchievement):
     * 1: TYPE_ITEM, 2: TYPE_EQUIP, 3: TYPE_TEAM_EXP, 4: TYPE_GOLD, 5: TYPE_STONE,
     * 6: TYPE_SOUL, 7: TYPE_EQUIP_DEBRIS, 8: TYPE_SP, 9: TYPE_GROUP_COIN, 10: TYPE_VIP_EXP
     */
    grantTaskReward: function(itemType, itemId, amount, queuePush) {
        const rType = Number(itemType || 0);
        const rId = Number(itemId || 0);
        const amt = Number(amount || 0);
        if (rType <= 0 || amt <= 0) return;

        switch (rType) {
            case 1: // TYPE_ITEM
            case 6: // TYPE_SOUL
            case 7: // TYPE_EQUIP_DEBRIS
                if (rId > 0) this.changeItemAmount(rId, amt, queuePush);
                break;
            case 2: // TYPE_EQUIP
                if (rId >= 30000 && (!Config.equip[rId] || Number(Config.equip[rId].type) !== 3)) {
                    this.addSecretEquip(rId, amt, queuePush);
                } else if (rId > 0) {
                    this.changeEquipAmount(rId, amt, queuePush);
                }
                break;
            case 3: // TYPE_TEAM_EXP
                this.addTeamExp(amt, queuePush);
                break;
            case 4: // TYPE_GOLD
                this.addGold(amt, queuePush);
                break;
            case 5: // TYPE_STONE
                this.addStone(amt, queuePush);
                break;
            case 8: // TYPE_SP
                this.addSp(amt, queuePush);
                break;
            case 9: // TYPE_GROUP_COIN
                this.data.group_point = Number(this.data.group_point || 0) + amt;
                if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                break;
            case 10: // TYPE_VIP_EXP
                this.addVipExp(amt, queuePush);
                break;
            default:
                if (rId > 0) this.changeItemAmount(rId, amt, queuePush);
                break;
        }
    },

    /**
     * Grant reward theo chuẩn BOXDROPTYPE (BuyBox, Chapter Box, Shop Slot, Tower Box, Ninja Box):
     * 1: ITEM, 2: EQUIP, 3: HERO, 4: GOLD, 5: STONE, 6: SOUL, 7: CHIP,
     * 8: NINJA_POINT, 9: ARENA_POINT, 10: SP, 11: DARK_ARENA_POINT, 12: VIP_EXP, 13: NINJA_TOOL
     */
    grantBoxDropReward: function(dropObj, queuePush) {
        if (!dropObj) return null;
        const dType = Number(dropObj.type || 1);
        const dId = Number(dropObj.item_id || 0);
        const amt = Number(dropObj.amount || 1);
        if (amt <= 0) return null;

        switch (dType) {
            case 1: // BOXDROPTYPE_ITEM
            case 6: // BOXDROPTYPE_SOUL
            case 7: // BOXDROPTYPE_CHIP
                if (dId > 0) this.changeItemAmount(dId, amt, queuePush);
                break;
            case 2: // BOXDROPTYPE_EQUIP
                if (dId >= 30000 && (!Config.equip[dId] || Number(Config.equip[dId].type) !== 3)) {
                    this.addSecretEquip(dId, amt, queuePush);
                } else if (dId > 0) {
                    this.changeEquipAmount(dId, amt, queuePush);
                }
                break;
            case 3: // BOXDROPTYPE_HERO
                if (dId > 0) this.addOrConvertHero(dId, queuePush);
                break;
            case 4: // BOXDROPTYPE_GOLD
                this.addGold(amt, queuePush);
                break;
            case 5: // BOXDROPTYPE_STONE
                this.addStone(amt, queuePush);
                break;
            case 8: // BOXDROPTYPE_NINJAPOINT
                this.data.ninja_point = Number(this.data.ninja_point || 0) + amt;
                if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                break;
            case 9: // BOXDROPTYPE_ARENAPOINT
                this.data.arena_point = Number(this.data.arena_point || 0) + amt;
                if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                break;
            case 10: // BOXDROPTYPE_SP
                this.addSp(amt, queuePush);
                break;
            case 11: // BOXDROPTYPE_DARKARENAPOINT
                this.data.dark_arena_point = Number(this.data.dark_arena_point || 0) + amt;
                if (queuePush) queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
                break;
            case 12: // BOXDROPTYPE_VIPEXP
                this.addVipExp(amt, queuePush);
                break;
            case 13: // BOXDROPTYPE_NINJATOOL
                if (dId > 0) this.changeNinjaToolAmount(dId, amt, queuePush);
                break;
            default:
                if (dId > 0) this.changeItemAmount(dId, amt, queuePush);
                break;
        }
        return { type: dType, item_id: dId, amount: amt };
    }
};

module.exports = EconomyService;
