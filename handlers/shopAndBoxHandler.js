// ============================================================================
// HANDLER: TIỆM TẠP HÓA, CHỢ ĐEN, TIỆM ĐẤU TRƯỜNG/TRANH BÁ/BANG HỘI/BORUTO, QUAY RƯƠNG & MUA HÀNG
// (All Shops: ShopInfo, RefreshShop, BuyShopGoods, BuyGoods2, BuyBox, SoulShop, GoodsInfo, CreateOrder)
// ============================================================================

const ShopAndBoxHandler = {
    generateShopData: function(shopType) {
        shopType = Number(shopType || 1);
        var infoObj = {};
        var discObj = {};
        if (typeof Config !== "undefined" && Config.shop && Config.box_drop) {
            var matched = [];
            for (var sid in Config.shop) {
                var sCfg = Config.shop[sid];
                if (Number(sCfg.shop_type || sCfg.type) === shopType) {
                    matched.push(sCfg);
                }
            }
            matched.sort(function(a, b) { return Number(a.id) - Number(b.id); });
            if (matched.length === 0) {
                for (var sid2 in Config.shop) {
                    matched.push(Config.shop[sid2]);
                    if (matched.length >= 12) break;
                }
            }
            for (var mi = 0; mi < matched.length; mi++) {
                var sc = matched[mi];
                var grp = Config.box_drop[sc.box_id];
                if (grp) {
                    var bKeys = Object.keys(grp);
                    if (bKeys.length > 0) {
                        var pickKey = bKeys[Math.floor(Math.random() * bKeys.length)];
                        var keyStr = sc.id + "_" + pickKey;
                        infoObj[keyStr] = 1;
                    }
                }
            }
        }
        return { info: infoObj, discount_info: discObj };
    },

    rollBoxDrops: function(groupId, count) {
        var results = [];
        var pool = [];
        if (typeof Config !== "undefined" && Config.box_drop && Config.box_drop[groupId]) {
            var grp = Config.box_drop[groupId];
            for (var k in grp) {
                pool.push(grp[k]);
            }
        }
        if (pool.length === 0 && typeof Config !== "undefined" && Config.item) {
            for (var id in Config.item) {
                var it = Config.item[id];
                if (it.item_type == 3 || it.item_type == 4) {
                    pool.push({ type: (it.item_type == 3 ? 6 : 7), item_id: Number(id), amount: 2 });
                }
            }
        }
        for (var i = 0; i < count; i++) {
            if (pool.length > 0) {
                var pick = pool[Math.floor(Math.random() * pool.length)];
                var dType = Number(pick.type || 1);
                if (dType === 3 && Math.random() > 0.12) {
                    var soulId = this.findSoulItemId(pick.item_id);
                    results.push({ type: 6, item_id: soulId, amount: 3 });
                } else {
                    results.push({
                        type: dType,
                        item_id: Number(pick.item_id),
                        amount: Number(pick.amount || 1)
                    });
                }
            } else {
                results.push({ type: 6, item_id: 30002, amount: 2 });
            }
        }
        return results;
    },

    handleShopAndBoxCommand: function(cmd, params, respond, queuePush) {
        var self = this;

        if (cmd === SVRCMD.BuyBox) {
            var boxTag = Number((params && params[0]) || 1);
            var count = Number((params && params[1]) || 1);
            var nowSec = Math.floor(Date.now() / 1000);
            var items = [];

            if (boxTag === 1) {
                // Bronze Box (Gold)
                var isTutorialFirstBronze = (!this.data.heros[10020] && (this.data.bronze_count === 0 || this.data.guide_step <= 3));
                var isFreeBronze = (this.data.bronze_count < 5 && (nowSec - Number(this.data.bronze_time || 0) >= 600));
                var bronzeBoxId = (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.NORMAL_BRONZE_ID) ? Number(ConfigGlobalVar.NORMAL_BRONZE_ID) : 101;
                var price1 = (typeof Config !== "undefined" && Config.box && Config.box[bronzeBoxId]) ? Number(Config.box[bronzeBoxId].open_price || 10000) : 10000;

                if (count === 1 && isFreeBronze) {
                    this.data.bronze_count = Number(this.data.bronze_count || 0) + 1;
                    this.data.bronze_time = nowSec;
                } else {
                    var totalGold = (count === 10) ? Math.floor(price1 * 10 * 0.9) : price1 * count;
                    if (!this.canDeductGold(totalGold)) {
                        return respond({}, { code: 1, msg: "Không đủ Vàng để mở rương!" }), true;
                    }
                    this.deductGold(totalGold, queuePush);
                    this.data.first_bronze_paid = 1;
                }
                // Bonus EXP item 10010
                this.changeItemAmount(10010, count, queuePush);
                this.data.daily_counts["PLAYER_DIALY_TASK_2"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_2"] || 0) + count;
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

                if (count === 1 && isTutorialFirstBronze) {
                    this.addOrConvertHero(10020, queuePush);
                    items.push({ type: 3, item_id: 10020, amount: 1 });
                } else {
                    var rawDrops1 = this.rollBoxDrops(bronzeBoxId, count);
                    for (var i = 0; i < rawDrops1.length; i++) {
                        var granted1 = this.grantBoxDropReward(rawDrops1[i], queuePush);
                        if (granted1) items.push(granted1);
                    }
                }
            } else if (boxTag === 2) {
                // Gold Box (Diamond / Stone)
                var isTutorialFirstGold = (!this.data.heros[10040] && (this.data.gold_box_count === 0 || this.data.guide_step <= 4));
                var isFreeGold = (nowSec - Number(this.data.gold_box_time || 0) >= 86400);
                var goldBoxId = (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.NORMAL_GOLD_ID) ? Number(ConfigGlobalVar.NORMAL_GOLD_ID) : 201;
                var price2 = (typeof Config !== "undefined" && Config.box && Config.box[goldBoxId]) ? Number(Config.box[goldBoxId].open_price || 288) : 288;

                if (count === 1 && isFreeGold) {
                    this.data.gold_box_count = Number(this.data.gold_box_count || 0) + 1;
                    this.data.gold_box_time = nowSec;
                } else {
                    var totalStone = (count === 10) ? Math.floor(price2 * 10 * 0.9) : price2 * count;
                    if (!this.canDeductStone(totalStone)) {
                        return respond({}, { code: 1, msg: "Không đủ Kim Cương để mở rương!" }), true;
                    }
                    this.deductStone(totalStone, queuePush);
                    this.data.first_gold_paid = 1;
                }
                // Bonus EXP item 10020
                this.changeItemAmount(10020, count, queuePush);
                this.data.daily_counts["PLAYER_DIALY_TASK_2"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_2"] || 0) + count;
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

                if (count === 1 && isTutorialFirstGold) {
                    this.addOrConvertHero(10040, queuePush);
                    items.push({ type: 3, item_id: 10040, amount: 1 });
                } else {
                    var rawDrops2 = this.rollBoxDrops(goldBoxId, count);
                    for (var j = 0; j < rawDrops2.length; j++) {
                        var granted2 = this.grantBoxDropReward(rawDrops2[j], queuePush);
                        if (granted2) items.push(granted2);
                    }
                }
            } else {
                // Mystery Box (VIP / Soul Box)
                var grpId = 50031;
                if (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar.MYSTER_BOX_IDS) {
                    var arr = String(ConfigGlobalVar.MYSTER_BOX_IDS).split(",");
                    grpId = Number(arr[new Date().getDay()] || arr[0] || 50031);
                }
                var price3 = (typeof Config !== "undefined" && Config.box && Config.box[grpId]) ? Number(Config.box[grpId].open_price || 3000) : 3000;
                var totalStone3 = (count === 10) ? Math.floor(price3 * 10 * 0.9) : price3 * count;
                if (!this.canDeductStone(totalStone3)) {
                    return respond({}, { code: 1, msg: "Không đủ Kim Cương để mở rương!" }), true;
                }
                this.deductStone(totalStone3, queuePush);
                this.changeItemAmount(10030, count, queuePush);
                queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());

                var rawDrops3 = this.rollBoxDrops(grpId, count);
                for (var k = 0; k < rawDrops3.length; k++) {
                    var granted3 = this.grantBoxDropReward(rawDrops3[k], queuePush);
                    if (granted3) items.push(granted3);
                }
            }
            respond({ items: items });
            return true;
        }

        if (cmd === SVRCMD.Hero2Soul) {
            respond({ status: 1, heroId: (params && params[0]) || 0 });
            return true;
        }

        if (cmd === SVRCMD.ShopInfo || cmd === SVRCMD.RefreshShop) {
            var shopType = Number((params && params[0]) || 1);
            if (!this.data.shops) this.data.shops = {};
            if (cmd === SVRCMD.RefreshShop || !this.data.shops[shopType] || !this.data.shops[shopType].info || Object.keys(this.data.shops[shopType].info).length === 0) {
                this.data.shops[shopType] = this.generateShopData(shopType);
            } else if (this.data.shops[shopType].discount_info && Object.keys(this.data.shops[shopType].discount_info).length > 0) {
                // Clean up legacy discount_info = 10 that caused 10x prices
                for (var dk in this.data.shops[shopType].discount_info) {
                    if (this.data.shops[shopType].discount_info[dk] >= 10) {
                        delete this.data.shops[shopType].discount_info[dk];
                    }
                }
            }
            var curShop = this.data.shops[shopType];
            respond({
                playerShop: {
                    shop_type: shopType,
                    info: JSON.stringify(curShop.info || {}),
                    discount_info: JSON.stringify(curShop.discount_info || {})
                }
            });
            return true;
        }

        if (cmd === SVRCMD.BuyShopGoods) {
            var shopId = Number((params && params[0]) || 0);
            var shopType = Number((params && params[1]) || 1);
            var boxDropId = Number((params && params[2]) || 0);
            if (typeof Config !== "undefined" && Config.shop && Config.shop[shopId]) {
                var sCfg = Config.shop[shopId];
                var price = Number(sCfg.price || 100);
                var pType = Number(sCfg.price_type || 1);

                var disc = 1;
                if (this.data.shops && this.data.shops[shopType] && this.data.shops[shopType].discount_info) {
                    var rawDisc = Number(this.data.shops[shopType].discount_info[shopId + "_" + boxDropId] || 1);
                    if (rawDisc > 0 && rawDisc < 10) disc = rawDisc;
                }
                var finalPrice = Math.max(1, Math.floor(price * disc));

                if (!this.canDeductCurrency(pType, finalPrice)) {
                    return respond({}, { code: 1, msg: "Không đủ tiền tệ để mua vật phẩm!" }), true;
                }
                this.deductCurrency(pType, finalPrice, queuePush);

                var drop = null;
                if (Config.box_drop && Config.box_drop[sCfg.box_id] && Config.box_drop[sCfg.box_id][boxDropId]) {
                    drop = Config.box_drop[sCfg.box_id][boxDropId];
                } else if (Config.box_drop_item && Config.box_drop_item[boxDropId]) {
                    drop = Config.box_drop_item[boxDropId];
                }
                if (drop) {
                    this.grantBoxDropReward(drop, queuePush);
                }
            }
            if (this.data.shops && this.data.shops[shopType] && this.data.shops[shopType].info) {
                this.data.shops[shopType].info[shopId + "_" + boxDropId] = 0;
            }
            respond({});
            return true;
        }

        if (cmd === SVRCMD.BuyGoods2) {
            var goods2Id = Number((params && params[0]) || 1001);
            var cntKey = "PLAYER_GOODS2_COUNT_ID_" + goods2Id;
            var curBuyCount = Number(this.data.daily_counts[cntKey] || 0);
            var nextTier = curBuyCount + 1;

            var g2TierCfg = null;
            if (typeof Config !== "undefined" && Config.goods2 && Config.goods2[goods2Id]) {
                var g2Map = Config.goods2[goods2Id];
                g2TierCfg = g2Map[nextTier];
                if (!g2TierCfg) {
                    var tierKeys = Object.keys(g2Map).map(Number).sort(function(a, b) { return a - b; });
                    if (tierKeys.length > 0) {
                        g2TierCfg = g2Map[tierKeys[tierKeys.length - 1]];
                    }
                }
            }

            var costPrice = g2TierCfg ? Number(g2TierCfg.price || 20) : 20;
            var costPriceType = g2TierCfg ? Number(g2TierCfg.price_type || 2) : 2;
            var rewardVal = g2TierCfg ? Number(g2TierCfg.value || 1) : 1;

            var shopRefreshMap = {
                4001: 1, 5001: 2, 6001: 3, 7001: 4, 8001: 5,
                9001: 6, 13001: 7, 16001: 9, 9051: 10
            };

            if (!this.canDeductCurrency(costPriceType, costPrice)) {
                return respond({}, { code: 1, msg: "Không đủ tiền tệ!" }), true;
            }
            this.deductCurrency(costPriceType, costPrice, queuePush);
            this.data.daily_counts[cntKey] = nextTier;

            if (shopRefreshMap[goods2Id]) {
                var targetShopType = shopRefreshMap[goods2Id];
                if (!this.data.shops) this.data.shops = {};
                this.data.shops[targetShopType] = this.generateShopData(targetShopType);
            } else if (goods2Id === 1001) {
                // Buy Stamina (SP)
                var spAdd = rewardVal > 1 ? rewardVal : 120;
                this.addSp(spAdd, queuePush);
            } else if (goods2Id === 2001) {
                // Buy Gold (Midas)
                var goldAmount = rewardVal > 1 ? rewardVal : (20000 + nextTier * 5000);
                if (Math.random() < 0.25) {
                    goldAmount *= 2;
                    queuePush(SVRCMD.Goods2Crit, {});
                }
                this.addGold(goldAmount, queuePush);
                this.data.daily_counts["PLAYER_DIALY_TASK_8"] = Number(this.data.daily_counts["PLAYER_DIALY_TASK_8"] || 0) + 1;
            } else if (goods2Id === 9101) {
                // Buy Skill Points
                this.data.skill_points = 20;
            }

            queuePush(SVRCMD.PlayerAttr, this.buildPlayerAttrPayload());
            respond({ gold: Number(this.data.gold), diamond: Number(this.data.stone), sp: Number(this.data.sp) });
            return true;
        }

        if (cmd === SVRCMD.GetSoulShopInfo) {
            if (!this.data.soul_shop) {
                var bIds = { "1": 4204, "2": 4205, "3": 4206 };
                if (typeof Config !== "undefined" && Config.box_drop_item) {
                    var bdKeys = Object.keys(Config.box_drop_item);
                    if (bdKeys.length >= 3) {
                        bIds = {
                            "1": Number(bdKeys[Math.floor(Math.random() * bdKeys.length)]),
                            "2": Number(bdKeys[Math.floor(Math.random() * bdKeys.length)]),
                            "3": Number(bdKeys[Math.floor(Math.random() * bdKeys.length)])
                        };
                    }
                }
                this.data.soul_shop = {
                    heroIds: [10020, 10040, 10050],
                    buyedHeroIds: [],
                    boxIds: bIds
                };
            }
            respond(this.data.soul_shop);
            return true;
        }

        if (cmd === SVRCMD.BuySoulShopItem) {
            var heroTag = Number((params && params[0]) || 10020);
            var boxIdx = String((params && params[1]) || "1");
            var soulId = this.findSoulItemId(heroTag);
            if (!this.canDeductItem(soulId, 20)) {
                return respond({}, { code: 1, msg: "Cần 20 Hồn Ninja của tướng này để đổi!" }), true;
            }
            this.deductItem(soulId, 20, queuePush);

            var dropId = (this.data.soul_shop && this.data.soul_shop.boxIds && this.data.soul_shop.boxIds[boxIdx]) ? Number(this.data.soul_shop.boxIds[boxIdx]) : 4204;
            var dropObj = (typeof Config !== "undefined" && Config.box_drop_item && Config.box_drop_item[dropId]) ? Config.box_drop_item[dropId] : null;
            if (dropObj) {
                this.grantBoxDropReward(dropObj, queuePush);
            } else {
                this.changeItemAmount(30005, 5, queuePush);
            }

            if (this.data.soul_shop) {
                var idx = this.data.soul_shop.heroIds.indexOf(heroTag);
                if (idx !== -1) this.data.soul_shop.heroIds.splice(idx, 1);
                if (this.data.soul_shop.buyedHeroIds.indexOf(heroTag) === -1) {
                    this.data.soul_shop.buyedHeroIds.push(heroTag);
                }
            }
            respond({ extraItems: [] });
            return true;
        }

        if (cmd === SVRCMD.BuySomething) {
            var goodsType = Number((params && params[0]) || 1);
            if (goodsType === 1) {
                if (!this.canDeductStone(10)) return respond({}, { code: 1, msg: "Không đủ Kim Cương!" }), true;
                this.deductStone(10, queuePush);
                this.addGold(50000, queuePush);
            } else if (goodsType === 2) {
                if (!this.canDeductStone(50)) return respond({}, { code: 1, msg: "Không đủ Kim Cương!" }), true;
                this.deductStone(50, queuePush);
                this.addSp(120, queuePush);
            }
            respond({ status: 1 });
            return true;
        }

        if (cmd === "GoodsInfo" || cmd === SVRCMD.GoodsInfo) {
            var gIds = String((params && params[0]) || "1001;1002;1003;1004;1005;1006;1007");
            var buys = this.data.goods_buy_count || {};
            respond({ goodsId: gIds, buyCount: gIds.split(";").map(function(id) { return Number(buys[id] || 0); }).join(",") });
            return true;
        }

        if (cmd === "CreateOrder" || cmd === SVRCMD.CreateOrder) {
            respond({ orderId: "NR" + Date.now() + Math.floor(Math.random() * 1000) });
            return true;
        }

        if (cmd === "Goods2Crit" || cmd === SVRCMD.Goods2Crit) {
            respond({ status: 1 });
            return true;
        }

        return false;
    }
};

module.exports = ShopAndBoxHandler;
