SVRCMD.CrossPlayer3v3ArenaInfo = "CrossPlayer3v3ArenaInfo";
SVRCMD.CrossMatch3v3ArenaFighters = "CrossMatch3v3ArenaFighters";
SVRCMD.Cross3v3ArenaFightHistoryInfo = "Cross3v3ArenaFightHistoryInfo";
SVRCMD.Cross3v3ArenaFight = "Cross3v3ArenaFight";
SVRCMD.CrossSet3v3ArenaLineup = "CrossSet3v3ArenaLineup";
SVRCMD.Cross3v3ArenaFightHistory = "Cross3v3ArenaFightHistory";
SVRCMD.Cross3v3ArenaAllRankInfo = "Cross3v3ArenaAllRankInfo";
SVRCMD.Cross3v3ArenaRank = "Cross3v3ArenaRank";
SVRCMD.Cross3v3ArenaInfo = "Cross3v3ArenaInfo";
SVRCMD.CrossClear3v3ArenaFightCD = "CrossClear3v3ArenaFightCD";
EventConst.updateCross3v3Def = "updateCross3v3Def";
/**
 * Created by Administrator on 2014/12/10.
 */

var Cross3v3ChallengeItemRender = cc.Layer.extend({

    _obj : null,
    _myDataInfo : null,

    ctor : function(obj, myDataInfo) {
        this._super();
        this._obj = obj;
        this._myDataInfo = myDataInfo;

        if(!this._obj || !this._myDataInfo)
            return;

        this.init_bg();
    },

    init_bg : function() {
        var bg = NumUnit.initImage(0, 0, resPlist.pvp_foe_floor, this);
        this.setContentSize(cc.size(bg.width, bg.height));

        var foe_head = NumUnit.initImage(bg.width/2, bg.height - 65, gamePlayer.getIcon(this._obj.icon), bg);
        foe_head.scale = 0.75;
        var frame = gamePlayer.getFrame(this._obj.icon);
        var foe_frame = NumUnit.initButtonUI(frame, frame, this.onDetial, this);
        foe_frame.setPosition(foe_head.x, foe_head.y);
        foe_frame.tag = this._obj.fighter_id;
        foe_frame.scale = 0.75;
        bg.addChild(foe_frame);

        var name = this._obj.player_name;
        if(name.length <= 0)
            name = LANSTR.nonameteam;
        var foe_name = NumUnit.initLabel(foe_head.x, foe_head.y - 85, bg, 26, name);
        var level_floor = NumUnit.initImage(foe_head.x + 45, foe_head.y - 27, UiRes.team_level, bg, 1);
        var foe_level = NumUnit.initLabel(level_floor.width/2, level_floor.height/2, level_floor, 20, this._obj.player_lv);
        var img_rank = NumUnit.initImage(20, 140, resPlist.txt_rank, bg, 0,0);
        var img_power = NumUnit.initImage(img_rank.x, img_rank.y-35, resPlist.txt_fight_count, bg, 0,0);
        var foe_rank = NumUnit.initLabel(130, img_rank.y, bg, 26, this._obj.rank, null, null, 0,0,0);
        var foe_power = NumUnit.initLabel(foe_rank.x, foe_rank.y - 35, bg, 26, this._obj.fight_value, null, null, 0,0,0);
        var foe_btn = NumUnit.initButtonUI(UiRes.button_small_up, UiRes.button_small_down, this.onPk, this);
        foe_btn.setPosition(foe_head.x, 45);
        bg.addChild(foe_btn);
        NumUnit.initLabelYellow(foe_btn.x, foe_btn.y, bg, Cache.languageConfig.PkFoeItemRender_challengeSize, LANSTR.PkFoeItemRender_tiaozhan);
    },

    // 挑战
    onPk:function() {
        cc.log("去挑战布阵");
        EventDispatcher.shared().addListener(SVRCMD.CrossPlayer3v3ArenaInfo, function(cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.CrossPlayer3v3ArenaInfo);
            Loading.remove();
            var errorcode = pkgReader.getPkgError(data);
            if (errorcode) {
                return;
            }

            var layer = new Cross3v3EmbattleView(data.data, this._obj.rank, this._myDataInfo);
            cc.director.getRunningScene().addChild(layer, 2);
        }, this);

        Loading.add();
        Netty.shared().sendPackage(SVRCMD.CrossPlayer3v3ArenaInfo, [this._myDataInfo.arena_lv, this._obj.server_id, this._obj.fighter_id]);
    },

    // 敌方详细
    onDetial:function() {
        EventDispatcher.shared().addListener(SVRCMD.CrossPlayer3v3ArenaInfo, function(cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.CrossPlayer3v3ArenaInfo);
            Loading.remove();
            var errorcode = pkgReader.getPkgError(data);
            if (errorcode) {
                return;
            }

            var detial = new Cross3v3FoeDetial(data.data, this._obj);
            cc.director.getRunningScene().addChild(detial, 2);
        }, this);

        Loading.add();
        Netty.shared().sendPackage(SVRCMD.CrossPlayer3v3ArenaInfo, [this._myDataInfo.arena_lv, this._obj.server_id, this._obj.fighter_id]);
    }
});

/**
 * Created by Administrator on 2014/12/8.
 *
 * "挑战界面"
 */
var Cross3v3ChallengeView = BaseLayer.extend({

    _bg : null,
    _data : null,       // 挑战对手组
    _myDataInfo : null,
    _foeItem : null,
    _foeData : null,

    ctor : function(data, myDataInfo) {
        this._super();
        this._data = data;
        this._myDataInfo = myDataInfo;
        this._foeItem = [];
        this._foeData = [];

        for(var i in this._data) {
            this._foeData.push(this._data[i]);
        }
        // 排序
        this._foeData.sort(function(foe_1,foe_2) {
            if(foe_1.rank < foe_2.rank) {
                return -1;
            } else {
                return 1;
            }
        });

        this.init_bg();
    },

    init_bg : function () {
        var bg = this._bg = NumUnit.initImage(WINSIZE.width/2, WINSIZE.height/2, ShadowRes.opponent_bg, this);
        NumUnit.initBtnClose(bg.x + bg.width/2 - 10, bg.y + bg.height/2 - 10, this, this.onClose);

        // 换一批
        var exchange_btn = new cc.MenuItemImage(UiRes.button_yellow_up, UiRes.button_yellow_down, this.toExchange, this);
        exchange_btn.setPosition(bg.x, bg.y - bg.height/2 + 60);
        NumUnit.initLabelYellow(exchange_btn.width/2, exchange_btn.height/2, exchange_btn, 24, LANSTR.ChallengeView_huanyipi);
        var menu_exchange = cc.Menu.create(exchange_btn);
        menu_exchange.setPosition(0,0);
        this.addChild(menu_exchange);

        this.updateFoeData();
    },

    // 换一批
    toExchange : function() {
        cc.log("换一批");
        EventDispatcher.shared().addListener(SVRCMD.CrossMatch3v3ArenaFighters, function (cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.CrossMatch3v3ArenaFighters);
            Loading.remove();
            var errorcode = pkgReader.getPkgError(data);
            if(errorcode) {
                return;
            }

            this._data = data.data;
            this._foeData = [];

            for(var i in this._data) {
                this._foeData.push(this._data[i]);
            }
            // 排序
            this._foeData.sort(function(foe_1,foe_2) {
                if(foe_1.rank < foe_2.rank) {
                    return -1;
                } else {
                    return 1;
                }
            });
            this.updateFoeData();
        }, this);

        Loading.add();
        Netty.shared().sendPackage(SVRCMD.CrossMatch3v3ArenaFighters, []);
    },

    // 更新 敌方数据
    updateFoeData : function () {
        for(var i = 0; i < 3; i++) {
            if(this._foeItem[i]) {
                this._foeItem[i].removeFromParent();
                this._foeItem[i] = null;
            }
            if(this._foeData[i]) {
                this._foeItem[i] = new Cross3v3ChallengeItemRender(this._foeData[i], this._myDataInfo);
                this._foeItem[i].setPosition(this._bg.x - 240 + i*240, this._bg.y + 40);
                this.addChild(this._foeItem[i]);
            }
        }
    },

    onExit : function () {
        this._foeItem = null;
        this._foeData = null;
        this._super();
    }
})
/**
 * Created by Administrator on 2014/12/9.
 *
 * "每场对战记录组"界面
 */
var Cross3v3NotesView = BaseLayer.extend({

    _bg : null,
    _data : null,

    ctor : function(data) {
        this._super();
        this._data = data;

        this.init_bg();
    },

    init_bg : function () {
        var bg = this._bg = NumUnit.initScale9Sprite(WINSIZE.width/2, WINSIZE.height/2, 940, 600, this, 2);
        NumUnit.initBtnClose(bg.x + bg.width/2 - 10, bg.y + bg.height/2 - 10, this, this.onClose);

        var atk_arr = [];
        var win_arr = [];
        var def_arr = [];
        var teamNumMax = 3
        for(var n = 0; n < teamNumMax; n++)
        {
            var index = n + 1
            if(this._data["is_atk_win_"+index] && this._data["is_atk_win_"+index] != 0 && this._data["is_atk_win_"+index] != 3)
            {
                var atk_hero = JSON.parse(this._data["atk_heros_"+index]);
                atk_arr.push(atk_hero);
                var def_hero = JSON.parse(this._data["def_heros_"+index]);
                def_arr.push(def_hero); 
                win_arr.push(this._data["is_atk_win_"+index])
            }
        }

        // for(var i = 0; i < win_arr.length; i++)
        // {
        //     var item = new Cross3v3NotesViewItemRender(i, this._data, atk_arr[i], def_arr[i], win_arr[i]);
        //     this.addChild(item);
        //     item.x = this._bg.x;
        //     item.y = bg.y + bg.height/2 - 20 - i*190;
        // }



        var scroll_W = this._bg.width - 20
        var itemH = 220
        var scroll_H = this._bg.height - 20;
        var tabgap = 5

        var all_itemH = (itemH + tabgap) * win_arr.length- tabgap  // 全部 items 的总高度

        // 创建滚动条
        var scrollView = ccui.ScrollView.create();
        scrollView.setAnchorPoint(cc.p(0.5, 0.5))
        scrollView.setDirection(ccui.ScrollView.DIR_VERTICAL);
        scrollView.setSize(cc.size(scroll_W, scroll_H));
        scrollView.setInnerContainerSize(cc.size(scroll_W, all_itemH));
        scrollView.setPosition(this._bg.width/2, this._bg.height/2);
        this._bg.addChild(scrollView);

        var x = scroll_W / 2
        var posy = all_itemH 

        for(var i = 0; i < win_arr.length; i++)
        {
            var item = new Cross3v3NotesViewItemRender(i, this._data, atk_arr[i], def_arr[i], win_arr[i]);
            item.x = x
            item.y = posy 
            posy = posy - tabgap - itemH
            scrollView.getInnerContainer().addChild(item)
        }

    },

    onExit : function() {
        if(this._bg)
            cc.eventManager.removeListeners(this._bg);
        this._super();
    }
});
/**
 * Created by Administrator on 2014/12/9.
 */

ccui.Layout.extend = cc.Class.extend;

var Cross3v3NotesViewItemRender = cc.Node.extend({

    _index : null,
    _data : null,
    _atk_obj : null,
    _def_obj : null,
    _is_win : null,

    ctor : function(index, data, atk_obj, def_obj, is_win) {
        this._super();

        this._index = index;
        this._data = data;
        this._atk_obj = atk_obj;
        this._def_obj = def_obj;
        this._is_win = is_win;
        this.init_bg();
    },

    init_bg : function () {
        var zs_left = NumUnit.initImage(-160, -20, UiRes.explain_zs, this);
        var zs_right = NumUnit.initImage(160, zs_left.y, UiRes.explain_zs, this);
        zs_right.scaleX = -1;
        var diString = cc.formatStr(LANSTR.NotesViewItemRender_di, (this._index+1));
        var title = NumUnit.initLabel(0, zs_left.y, this, 30, diString);

        // 进攻方
        var atk_bg = NumUnit.initImage(-240, -120, resPlist.pvp_group_bg, this);
        var atk_lvImg = NumUnit.initImage(atk_bg.x - 50, atk_bg.y + 40, UiRes.icon_lv, this);
        if(this._is_win == 1)
            NumUnit.initImage(atk_bg.x - atk_bg.width/2 + 20, -70, resPlist.pvp_icon_win, this);
        else
            NumUnit.initImage(atk_bg.x - atk_bg.width/2 + 20, -70, resPlist.pvp_icon_lose, this);

        NumUnit.initLabel(atk_lvImg.x + 30, atk_lvImg.y, this, 28, this._data.atk_lv, gameColor.gold, null, 0, 0, 0);
        var atk_name = this._data.atk_name;
        if(atk_name == "")
            atk_name = LANSTR.nonameteam;
        NumUnit.initLabel(atk_lvImg.x + 70, atk_lvImg.y, this, 24, atk_name, cc.color.WHITE, null, 0, 0, 0);

        for(var i = 0; i < this._atk_obj.length; i++) {
            var icon_id = Hero.getIconByHeroIdNQuality(this._atk_obj[i].hero_id, this._atk_obj[i].quality);
            var headImg = NumUnit.initImageTwo(atk_bg.x - 140 + 70*i, atk_bg.y - 20, "#head_" + icon_id + ".jpg", "#head_quality_" + this._atk_obj[i].quality + ".png", this);
            headImg.setScale(0.6);

            var icon_lv = NumUnit.initImage(10, 10, UiRes.team_level, headImg, 1);
            var txt_lv = NumUnit.initLabel(icon_lv.width/2, icon_lv.height/2, icon_lv, 26, this._atk_obj[i].lv);
            NumUnit.initLabelYellow(headImg.width-5, headImg.height-5, headImg, 26, Tails.TAILS_NUM[this._atk_obj[i].beast], null, null,0,0,1,1);
        }

        // 防守方
        var def_bg = NumUnit.initImage(180, atk_bg.y, resPlist.pvp_group_bg, this);
        var def_lvImg = NumUnit.initImage(def_bg.x - 50, atk_lvImg.y, UiRes.icon_lv, this);
        if(this._is_win == 2)
            NumUnit.initImage(def_bg.x - def_bg.width/2 + 20, -70, resPlist.pvp_icon_win, this);
        else
            NumUnit.initImage(def_bg.x - def_bg.width/2 + 20, -70, resPlist.pvp_icon_lose, this);

        NumUnit.initLabel(def_lvImg.x + 30, def_lvImg.y, this, 28, this._data.def_lv, gameColor.gold, null, 0, 0, 0);
        var def_name = this._data.def_name;
        if(def_name == "")
            def_name = LANSTR.nonameteam;
        NumUnit.initLabel(def_lvImg.x + 70, def_lvImg.y, this, 24, def_name, cc.color.WHITE, null, 0, 0, 0);

        for(var i = 0; i < this._def_obj.length; i++) {
            var icon_id = Hero.getIconByHeroIdNQuality(this._def_obj[i].hero_id, this._def_obj[i].quality);
            var headImg = NumUnit.initImageTwo(atk_bg.x + 280 + 70*i, atk_bg.y - 20, "#head_" + icon_id + ".jpg", "#head_quality_" + this._def_obj[i].quality + ".png", this);
            headImg.setScale(0.6);

            var icon_lv = NumUnit.initImage(10, 10, UiRes.team_level, headImg, 1);
            var txt_lv = NumUnit.initLabel(icon_lv.width/2, icon_lv.height/2, icon_lv, 26, this._def_obj[i].lv);

            var hero = this._def_obj[i]
            if(hero.bagate_level && hero.bagate_level> 0){
                NumUnit.initImage(headImg.width-15, headImg.height-15, NumUnit.getBamenSprite(hero.bagate_level), headImg);
            }
            else{
                NumUnit.initLabelYellow(headImg.width-5, headImg.height-5, headImg, 26, Tails.TAILS_NUM[hero.beast], null, null,0,0,1,1);
            }
        }

        NumUnit.initImage(-30, -130, resPlist.pvp_vs, this);

        var btn_video = NumUnit.initButtonUI(resPlist.pvp_button_video, resPlist.pvp_button_video, this.onVideo, this);
        btn_video.setPosition(410, - 110);
        this.addChild(btn_video);
    },

    onVideo : function() {
        cc.log("播放录像");
        EventDispatcher.shared().addListener(SVRCMD.Cross3v3ArenaFightHistoryInfo, function(cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.Cross3v3ArenaFightHistoryInfo);
            Loading.remove();
            var errorcode = pkgReader.getPkgError(data);
            if (errorcode) {
                return;
            }

            var datasource = getVideoBattleRecData(data.data.history.fight_data);
            if(datasource == ""){
                NumUnit.prompts(LANSTR.ERROR_REPLAYDATA);
                return;
            }

            var bm = BattleModle.getModleFromString(datasource.bm.split(","));

            bm.atk_name = this._data.atk_name;
            bm.atk_lv = this._data.atk_lv;
            bm.def_name = this._data.def_name;
            bm.def_lv = this._data.def_lv;
            var defGroup = bm.defenceGroup;
            var atkGroup = bm.attackGroup;

            // 被打 败，名次下降 or 被打 胜，名次不变
            bm.attackGroup = atkGroup;
            bm.defenceGroup = defGroup;
            var rpd = new ReplayData(bm);
            rpd.data = datasource;
            bm.replaydata = rpd;
            bm.result = rpd.data.result;

            if(!Netty.isHistoryAttacker(this._data)) {
                bm.isAttackAvatar = false;
            }

            bm.resetForReplay();

            //跳转至战斗场景并播放录像
            cc.log("开始播放录像");

            var bg = "res/background/bg_1001.jpg";
            var resources = NumUnit.prepareLoadingRes([bm]);
            resources = resources.concat(res_fight);
            resources = resources.concat([bg]);
            Loading.loadRes(resources, function () {
                var rs = new ReplayScene();
                rs.setReplayData(bg,bm,false);
                cc.director.runScene(rs);
            });

        }, this);

        Loading.add();
        Netty.shared().sendPackage(SVRCMD.Cross3v3ArenaFightHistoryInfo, [this._data.id, (this._index+1)]);
    }
});

/**
 * Created by Administrator on 2014/12/8.
 */
ccui.Layout.extend = cc.Class.extend;

var Cross3v3DefendItemRender = ccui.Layout.extend({

    _index : null,
    _def_id_arr : null,
    _def_arr : null,

    ctor : function(index, def_id_arr) {
        this._super();
        this._index = index;
        this._def_id_arr = def_id_arr;
        this._def_arr = [];

        for(var i in this._def_id_arr) {
            for(var u in gamePlayer.getHeros) {
                if(this._def_id_arr[i] == gamePlayer.getHeros[u].config.id)
                    this._def_arr.push(gamePlayer.getHeros[u]);
            }
        }

        // 排序
        this._def_arr.sort(function(a, b){
            if(Config.skill[a.config.id].getValByKey("target_point") > Config.skill[b.config.id].getValByKey("target_point")){
                return -1;
            }else if(Config.skill[a.config.id].getValByKey("target_point") < Config.skill[b.config.id].getValByKey("target_point")){
                return 1;
            }else{
                return b.config.id - a.config.id;
            }
        });

        this.init_bg();
    },

    init_bg : function() {
        var bg = NumUnit.initImage(0, 0, ShadowRes.shadow_defend_floor, this);
        var bg = NumUnit.initImage(bg.width/2, bg.height / 2, ShadowRes.shadow_defend_floor, bg);

        var str = ShadowRes["tean_" + (this._index + 1)]
        NumUnit.initImage(54, bg.height / 2, str, bg);

        if(this._def_arr) {
            for(var i = 0; i < this._def_arr.length; i++) {
                var icon_id = Hero.getHeroAwakenIconId(this._def_arr[i]);
                var headImg = NumUnit.initImageTwo(-120 + 81*i, 0, "#head_" + icon_id + ".jpg", "#head_quality_" + this._def_arr[i].quality.quality + ".png", this, 0,0.5,0.5);
                headImg.setScale(0.7);
            }
        }
    }
});


/**
 * Created by Administrator on 2014/12/12.
 *
 * "布阵攻击阵容"界面
 */
var Cross3v3EmbattleView = BaseLayer.extend({

    _npcData : null,        // 对手信息
    _npcRank : null,        // 对手排名
    _myDataInfo : null,
    _def_id_arr : null,     // 三组防守阵容Id
    size : null,
    bg : null,
    army_bg : null,
    _select : 0,            // 当前选中页签
    sprite_select : null,   // 页签选中时，加一层图在上面

    hero_arr : null,        // 所获得的hero(根据页签变化)
    scrollView : null,      // 所有忍者列表
    armyScrollView : null,  // 准备战斗队伍列表
    gap : 30,               // 滚动条各元素间距

    army_arr_1 : [],      // 准备战斗队伍一队
    army_arr_2 : [],      // 准备战斗队伍二队
    army_arr_3 : [],    // 准备战斗队伍三队
    army_arr_4 : [],    // 准备战斗队伍四队
    army_arr_5 : [],    // 准备战斗队伍五队
    army_arr_6 : [],    // 准备战斗队伍六队
    army_arr_7 : [],    // 准备战斗队伍七队

    army_index_1 : 0,     // 已进一队战斗队伍的个数
    army_index_2 : 0,     // 已进二队战斗队伍的个数
    army_index_3 : 0,   // 已进三队战斗队伍的个数
    army_index_4 : 0,     // 已进一队战斗队伍的个数
    army_index_5 : 0,     // 已进二队战斗队伍的个数
    army_index_6 : 0,   // 已进三队战斗队伍的个数
    army_index_7 : 0,   // 已进三队战斗队伍的个数



    // 按钮文字
    _team_1 : null,       // 1队
    _team_2 : null,       // 2队
    _team_3 : null,     // 3队
    _team_4 : null,       // 1队
    _team_5 : null,       // 2队
    _team_6 : null,     // 3队
    _team_7 : null,     // 3队


    _team_floor_1 : null,
    _team_floor_2 : null,
    _team_floor_3 : null,
    _team_floor_4 : null,
    _team_floor_5 : null,
    _team_floor_6 : null,
    _team_floor_7 : null,
    _select_team : 0,       // 当前选中队伍

    _next_btn : null,       // 下一步按钮
    _next_btn_txt : null,   // 下一步按钮上文字

    // 对方阵容队伍图片
    _def_bg : null,
    _team_one_img : null,   // 1队
    // _team_2_img : null,   // 2队
    // _team_3_img : null, // 3队

    _allPower : null,       // 总战斗力

    _teamNum : 5,

    tabName:[],

    ctor : function(npcData, npcRank, myDataInfo) {
        this._super();

        this.size = cc.director.getWinSize();

        this.tabName.push(LANSTR.FightEmbattleView_tabName01);
        this.tabName.push(LANSTR.FightEmbattleView_tabName02);
        this.tabName.push(LANSTR.FightEmbattleView_tabName03);
        this.tabName.push(LANSTR.FightEmbattleView_tabName04);

        this._teamNum = npcData.team_num

        this._npcData = npcData;
        this._npcRank = npcRank;
        this._myDataInfo = myDataInfo;
        //this._def_id_arr = def_id_arr;

        this.army_arr_1 = [];
        this.army_arr_2 = [];
        this.army_arr_3 = [];
        this.army_arr_4 = [];
        this.army_arr_5 = [];
        this.army_arr_6 = [];
        this.army_arr_7 = [];

        // 初始化进攻队伍

        for(var n = 0; n < this._teamNum; n++)
        {
            var index = n + 1
            if((this._myDataInfo.rank["atk_heros_" + index] || "").length > 0)
            {
                var arr = this._myDataInfo.rank["atk_heros_" + index].split(",");
                for(var i in arr) {
                    var id = Number(arr[i]);
                    for(var j in gamePlayer.getHeros) {
                        if(id == gamePlayer.getHeros[j].id)
                            this["army_arr_"+index].push(gamePlayer.getHeros[j]);
                    }
                }
            }
        }

        for(var i = 0; i < this._teamNum; i++)
        {
            var index = i + 1
            if(this["army_arr_"+index].length > 5)
                this["army_arr_"+index]= [];
            this["army_index_" + index] = this["army_arr_"+index].length;
        }

        this.init_bg();
        gamePlayer.updateHerosSort();

        this.initNinja();   // 按类型显示忍者
        this.updateArmy();  // 战斗队伍

        EventDispatcher.shared().addListener(EventConst.chooseHero, function(cmd, data){
            this.onChooseHero(data[0]);
        }, this);
    },

    init_bg : function() {
        this.bg = cc.Sprite.create(MapRes.board_fight_choose);
        this.bg.anchorX = 0.5;
        this.bg.anchorY = 0.5;
        this.bg.x = WINSIZE.width/2 - 30;
        this.bg.y = WINSIZE.height/2 + 80;
        this.addChild(this.bg);

        // 回退按钮
        NumUnit.initBtnBack(50, WINSIZE.height-50, this, this.onClose);

        // 准备作战忍者背景图
        this.army_bg = NumUnit.initImage(this.size.width/2 - 80, 40, MapRes.board_choosed, this);
        for(var j = 0; j < 5; j++) {
            var icon_bg = NumUnit.initImage(this.army_bg.x - 275 + j*137, 48, UiRes.kuang_ninja, this);
            icon_bg.setTag(1004 - j);
            NumUnit.initImage(icon_bg.x, 93, MapRes.board_choosed_frame, this);
        }

        // 页签
        var table_select = cc.Menu.create();
        for(var i = 0; i < MAPCONST.PK_EMBATTLE_TAB_NUM; i++)
        {
            var btn = new cc.MenuItemImage(resPlist.tap_up, resPlist.tap_up, this.onTableSelect, this);
            btn.anchorX = 1;
            btn.x = this.bg.x + this.bg.width/2 + btn.width - 38;
            btn.y = this.bg.y + this.bg.height/2 - 75 * i - 170;
            btn.tag = Hero.TROOP_ALL + i;
            NumUnit.initLabelBlack(btn.width - 30, btn.height / 2, btn, 28, this.tabName[i], null, null, 0, 0, 1);   // 页签上的文字
            table_select.addChild(btn);
        }
        table_select.setPosition(0,0);
        this.addChild(table_select, 0);

        // 选中页签时加一层假的覆盖其上
        this.sprite_select = cc.Sprite.create(resPlist.tap_down);
        this.sprite_select.anchorX = 1;
        this.sprite_select.x = btn.x;
        this.sprite_select.y = this.bg.y + this.bg.height / 2 - 75 * (this._select % 1000) - 170;
        // 页签上的文字
        this.sprite_select.txt = NumUnit.initLabelBlack(this.sprite_select.width - 30, this.sprite_select.height / 2, this.sprite_select, 28, this.tabName[0], gameColor.brown, null, 0, 0, 1);
        this.addChild(this.sprite_select, 2);

        // 左侧队伍页签按钮
        this.initTeamTab()

        // 下一步按钮
        this._next_btn = new cc.MenuItemImage(UiRes.button_middle_up, UiRes.button_middle_down, this.onNextStep, this);
        this._next_btn.setPosition(this.size.width - 110, 80);
        this._next_btn_txt = NumUnit.initLabelYellow(this._next_btn.width/2, this._next_btn.height/2, this._next_btn, Cache.languageConfig.ShadowNext_labelSize, LANSTR.ShadowSetView_next);
        var menu_next = cc.Menu.create(this._next_btn);
        menu_next.setPosition(0, 0);
        this.addChild(menu_next);

        // 总战斗力
        this._allPower = NumUnit.initLabel(this._next_btn.x, 150, this, Cache.languageConfig.PkTeamSet_powerSize, LANSTR.PkFoeDetial_power + "\n0");
        this._allPower.setHorizontalAlignment(cc.TEXT_ALIGNMENT_CENTER);
    },

    // 队伍标签
    initTeamTab : function()
    {
        var scroll_W = 200
        var itemH = 90
        var scroll_H = 430;
        var allowH = 50
        var tabgap = 1

        var all_itemH = (itemH + tabgap) * this._teamNum + (allowH+tabgap) * (this._teamNum -1)   // 全部 items 的总高度

        // 创建滚动条
        var scrollView = ccui.ScrollView.create();
        scrollView.setAnchorPoint(cc.p(0.5, 0.5))
        scrollView.setDirection(ccui.ScrollView.DIR_VERTICAL);
        scrollView.setSize(cc.size(scroll_W, scroll_H));
        scrollView.setInnerContainerSize(cc.size(scroll_W, all_itemH));
        var x = this.bg.x - this.bg.width/2 - 5;
        scrollView.setPosition(x, this.bg.y - 130);
        this.addChild(scrollView, 0);

        var posy = all_itemH  - itemH / 2
        for(var n = 0; n < this._teamNum; n++)
        {
            var index = n + 1
            var btn = NumUnit.initButtonUI(ShadowRes.choose_bg, ShadowRes.choose_bg, this.chooseTeam, this);
            btn.x = btn.getContentSize().width / 2 + 2
            btn.y = posy
            btn.tag = n

            var image =  index
            this["_team_floor_" + index] = NumUnit.initImage(btn.width/2, btn.height/2, ShadowRes["team_floor_" + image], btn);
            var teamOneString = cc.formatStr(LANSTR["ShadowSetView_team" + index], this["army_index_" + index])
            this["_team_" + index] = NumUnit.initLabelBlack(btn.width/2, btn.height/2, btn, 22, teamOneString);
            this["_team_floor_" + index].setVisible(n==0)

            scrollView.addChild(btn);

            //箭头
            posy = posy - tabgap - itemH
            NumUnit.initImage(btn.x, posy + 20, ShadowRes.next_arrows, scrollView);

            posy = posy - tabgap - allowH
        }

        this._scrollView = scrollView


    },

    updateScoll:function()
    {
        if(!this._scrollView) return
        var scroll_W = 200
        var itemH = 90
        var scroll_H = 380;
        var allowH = 50
        var tabgap = 1
        var all_itemH = (itemH + tabgap) * this._teamNum + (allowH+tabgap) * (this._teamNum -1)   // 全部 items 的总高度

        var offy = (itemH + tabgap +allowH) * (this._teamNum - 1 - this._select_team)
        offy = offy > (all_itemH - scroll_H) ? all_itemH - scroll_H : offy

        var onUpdate = function()
        {

            this._scrollView.getInnerContainer().setPosition(0, -offy)
        }

        this.scheduleOnce(onUpdate, 0.02);
    },

    chooseTeam : function (btn) {
        if(this._select_team == btn.tag)
            return;

        for(var n = 0; n < this._teamNum; n++)
        {
            var index = n + 1
            this["_team_floor_" + index].setVisible(false)
        }

        this._select_team = btn.tag;
        this["_team_floor_" + (this._select_team+1)].setVisible(true)
        var str = (this._select_team + 1) == this._teamNum ? LANSTR.ShadowSetView_sure : LANSTR.ShadowSetView_next
        this._next_btn_txt.setString(str);


        this.initNinja();
        // 更新战斗队伍
        this.updateArmy();

        var str = "tean_" + (this._select_team + 1) + ".png"
        this._team_one_img.setSpriteFrame(str);
    },

    _finishFightRequest: function() {
        if (this._fightRequestTimeout) this.unschedule(this._fightRequestTimeout);
        this._fightRequestTimeout = null;
        EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.Cross3v3ArenaFight);
        EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.CrossSet3v3ArenaLineup);
        if (this._isReq) Loading.remove();
        this._isReq = false;
        if (this._next_btn) this._next_btn.setEnabled(true);
    },

    _beginFightRequest: function() {
        this._isReq = true;
        if (this._next_btn) this._next_btn.setEnabled(false);
        Loading.add(LANSTR.Loading_txt2, 0);
        var self = this;
        this._fightRequestTimeout = function() {
            self._finishFightRequest();
            NumUnit.prompts(LANSTR.Netty_fail);
            Loading.loadRes(res_main, function() { cc.director.runScene(new MainScene()); });
        };
        this.scheduleOnce(this._fightRequestTimeout, 120);
    },

    onNextStep : function () {
        if (this._isReq || this._replayLoading) return;
        // this._team_floor_1.setVisible(false);
        // this._team_floor_2.setVisible(false);
        // this._team_floor_3.setVisible(false);
        for(var n = 0; n < this._teamNum; n++)
        {
            var index = n + 1
            this["_team_floor_" + index].setVisible(false)
        }

        if(this._select_team != this._teamNum - 1)
        {
            this._select_team = this._select_team + 1;

            this.updateScoll()
            this.initNinja();
            // 更新战斗队伍
            this.updateArmy();

            var index = this._select_team + 1
            this["_team_floor_" + index].setVisible(true);
            var image = "tean_" + index + ".png"
            this._team_one_img.setSpriteFrame(image);

            if(this._select_team == this._teamNum - 1)
            {
                this._next_btn_txt.setString(LANSTR.ShadowSetView_sure);
            }
        }
        else
        {
            var index = this._select_team + 1
            this["_team_floor_" + index].setVisible(true);
            var image = "tean_" + index + ".png"
            this._team_one_img.setSpriteFrame(image);

            for(var n = 0; n < this._teamNum; n++)
            {
                var index = n + 1
                var army = this["army_arr_" + index]
                if(army.length <= 0)
                {
                    NumUnit.prompts(LANSTR["ShadowSetView_"+ index + "duimeiren"]);
                    return
                }
            }


            // 进入战斗
            var heroIdsList = []

            for(var n = 0; n < this._teamNum; n++)
            {
                heroIdsList[n] = ""
                var army_arr = this["army_arr_" + (n+1)]
                for(var i in army_arr) {
                    if(i == (army_arr.length-1))
                        heroIdsList[n] += army_arr[i].config.id;
                    else
                        heroIdsList[n] += army_arr[i].config.id + ",";
                }
            }


            EventDispatcher.shared().addListener(SVRCMD.CrossSet3v3ArenaLineup, function (cmd, data) {
                EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.CrossSet3v3ArenaLineup);
                var errorcode = pkgReader.getPkgError(data);
                if(errorcode) {
                    this._finishFightRequest();
                    return;
                }

                SoundManager.playEffect(res.battleStartBgm);
                Netty.shared().sendPackage(SVRCMD.Cross3v3ArenaFight, [this._npcData.server_id,this._npcData.player_id]);  // 发送战斗数据
            }, this);

            this._beginFightRequest();
            Netty.shared().sendPackage(SVRCMD.CrossSet3v3ArenaLineup, [1, heroIdsList[0], heroIdsList[1], heroIdsList[2]]);

            EventDispatcher.shared().addListener(SVRCMD.Cross3v3ArenaFight, function(cmd, data) {
                EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.Cross3v3ArenaFight);
                var errorcode = pkgReader.getPkgError(data);
                if (errorcode) {
                    this._finishFightRequest();
                    return;
                }

                var bm_arr = [];
                for(var n = 0; n < this._teamNum; n++)
                {
                    var allstr1 = data.data["fightData"+(n+1)] || "";

                    if(allstr1.length > 0)
                    {
                        var datasource1 = getBattleRecData(data.data.useZip, allstr1);
                        if(!datasource1) {
                            this._finishFightRequest();
                            NumUnit.prompts(LANSTR.ERROR_REPLAYDATA+ (n+1));
                            return;
                        }
                        var bm1 = BattleModle.getModleFromString(datasource1.bm.split(","));
                        var rpd1 = new ReplayData(bm1);
                        rpd1.data = datasource1;
                        bm1.replaydata = rpd1;
                        bm1.result = rpd1.data.result;
                        bm1.resetForReplay();

                        bm_arr.push(bm1);
                    }

                }

                //跳转至战斗场景并播放录像
                cc.log("开始播放录像（首次）");

                if (!bm_arr.length) {
                    this._finishFightRequest();
                    NumUnit.prompts(LANSTR.ERROR_REPLAYDATA);
                    return;
                }
                var bm1 = bm_arr[0]
                var bg = Cache.pkBg;
                var resources = NumUnit.prepareLoadingRes(bm_arr);
                resources = resources.concat(res_fight);
                resources = resources.concat([bg]);
                // Loading replaces this scene and runs onExit before its callback.
                // Finish the request while native controls are still alive; the loader owns replay next.
                this._replayLoading = true;
                this._finishFightRequest();
                if (this._next_btn) this._next_btn.setEnabled(false);
                var replayStarted = false;
                Loading.loadRes(resources, function () {
                    if (replayStarted) return;
                        replayStarted = true;
                    var rs = new ReplayScene();
                    rs.setReplayData(bg, bm1, true, bm_arr);
                    cc.director.runScene(rs);
                });

            }, this);
        }
    },

    initNinja : function () {
        // 忍者
        this.hero_arr = [];
        var arr_getHero = [];
        for(var i in gamePlayer.getHeros) {     // 玩家自己的英雄
            if((this._select == Hero.TROOP_ALL) || (this._select == gamePlayer.getHeros[i].config.type)) {
                if (gamePlayer.getHeros[i].has_awake) arr_getHero.push(gamePlayer.getHeros[i]);
            }
        }

        // 避免受其他战斗模块选英雄后改变英雄选中状态影响
        for(var i in arr_getHero) {
            arr_getHero[i].ischoosed = false;
                var index = this._select_team + 1
                for(var j in this["army_arr" +index])
                {
                    if(arr_getHero[i].id == this["army_arr" +index][j].id) {
                        arr_getHero[i].ischoosed = true;
                    }
                }
        }
        this.onSortHero(arr_getHero);

        // 切换页签时先删除之前的
        if(this.scrollView) {
            this.scrollView.removeFromParent();
            this.scrollView = null;
        }

        this.scrollView = ccui.ScrollView.create();
        this.scrollView.setDirection(ccui.ScrollView.DIR_VERTICAL);
        this.scrollView.setTouchEnabled(true);
        this.scrollView.setSize(cc.size(700, 370 - 90));
        this.scrollView.x = this.bg.x - this.scrollView.width/2;
        this.scrollView.y = this.scrollView.height/2 + 30 + 30;
        this.addChild(this.scrollView);

        // 显示对手信息
        this._def_bg = NumUnit.initImage(this.bg.x, this.bg.y + this.bg.height/2 - 76, ShadowRes.opponent_floor, this);
        this._team_one_img = NumUnit.initImage(this._def_bg.x - this._def_bg.width/2 + 90, this._def_bg.y + 25, ShadowRes.tean_1, this);
        var def_txt = NumUnit.initLabel(this._team_one_img.x, this._team_one_img.y - 60, this, Cache.languageConfig.Shadow_duifang, LANSTR.ShadowEmbattleView_duifangzhenrong);
        this.npcArmy(); // 对手阵容

        var innerWidth = this.scrollView.width;
        var innerHeight = (parseInt(arr_getHero.length / 5) + 1) * (100 + this.gap);
        this.scrollView.setInnerContainerSize(cc.size(innerWidth, innerHeight));

        for(var j = 0; j < arr_getHero.length; j++)
        {
            var item = new Cross3v3SetHeroItem(arr_getHero[j], this.army_arr_1, this.army_arr_2, this.army_arr_3, this.army_arr_4, this.army_arr_5, this.army_arr_6, this.army_arr_7, this._select_team, this._teamNum);
            item.x = innerWidth/2 - (item.width + this.gap) * (2 - j%5);
            item.y = this.scrollView.getInnerContainerSize().height - item.height/2 - (item.height + this.gap) * parseInt(j/5) - this.gap/2;
            this.hero_arr.push(item);
            this.scrollView.addChild(this.hero_arr[j]);
        }
    },

    // 对手阵容
    npcArmy : function () {
        // 第一名都不显示，前50名2、3队都不显示，50-500不显示3队，500名以后都显示
        var index = this._select_team + 1

        var def_heros_1 = null;
        if(this._npcData["def_heros_" + index].length > 0) {
            def_heros_1 = JSON.parse(this._npcData["def_heros_" + index]);
        }

        var showTeam = this._teamNum == 7 ? 2 : 1
        if(index > showTeam)
        {
            for(var i = 0; i < 5; i++) {
                NumUnit.initImage(this._def_bg.x - 120 + 90*i, this._def_bg.y, ShadowRes.unknown, this);
            }
        } else {
            if(def_heros_1) {
                for (var i = 0; i < def_heros_1.length; i++) {
                    var icon_id = Hero.getIconByHeroIdNQuality(def_heros_1[i].hero_id, def_heros_1[i].quality);
                    var headImg = NumUnit.initImageTwo(this._def_bg.x - 120 + 90*i, this._def_bg.y, "#head_" + icon_id + ".jpg", "#head_quality_" + def_heros_1[i].quality + ".png", this, 0, 0.5, 0.5);
                    headImg.setScale(0.75);
                    var floor = NumUnit.initImage(20, 20, UiRes.team_level, headImg);
                    NumUnit.initLabel(floor.width/2, floor.height/2, floor, 24, def_heros_1[i].lv);

                    var hero = def_heros_1[i]
                    if(hero.bagate_level && hero.bagate_level> 0){
                        NumUnit.initImage(headImg.width-15, headImg.height-15, NumUnit.getBamenSprite(hero.bagate_level), headImg);
                    }
                    else{
                        NumUnit.initLabelYellow(headImg.width-5, headImg.height-5, headImg, 26, Tails.TAILS_NUM[hero.beast], null, null,0,0,1,1);
                    }
                }
            }
            
        }

    },

    // 英雄按先品质、后等级、最后id排列
    onSortHero : function(arr) {
        arr.sort(function(a, b){
            if(a.quality.quality < b.quality.quality)
                return 1;
            else if(a.quality.quality > b.quality.quality)
                return -1;
            else {
                if(a.level < b.level)
                    return 1;
                else if(a.level > b.level)
                    return -1;
                else {
                    if(a.config.id < b.config.id)
                        return -1;
                    else
                        return 1;
                }
            }
        });

        return arr;
    },

    // 选择页签
    onTableSelect:function(btn) {
        if (this._select == btn.tag)
            return;
        this._select = btn.tag;
        this.initNinja();
        this.sprite_select.y = this.bg.y + this.bg.height / 2 - 75 * (this._select) - 170;
        this.sprite_select.txt.setString(this.tabName[this._select]);

        var str = "tean_" + (this._select_team + 1) + ".png"
        this._team_one_img.setSpriteFrame(str);

        cc.log("切页" + btn.tag);
    },

    // 更新战斗队伍
    updateArmy : function () {
        if(this.armyScrollView)
            this.armyScrollView.removeFromParent();

        this.armyScrollView = ccui.ScrollView.create();
        this.armyScrollView.setDirection(ccui.ScrollView.DIR_HORIZONTAL);
        this.armyScrollView.setTouchEnabled(true);
        this.armyScrollView.setAnchorPoint(cc.p(0, 0));
        this.armyScrollView.setSize(cc.size(750, 180));
        this.armyScrollView.setPosition(this.army_bg.x - this.army_bg.width/2 + 30, this.army_bg.y - 35);
        this.addChild(this.armyScrollView);

        var innerWidth = this.armyScrollView.width;
        var innerHeight = this.armyScrollView.height;
        this.armyScrollView.setInnerContainerSize(cc.size(innerWidth, innerHeight));

        var army_arr = this["army_arr_" + (this._select_team+1)]


        var power = 0;
        for(var i = 0; i < army_arr.length; i++)
        {
            var frame = this.getChildByTag(1000 + i);
            var item = new FightArmyHeroItem(army_arr, i);
            item.setAnchorPoint(cc.p(0,0.5));
            item.x = 8 + (4-i) * 137;
            item.y = this.armyScrollView.height / 2
            this.armyScrollView.addChild(item);
            power += army_arr[i].getPower();
        }

        this._allPower.setString(LANSTR.PkFoeDetial_power + "\n" + power);
    },

    // 选择忍者
    onChooseHero : function (data) {
        var army_arr = [];          // 当前队伍
        var army_other_arr = [];    // 其余队伍

        var index = this._select_team + 1
        army_arr = this["army_arr_" + index];
        //army_other_arr = this.army_arr_2.slice(0);

        for(var i = 0; i < this._teamNum; i++)
        {
            if(i != this._select_team)
            {
                var army = this["army_arr_"+(i+1)]
                for(var n in army) {
                    army_other_arr.push(army[n]);
                }
            }
        }

        for(var i in army_arr) {
            if(army_arr[i].id == data.id) {    // 选择相同忍者
                // 从战斗队伍飞到选择区域
                this.flyBackEffect(data);
                return;
            } else if(army_arr[i].config.id == data.config.id) {
                NumUnit.prompts(LANSTR.FightEmbattleView_notongshishangchang);
                return;
            }
        }

        for(var i in army_other_arr) {
            if(army_other_arr[i].config.id == data.config.id) {
                NumUnit.prompts(LANSTR.ShadowSetView_notchooseotherarmy);
                return;
            }
        }

        if(this["army_index_" + index] >= 5)
        {
            NumUnit.prompts(LANSTR.ShadowSetView_onlyfive);
            return;
        }

        this["army_index_" + index]++;


        for(var i = 0; i < this._teamNum; i++)
        {
            var index = i + 1
            var teamOneString = cc.formatStr(LANSTR["ShadowSetView_team" + index], this["army_index_" + index]);
            this["_team_"+index].setString(teamOneString)
        }

        data.ischoosed = true;
        army_arr.push(data)


        this.onArmySort();
        EventDispatcher.shared().dispatchEvent(EventConst.updateHeroChoosedStatus, [this._select_team, data]);

        // 忍者飞到战斗队伍效果
        this.enterArmyEffect(data);
    },

    // 忍者飞到战斗队伍效果
    enterArmyEffect : function(data) {
        // 计算出起始点
        var obj = null;
        for(var i in this.hero_arr) {
            if(data.id == this.hero_arr[i]._hero.id){
                obj = this.hero_arr[i];
            }
        }
        var star_pos = obj.convertToWorldSpaceAR(cc.p(0.5, 0.5));
        var icon_id = Hero.getHeroAwakenIconId(data);
        var img = NumUnit.initImageTwo(star_pos.x, star_pos.y, "#head_" + icon_id + ".jpg", "#head_quality_" + data.quality.quality + ".png", this, 10);
        var icon_lv = NumUnit.initImage(10, 10, UiRes.team_level, img, 1);
        var txt_lv = NumUnit.initLabel(icon_lv.width/2, icon_lv.height/2, icon_lv, 26, data.level);
        icon_lv.scale = 0.8;
        if(data.id > Hero.Hire_ID_BASE) {
            NumUnit.initImage(icon_lv.x + 20, img.height - 20, UiRes.icon_hire, img, 1);
        }

        var army_arr = this["army_arr_" + (this._select_team + 1)]

        var index = null;
        for(var i in army_arr) {
            if(army_arr[i].id == data.id) {
                index = i;
            }
        }

        // 计算出终点
        var _this = this;
        var end_pos = {x:this.army_bg.x - 275 + (4 - index)*137, y:93};
        var action = cc.MoveTo.create(0.15, cc.p(end_pos.x, end_pos.y));
        img.runAction(cc.Sequence.create(action, cc.CallFunc.create(function(){
            img.removeFromParent();
            img = null;

            _this.updateArmy();
        }, this)));
    },

    // 从战斗队伍飞到选择区域
    flyBackEffect : function(data) {
        var army_arr = this["army_arr_" + (this._select_team + 1)]

        // 起始点
        var index = null;
        for(var i in army_arr) {
            if(army_arr[i].id == data.id) {
                index = i;
            }
        }
        var star_pos = {x:this.army_bg.x - 275 + (4 - index)*137, y:93};
        var icon_id = Hero.getHeroAwakenIconId(data);
        var img = NumUnit.initImageTwo(star_pos.x, star_pos.y, "#head_" + icon_id + ".jpg", "#head_quality_" + data.quality.quality + ".png", this, 10);
        img.setCascadeOpacityEnabled(true);
        var icon_lv = NumUnit.initImage(10, 10, UiRes.team_level, img, 1);
        icon_lv.setCascadeOpacityEnabled(true);
        var txt_lv = NumUnit.initLabel(icon_lv.width/2, icon_lv.height/2, icon_lv, 26, data.level);
        icon_lv.scale = 0.8;
        if(data.id > Hero.Hire_ID_BASE) {
            NumUnit.initImage(icon_lv.x + 20, img.height - 20, UiRes.icon_hire, img, 1);
        }

        // 获取完起始点后更新作战队伍
        data.ischoosed = false;

        for(var i in army_arr) {
            if (army_arr[i].id == data.id) {
                army_arr.splice(i, 1);
                this["army_index_"+(this._select_team + 1)]--;
            }
        }


        for(var i = 0; i < this._teamNum; i++)
        {
            var index1 = i + 1
            var teamOneString = cc.formatStr(LANSTR["ShadowSetView_team" + index1], this["army_index_" + index1]);
            this["_team_"+index1].setString(teamOneString)
        }

        this.onArmySort();
        this.updateArmy();
        EventDispatcher.shared().dispatchEvent(EventConst.updateHeroChoosedStatus, [this._select_team, data]);

        // 终点
        var obj = null;
        var end_pos = null;
        for(var i in this.hero_arr) {
            if(this.hero_arr[i]._hero.id == data.id) {
                obj = this.hero_arr[i];
            }
        }
        if(obj)
            end_pos = obj.convertToWorldSpaceAR(cc.p(0.5, 0.5));
        else
            end_pos = {x:WINSIZE.width/2, y:WINSIZE.height/2};

        var action = cc.MoveTo.create(0.3, cc.p(end_pos.x, end_pos.y));
        var action1 = cc.FadeOut.create(0.15);
        img.runAction(action1);
        img.runAction(cc.Sequence.create(action, cc.CallFunc.create(function(){
            img.removeFromParent();
            img = null;

        }, this)));
    },

    // 战斗队伍忍者排序
    onArmySort : function () {

        var army_arr = this["army_arr_" + (this._select_team + 1)]
        army_arr.sort(function(a, b){
                if(Config.skill[a.config.id].getValByKey("target_point") > Config.skill[b.config.id].getValByKey("target_point")){
                    return 1;
                }else if(Config.skill[a.config.id].getValByKey("target_point") < Config.skill[b.config.id].getValByKey("target_point")){
                    return -1;
                }else{
                    return a.config.id - b.config.id;
                }
        });

    },

    onExit : function () {
        this._finishFightRequest();
        for(var i = 0; i < this.hero_arr.length; i++)
        {
            this.hero_arr[i]._hero.ischoosed = false;
        }
        EventDispatcher.shared().removeListener(EventConst.chooseHero);
        this._super();
    }
});

/**
 * Created by Administrator on 2014/12/8.
 *
 * "规则说明"界面
 */
var Cross3v3Explain = BaseLayer.extend({

    _bg : null,

    ctor : function() {
        this._super();

        this.init_bg();
    },

    init_bg : function() {
        var bg = this._bg = NumUnit.initScale9Sprite(WINSIZE.width/2, WINSIZE.height/2, 800, 500, this, 2);
        NumUnit.initBtnClose(bg.x + bg.width/2 - 10, bg.y + bg.height/2 - 10, this, this.onClose);

        var title_floor = NumUnit.initImage(bg.width/2, bg.height - 30, UiRes.text_di_red, bg);
        var zs_left = NumUnit.initImage(title_floor.x - 220, title_floor.y, UiRes.explain_zs, bg, 1);
        var zs_right = NumUnit.initImage(title_floor.x + 220, title_floor.y, UiRes.explain_zs, bg, 1);
        zs_right.scaleX = -1;
        NumUnit.initLabel(title_floor.width/2, title_floor.height/2, title_floor, 30, "XS 3v3 Awakening Arena", cc.color.YELLOW);

        var intro = NumUnit.initLabel(0, 0, null, 22, "Mở từ cấp 70. Xếp 3 đội ninja đã thức tỉnh, mỗi đội tối đa 5 ninja và không trùng ninja giữa các đội. Thắng 2 hiệp để thắng trận. Có 5 lượt miễn phí mỗi ngày. Mỗi lần mua thêm 1 lượt, giá lần lượt là 100, 200, 300, 400 và 500 kim cương, tối đa 5 lần mỗi ngày. Xóa hồi chiêu tốn 100 kim cương. Thưởng xếp hạng được gửi qua thư lúc 07:30 giờ Việt Nam.", gameColor.orange, null, 720,0,0,1);

        var hei = intro.getContentSize().height + 50;
        if(hei < 420)
            hei = 420;

        // 创建滚动条
        var scrollView = ccui.ScrollView.create();
        scrollView.setDirection(ccui.ScrollView.DIR_VERTICAL);
        scrollView.setSize(cc.size(720, 420));
        scrollView.setInnerContainerSize(cc.size(720, hei));
        scrollView.setPosition(this._bg.x - this._bg.width / 2 + 40, this._bg.y - this._bg.height / 2 + 10);
        this.addChild(scrollView, 2);

        intro.y = hei;
        scrollView.addChild(intro);
    },

    onExit : function() {
        if(this._bg)
            cc.eventManager.removeListeners(this._bg);
        this._super();
    }
});
/**
 * Created by Administrator on 2014/12/8.
 *
 * "对战记录"界面
 */
var Cross3v3FightNotes = BaseLayer.extend({

    scrollView:null,
    scrollBg:null,
    _itemH:106,         // 单个 item 的高度
    gap:8,             // 滚动条间距
    scroll_W:0,         // 滚动条宽 高
    scroll_H:0,

    _pkNotes:null,

    ctor : function() {
        this._super();

        this._pkNotes = [];

        var scrollBg = this.scrollBg = cc.Sprite.create(resPlist.shop_mainpanel);
        scrollBg.x = WINSIZE.width / 2;
        scrollBg.y = WINSIZE.height / 2;
        this.addChild(scrollBg);

        NumUnit.initImage(scrollBg.width/2, scrollBg.height - 27, resPlist.pvp_note_title, scrollBg);

        this.scroll_W = scrollBg.width - 40;
        this.scroll_H = scrollBg.height - 90;

        NumUnit.initBtnClose(scrollBg.x + scrollBg.width / 2 - 10, scrollBg.y + scrollBg.height / 2 - 10, this, this.onClose);

        this.addScroll();
    },

    addScroll : function() {
        EventDispatcher.shared().addListener(SVRCMD.Cross3v3ArenaFightHistory, function(cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.Cross3v3ArenaFightHistory);
            Loading.remove();
            var errorcode = pkgReader.getPkgError(data);
            if (errorcode) {
                return;
            }

            this._pkNotes = data.data.history;
            this.initScroll();
        }, this);

        Loading.add();
        Netty.shared().sendPackage(SVRCMD.Cross3v3ArenaFightHistory, []);
    },

    initScroll : function () {
        var len = this._pkNotes.length;
        if(len <= 0)
            return ;
        else if(len > 15)
            len = 15;

        var all_itemH = (this._itemH + this.gap) * len;      // 全部 items 的总高度
        if(all_itemH < this.scroll_H)
            all_itemH = this.scroll_H;

        // 创建滚动条
        this.scrollView = ccui.ScrollView.create();
        this.scrollView.setDirection(ccui.ScrollView.DIR_VERTICAL);
        this.scrollView.setSize(cc.size(this.scroll_W, this.scroll_H));
        this.scrollView.setInnerContainerSize(cc.size(this.scroll_W, all_itemH));
        this.scrollView.setPosition(this.scrollBg.x - this.scrollBg.width / 2 + 20, this.scrollBg.y - this.scrollBg.height / 2 + 20);
        this.addChild(this.scrollView, 2);

        for(var i = 0; i < len; i++) {
            var item = new Cross3v3NotesItemRender(this._pkNotes[i]);
            item.setPosition((this.scroll_W - item.width) / 2, all_itemH - this._itemH - (this._itemH + this.gap) * i);
            this.scrollView.addChild(item);
        }
    },

    onExit : function () {
        this._pkNotes = null;
        this._super();
    }
});
/**
 * Created by Administrator on 2014/12/9.
 *
 * "英雄榜每个item弹窗界面"
 */
var Cross3v3FoeDetial = BaseLayer.extend({

    _bg : null,

    ctor : function(obj, data){
        this._super();
        this.bgTouch = true;

        var sprite = NumUnit.initScale9Sprite(0,0, 560, 500, null, 2);
        var bg = this._bg = NumUnit.initPopupBg(WINSIZE.width / 2, WINSIZE.height / 2, sprite, this);

        var img_head = NumUnit.initImageTwo(110, bg.height - 60,gamePlayer.getIcon(data.icon), gamePlayer.getFrame(data.icon), bg);
        img_head.scaleX = img_head.scaleY = 0.6;
        var level_floor = NumUnit.initImage(img_head.x + 80, img_head.y, UiRes.team_level, bg);
        NumUnit.initLabel(level_floor.width/2, level_floor.height/2, level_floor, 20, data.player_lv);
        level_floor.scaleX = level_floor.scaleY = 0.9;
        var name = data.player_name;
        if(name.length <= 0)
            name = LANSTR.nonameteam;
        NumUnit.initLabel(img_head.x + 120, img_head.y, bg, 24, name, null,null,0,0,0);

        var txt_rank = NumUnit.initLabel(70, bg.height - 130, bg, 24, LANSTR.ShadowFoeDetial_shangcijiesuanrank, gameColor.orange, null, 0,0,0);
        var txt_win_count = NumUnit.initLabel(txt_rank.x, txt_rank.y - 35, bg, 24, LANSTR.PkFoeDetial_win, gameColor.orange, null, 0,0,0);

        var num_rank = NumUnit.initLabel(260, txt_rank.y, bg, 30, data.rank, null, null, 0,0,0);
        var num_win_count = NumUnit.initLabel(num_rank.x, txt_win_count.y, bg, 24, obj.win_count, null, null, 0,0,0);


        this._teamNum = obj.team_num

        var scroll_W = this._bg.width - 20
        var itemH = 90
        var scroll_H = this._bg.height - 200;
        var tabgap = 3

        var all_itemH = (itemH + tabgap) * this._teamNum - tabgap  // 全部 items 的总高度

        // 创建滚动条
        var scrollView = ccui.ScrollView.create();
        scrollView.setAnchorPoint(cc.p(0.5, 0))
        scrollView.setDirection(ccui.ScrollView.DIR_VERTICAL);
        scrollView.setSize(cc.size(scroll_W, scroll_H));
        scrollView.setInnerContainerSize(cc.size(scroll_W, all_itemH));
        scrollView.setPosition(this._bg.width/2, 10);
        this._bg.addChild(scrollView);

        var x = 0
        var posy = all_itemH  - itemH / 2
        for(var n = 0; n < this._teamNum; n++)
        {
            var item = this.createOneItem(n, obj, data.rank);
            item.x = x
            item.y = posy 
            posy = posy - tabgap - itemH
            scrollView.addChild(item)
        }

    },

    createOneItem : function(index, data, rank)
    {
        var node = cc.Node.create();
        node.setContentSize(cc.size(this._bg.width - 20, 90))
        var posy = 0
        var image = "tean_" + (index+1)
        NumUnit.initImage(50, posy, ShadowRes[image], node);

        var rankShowList = [1, 50, 500, 600, 700, 800, 900]

        var showTeam = this._teamNum == 7 ? 2 : 1

        var def_heros = null;
        if(data["def_heros_" + (index+1)].length > 0) {
            def_heros = JSON.parse(data["def_heros_" + (index + 1)]);
        }
        if(index + 1 > showTeam) 
        {
            for(var i = 0; i < 5; i++) {
                NumUnit.initImage(130+90*i, posy, ShadowRes.unknown, node);
            }
        } else {
            if(def_heros) {
                for (var i = 0; i < def_heros.length; i++) {
                    var icon_id = Hero.getIconByHeroIdNQuality(def_heros[i].hero_id, def_heros[i].quality);
                    var headImg = NumUnit.initImageTwo(130 + 90*i, posy, "#head_" + icon_id + ".jpg", "#head_quality_" + def_heros[i].quality + ".png", node, 0, 0.5, 0.5);
                    headImg.setScale(0.75);
                    var floor = NumUnit.initImage(20, 20, UiRes.team_level, headImg);
                    NumUnit.initLabel(floor.width/2, floor.height/2, floor, 24, def_heros[i].lv);


                    var hero = def_heros[i]
                    if(hero.bagate_level && hero.bagate_level> 0){
                        NumUnit.initImage(headImg.width-15, headImg.height-15, NumUnit.getBamenSprite(hero.bagate_level), headImg);
                    }
                    else{
                        NumUnit.initLabelYellow(headImg.width-5, headImg.height-5, headImg, 26, Tails.TAILS_NUM[hero.beast], null, null,0,0,1,1);
                    }
                }
            }
        }

        return node

    },

    onShowheadItem : function (def_heros, i, yy) {

        var icon_id = Hero.getIconByHeroIdNQuality(def_heros[i].hero_id, def_heros[i].quality);
        var headImg = NumUnit.initImageTwo(130 + 90*i, this._bg.y - yy, "#head_" + icon_id + ".jpg", "#head_quality_" + def_heros[i].quality + ".png", this._bg, 0,0.5,0.5);
        headImg.setScale(0.75);
        var floor = NumUnit.initImage(20, 20, UiRes.team_level, headImg);
        NumUnit.initLabel(floor.width/2, floor.height/2, floor, 24, def_heros[i].lv);
        //NumUnit.initLabelYellow(headImg.width-5, headImg.height-5, headImg, 26, Tails.TAILS_NUM[def_heros[i].beast], null, null,0,0,1,1);
        var hero = def_heros[i]
        if(hero.bagate_level && hero.bagate_level> 0){
            NumUnit.initImage(headImg.width-15, headImg.height-15, NumUnit.getBamenSprite(hero.bagate_level), headImg);
        }
        else{
            NumUnit.initLabelYellow(headImg.width-5, headImg.height-5, headImg, 26, Tails.TAILS_NUM[hero.beast], null, null,0,0,1,1);
        }
    },

    onExit : function() {
        if(this._bg)
            cc.eventManager.removeListeners(this._bg);
        this._super();
    }
});

/**
 * Created by Administrator on 2014/12/8.
 *
 * "影之竞技场" 界面
 */
var Cross3v3MainView = BaseLayer.extend({

    _targe : null,
    _reward_hourly : null,  // 当前排名可累计数值
    _reward_total : null,   // 累计可以领取奖励数值

    _txt_remain:null,       // 剩余次数文字
    _txt_times:null,        // 挑战次数文本
    _txt_time_cold:null,    // 冷却时间文本
    _txt_pk_again:null,     // 可再次挑战
    _img_stone_clear:null,  // 宝石图－重置
    _txt_stone_clear:null,  // 宝石花费－重置
    _btn_clear:null,        // 重置按钮

    _txt_buy:null,          // 花费文字
    _img_stone_buy:null,    // 宝石图－购买
    _txt_stone_cost:null,   // 宝石花费－购买
    _txt_times_buy:null,    // 购买次数
    _btn_buy:null,          // 购买按钮

    _defend_bg : null,      // 防守阵容底

    _def_id_arr : [],       // 防守阵容id

    _myDataInfo : null,     // 竞技场个人信息
    _myRank : null,         // 当前排名
    _fightCount : null,     // 挑战次数
    rankList :[],
    gap : 20,


    ctor:function(targe) {
        this._super();

        this._targe = targe;
        this._def_id_arr = [];
        this.rankList = [];

        MAINSCENE.currentViewStatus = MAINSCENE.CROSS_SHADOW;
    },



    addRes:function() {
        this._super(res_shadow);
    },

    initLayer:function() {
        this._super();

        var bg = this._bg = NumUnit.initImage(WINSIZE.width/2, WINSIZE.height/2 - 20, MapRes.Map_fightgo_bg, this);
        var di = NumUnit.initImage(bg.width/2, bg.height - 55, MapRes.intro_bg, bg, 1);
        di.setScaleY(2.1);
        NumUnit.initBtnBack(50, WINSIZE.height-50, this, this.onClose, 3);

        // 获取个人信息
        EventDispatcher.shared().addListener(SVRCMD.Cross3v3ArenaAllRankInfo, function (cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.Cross3v3ArenaAllRankInfo);
            Loading.remove();
            var errorcode = pkgReader.getPkgError(data);
            if(errorcode || !data.data) {
                return;
            }

            this._rankData = data.data
            this._myDataInfo = this._rankData.my_info;
            this._myRank = this._myDataInfo.cur_rank;

            gamePlayer.crossRankLv = this._myDataInfo.lv


            this.doRankData(this._rankData)
            this.initBg();

        }, this);

        Loading.add();
        Netty.shared().sendPackage(SVRCMD.Cross3v3ArenaAllRankInfo, []);
    },

    doRankData: function(datas)
    {
        for(k in datas)
        {
            var data = datas[k]
            if(k!= "my_info")
            {
                this.rankList.push(data)
            }
        }

        this.rankList.sort(function(a, b) {
            return a.lv - b.lv;
        });
    },


    initBg:function() {
        var level = NumUnit.initLabel(40, this._bg.height - 60, this._bg, 28, "Lv:" + this._myDataInfo.min_lv + "~" + this._myDataInfo.max_lv, null, null, 0,0,0);

        var btn_explain = new cc.MenuItemImage(UiRes.button_small_up, UiRes.button_small_down, this.onExplain, this);
        btn_explain.setPosition(460, level.y);
        NumUnit.initLabelWithStrParser(btn_explain.width/2, btn_explain.height/2, btn_explain,LANSTR.PkView_explain,null,null, null,null, null,null,null, gameColor.btn_yellow,3);

        var btn_rank = new cc.MenuItemImage(UiRes.button_small_up, UiRes.button_small_down, this.onPkRank, this);
        btn_rank.setPosition(btn_explain.x + 130, btn_explain.y);
        NumUnit.initLabelWithStrParser(btn_rank.width/2, btn_rank.height/2, btn_rank,LANSTR.PkView_rank,null,null, null,null, null,null,null, gameColor.btn_yellow,3);

        var btn_fight_notes = new cc.MenuItemImage(UiRes.button_small_up, UiRes.button_small_down, this.onFightNotes, this);
        btn_fight_notes.setPosition(btn_rank.x + 130, btn_explain.y);
        NumUnit.initLabelWithStrParser(btn_fight_notes.width/2, btn_fight_notes.height/2, btn_fight_notes,LANSTR.PkView_notes,null,null, null,null, null,null,null, gameColor.btn_yellow,3);

        var menu = cc.Menu.create(btn_explain, btn_rank, btn_fight_notes);
        menu.setPosition(0,0);
        this._bg.addChild(menu, 3);


        var txt_rank_my = NumUnit.initImage(40, level.y - 60, resPlist.txt_rank_my, this._bg, 2, 0);       // 我的排名
        this._txt_rank_my = NumUnit.initLabelBMF(txt_rank_my.x + 97, txt_rank_my.y+10, this._bg, 16, this._myRank, font.font_rank_fnt, 0);
        this._txt_rank_my.setLocalZOrder(2);

        this.initScorll();
    },

  

    onExplain : function() {
        var explain = new Cross3v3Explain();
        this._targe.addChild(explain, 20);
    },

    onPkRank : function() {
        EventDispatcher.shared().addListener(SVRCMD.Cross3v3ArenaRank, function (cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.Cross3v3ArenaRank);
            Loading.remove();
            var errorcode = pkgReader.getPkgError(data);
            if(errorcode) {
                return;   
            }

            var rank = new Cross3v3RankView(data.data.ranks, this._myDataInfo, this.rankList);
            this._targe.addChild(rank, 20);
        }, this);

        Loading.add();
        var level = this._myDataInfo.lv
        Netty.shared().sendPackage(SVRCMD.Cross3v3ArenaRank, [level]);
    },

    onFightNotes : function() {
        var note = new Cross3v3FightNotes();
        this._targe.addChild(note, 20);
    },

    

    

    initScorll:function()
    {
        var scroll_W = this._bg.width - 40
        var itemW = 200
        var scroll_H = this._bg.height - 158;

        var bg = NumUnit.initScale9Sprite(this._bg.width / 2, scroll_H + 10, scroll_W, scroll_H, this._bg, 1, null, 0.5, 1);


        var len = this.rankList.length;
        var all_itemW = (itemW + this.gap) * this.rankList.length;      // 全部 items 的总高度

        // 创建滚动条
        var scrollView = ccui.ScrollView.create();
        scrollView.setAnchorPoint(cc.p(0, 0))
        scrollView.setDirection(ccui.ScrollView.DIR_HORIZONTAL);
        scrollView.setSize(cc.size(scroll_W, scroll_H));
        scrollView.setInnerContainerSize(cc.size(all_itemW, scroll_H));
        scrollView.setPosition(0, 0);
        bg.addChild(scrollView, 1);


        var offx = 0
        var level = gamePlayer.team_lv
        for(var n = 0; n < this.rankList.length; n++)
        {
            var data = this.rankList[n]
            data.isCanJoin = this._myDataInfo.lv == data.lv
            var item = new Cross3v3MainViewItem(data, this._targe, this, this.rankList);
            item.setAnchorPoint(0, 0)
            item.setPosition((itemW+ this.gap) * n, 0);
            scrollView.addChild(item);

            if(this._myDataInfo.lv == data.lv)
            {             

                offx = (itemW + this.gap) * n
                offx = offx > (all_itemW - scroll_W) ? all_itemW - scroll_W : offx
            }

        }


        var onUpdate = function()
        {

            scrollView.getInnerContainer().setPosition(-offx, 0)
        }

        this.scheduleOnce(onUpdate, 0.1);
    },

    onExit : function() {
        if(this._defend_bg)
        cc.eventManager.removeListeners(this._defend_bg);
        EventDispatcher.shared().removeListenerByDelgate(this);
        this._def_id_arr = [];
        this._super();
    }
});
/**
 * Created by Administrator on 2014/12/9.
 */
ccui.Layout.extend = cc.Class.extend;

var Cross3v3MainViewItem = ccui.Layout.extend({

    _data : null,

    ctor : function (data, mainSec, target, rankList) {
        this._super();

        this._data = data;
        this._target = target
        this._mainSec = mainSec
        this._rankList = rankList
        // bg.anchorX = bg.anchorY = 0;

        // bg.scaleX = 0.8
        // bg.setPosition(0,0);
        // this.addChild(bg);
        var height = 400
        var width = 200
        this.setSize(cc.size(width, height));

        NumUnit.initLabel(width / 2, height - 30, this, 28, "Lv:" + data.min_lv + "~" + data.max_lv, null, null, 0,0,0.5, 1);
        //NumUnit.initLabel(width / 2, height - 60, this, 28, "%" + data.bonus_rate + "Point", null, null, 0,0,0.5, 1);

        var _this = this;
        var info = data.data
        var icon_id = Math.round(info.icon  % 100000)

        var headInfo = Config.player_head[icon_id];
        if(headInfo) var scale = headInfo.scale || 1



        cc.loader.load(["res/character/skeleton_" + icon_id + ".json", "res/character/texture_" + icon_id + ".json", "res/character/texture_" + icon_id + ".png"], function(){

            var armatureHero = DragonBonesNode.create("skeleton_" + icon_id, "texture_" + icon_id, "character_" + icon_id);
            if(!armatureHero)
                return ;

            armatureHero.setPosition(width/ 2, height - 250);
            _this.addChild(armatureHero);
            armatureHero.gotoAndPlay("wait");
            juggler.add(armatureHero);
            _this.armatureHero = armatureHero
            armatureHero.scale = scale
        });

        if(info.server_id != 0)
        {
            NumUnit.initLabel(width / 2, 135, this, 28, "S" + info.server_id, null, null, 0,0,0.5, 1);
        }


        var playerName = info.player_name
        if(playerName == null || playerName == "") {
            playerName = LANSTR.AboardView_txt_name
        }


        NumUnit.initLabel(width / 2, 95, this, 28, playerName, null, null, 0,0,0.5, 1);
    
        var join_btn = NumUnit.initButtonUI(resPlist.activity_join, resPlist.activity_join, this.toJoin, this);
        join_btn.setPosition(width/2, 35);
        this.addChild(join_btn)

        if(data.isCanJoin) 
            join_btn.setColor(cc.color(255, 255, 255))
        else
            join_btn.setColor(cc.color(80, 80, 80))
    },

    toJoin : function () {
        if(!this._data.isCanJoin) return
        if(this._target) this._target.removeFromParent()
        var layer = new Cross3v3View(this._mainSec, this._rankList);
        if(this._mainSec) this._mainSec.addChild(layer, tagMain.NINJA_MAIN_LAYER, this.popupTag);
    },

    onExit:function() {
        if(this.armatureHero)
            juggler.remove(this.armatureHero);
        this._super();
    }

});
/**
 * Created by Administrator on 2014/12/9.
 */
ccui.Layout.extend = cc.Class.extend;

var Cross3v3NotesItemRender = ccui.Layout.extend({

    _data : null,

    ctor : function (data) {
        this._super();

        this._data = data;
        this.initBg();
    },

    initBg : function() {
        var bg = NumUnit.initImage(0,0,resPlist.pvp_panel, this, 0,0,0);
        this.setSize(cc.size(bg.width, bg.height));

        var wincount = 0
        var vaildCount = 0
        var teamMax = 3
        for(var i = 1; i <= teamMax; i++)
        {
            if(this._data["is_atk_win_" + i] == 1)
            {
                wincount++
            }

            if(this._data["is_atk_win_" + i] != 3)
            {
                vaildCount++
            }
        }
        var is_win = (wincount >= Math.ceil(vaildCount/2))

        if(!Netty.isHistoryAttacker(this._data))
        {
            is_win = !is_win
        }



        if (this._data.viewer_is_win !== undefined) is_win = Number(this._data.viewer_is_win) === 1;
        var rankChange = this._data.viewer_rank_change !== undefined ? Number(this._data.viewer_rank_change) :
            (Netty.isHistoryAttacker(this._data) ? Number(this._data.rank_change || 0) : -Number(this._data.rank_change || 0));

        if(is_win) {
            NumUnit.initImage(55, bg.height/2, resPlist.pvp_icon_win, this);
            if(rankChange > 0) {
                var img_up = NumUnit.initImage(120, 65, resPlist.pvp_icon_up, this);
                NumUnit.initLabel(img_up.x+3, img_up.y - 42, this, 26, Math.abs(rankChange), gameColor.gold);
            }
        } else {
            NumUnit.initImage(55, bg.height/2, resPlist.pvp_icon_lose, this);
            //if(is_win == 2 && this._data.def_id == gamePlayer.id) {
            if(rankChange < 0) {
                var img_down = NumUnit.initImage(120, 65, resPlist.pvp_icon_down, this);
                NumUnit.initLabel(img_down.x+3, img_down.y - 42, this, 26, Math.abs(rankChange), gameColor.gold);
            }
        }

        // 头像
        var iconId = Netty.isHistoryAttacker(this._data) ? this._data.def_icon : this._data.atk_icon
        var icon = NumUnit.initImageTwo(210, bg.height/2, gamePlayer.getIcon(iconId), gamePlayer.getFrame(iconId), this);
        icon.setScale(0.75);

        var name_floor = NumUnit.initImage(320, 70, resPlist.rank_name_floor, this, 0, 0);
        var foe_name = "";
        if(Netty.isHistoryAttacker(this._data))
            foe_name = this._data.def_name;
        else
            foe_name = this._data.atk_name;
        if(foe_name == "")
            foe_name = LANSTR.nonameteam;
        var txt_name = NumUnit.initLabel(name_floor.width/2, name_floor.height/2, name_floor, 24, foe_name);
        var img_level = NumUnit.initImage(name_floor.x, name_floor.y, resPlist.lv_iron_floor, this);
        var level = Netty.isHistoryAttacker(this._data) ? this._data.def_lv : this._data.atk_lv
        var txt_level = NumUnit.initLabel(img_level.x + 20, img_level.y, this, 24, level, cc.color.BLACK);
        var txt_time = NumUnit.initLabel(img_level.x - img_level.width/2, 20, this, 26, "", null, null, 0,0,0);

        var time_gap = null;
        var gap = (Cache.getServerTime() - this._data.create_time * 1000) / 1000;
        if(gap < 60) {
            time_gap = Math.floor(gap) + LANSTR.secondbefore;
        } else if(gap < 3600) {
            time_gap = Math.floor(gap/60) + LANSTR.minutebefore;
        } else if(gap < 3600*24) {
            time_gap = Math.floor(gap/3600) + LANSTR.hourbefore;
        } else {
            time_gap = LANSTR.onedaybefore;
        }
        txt_time.setString(time_gap);

        // 查看按钮
        var btn_video = NumUnit.initButtonUI(ShadowRes.shadow_check, ShadowRes.shadow_check, this.onVideo, this);
        btn_video.setPosition(820, bg.height/2);
        this.addChild(btn_video);
    },

    onVideo:function() {
        var layer = new Cross3v3NotesView(this._data);
        cc.director.getRunningScene().addChild(layer, 2);
    }
});
/**
 * Created by Administrator on 2014/12/9.
 */
ccui.Layout.extend = cc.Class.extend;

var Cross3v3RankItemRender = ccui.Layout.extend({

    _data : null,

    ctor : function (data, lv) {
        this._super();

        this._data = data;
        this.lv = lv

        var bg = null;

        if(this._data.rank <= 3) {
            bg = NumUnit.initButtonUI("#pvp_panel_" + this._data.rank + ".png", "#pvp_panel_" + this._data.rank + ".png", this.onShow, this);
            NumUnit.initImage(70, bg.height/2, resPlist.rank_floor, this);
            NumUnit.initImage(70, bg.height/2, "#pvp_win_" + this._data.rank + ".png", this);
        } else {
            bg = NumUnit.initButtonUI(resPlist.pvp_panel, resPlist.pvp_panel, this.onShow, this);
            NumUnit.initLabelBMF(70, 75, this, 30, this._data.rank, font.font_rank_fnt);
        }
        bg.anchorX = bg.anchorY = 0;

        bg.scaleX = 0.8
        bg.setPosition(0,0);
        this.addChild(bg);
        this.setSize(cc.size(bg.width * 0.8, bg.height));


        // 头僝
        var icon = NumUnit.initImageTwo(190, bg.height/2, gamePlayer.getIcon(this._data.icon), gamePlayer.getFrame(this._data.icon), this);
        icon.setScale(0.75);

        //var name_floor = NumUnit.initImage(320, bg.height/2, resPlist.rank_name_floor, this, 0, 0);
        var player_name = this._data.player_name;
        if(player_name == "")
            player_name = LANSTR.nonameteam;

        var txt_name = NumUnit.initLabel(320, bg.height/2 + 20, this, 24, player_name);
        var txt_server = NumUnit.initLabel(680, txt_name.y, this, 24, "S" + this._data.server_id, cc.color.WHITE, null, null, null, 1, 0.5);
        var img_level = NumUnit.initImage(320, bg.height/2 - 20, resPlist.lv_iron_floor, this);
        var txt_level = NumUnit.initLabel(img_level.x + 20, img_level.y, this, 24, this._data.player_lv, cc.color.BLACK);
        var txt_guild = NumUnit.initLabel(680, img_level.y, this, 24, this._data.group_name || "", cc.color.WHITE, null, null, null, 1, 0.5);
    },

    onShow:function() {
        EventDispatcher.shared().addListener(SVRCMD.CrossPlayer3v3ArenaInfo, function(cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.CrossPlayer3v3ArenaInfo);
            Loading.remove();
            var errorcode = pkgReader.getPkgError(data);
            if (errorcode) {
                return;
            }

            var detial = new Cross3v3FoeDetial(data.data, this._data);
            cc.director.getRunningScene().addChild(detial, 2);
        }, this);

        Loading.add();
        Netty.shared().sendPackage(SVRCMD.CrossPlayer3v3ArenaInfo, [this.lv, this._data.server_id, this._data.fighter_id]);
    }
});

/**
 * Created by Administrator on 2014/12/8.
 *
 * "排行榜"界面
 */
var Cross3v3RankView = BaseLayer.extend({

    _tableView:null,
    _ranks:null,        // 所有排名信息
    _len:0,

    _itemH:106,         // 单个 item 的高度
    gap:8,              // 滚动条间距
    scrollBg : null,
    scroll_W : null,
    scroll_H : null,
    tabName :{
    },

    ctor : function(ranks, myDataInfo, rankList) {
        this._rankLoading=false;
        this.tabName = {}
        this._select = myDataInfo.lv
        this._myDataInfo = myDataInfo
        this._rankList = rankList
        this._ranks = ranks
        this._super();
        this.initTab()
    },

    // 初值数据
    updateData: function(ranks)
    {
        if(this.scrollView)
        {
            this.scrollView.removeFromParent();
            this.scrollView=null;
        }

        if(this._tierLabel){
            for(var t=0;t<this._rankList.length;t++){var tier=this._rankList[t];if(tier.lv==this._select)this._tierLabel.setString("Lv:"+tier.min_lv+"~"+tier.max_lv);}
        }
        this._ranks = [];

        for(var i in ranks) {
            this._ranks.push(ranks[i]);
        }
        // 排序
        this._ranks.sort(function(foe_1,foe_2) {
            if(foe_1.rank < foe_2.rank) {
                return -1;
            } else {
                return 1;
            }
        });

        var scale = 0.8
        var scrollBg = this._scrollBg
        this.scroll_W = (scrollBg.width - 40)*scale;
        this.scroll_H = scrollBg.height - 90;

        var len = this._ranks.length;
        if(len <= 0)
            return;

        var all_itemH = (this._itemH + this.gap) * len;      // 全部 items 的总高度
        if(all_itemH < this.scroll_H)
            all_itemH = this.scroll_H;

        // 创建滚动条
        this.scrollView = ccui.ScrollView.create();
        this.scrollView.setAnchorPoint(cc.p(0.5, 0))
        this.scrollView.setDirection(ccui.ScrollView.DIR_VERTICAL);
        this.scrollView.setSize(cc.size(this.scroll_W, this.scroll_H));
        this.scrollView.setInnerContainerSize(cc.size(this.scroll_W, all_itemH));
        this.scrollView.setPosition(this.scrollBg.x, this.scrollBg.y - this.scrollBg.height / 2);
        this.addChild(this.scrollView, 2);

        for(var i = 0; i < len; i++) {
            var item = new Cross3v3RankItemRender(this._ranks[i], this._select);
            item.setPosition((this.scroll_W - item.width) / 2, all_itemH - this._itemH - (this._itemH + this.gap) * i);
            this.scrollView.addChild(item);
        }
    },

    // 自己数据
    initLayer: function()
    {
        var scale = 0.8
        this.bgScale = scale
        var scrollBg = this.scrollBg = cc.Sprite.create(resPlist.shop_mainpanel);
        scrollBg.x = WINSIZE.width / 2 + 40;
        scrollBg.y = WINSIZE.height / 2 - 20;
        this.addChild(scrollBg, 2);
        scrollBg.scaleX = scale
        scrollBg.scaleY = 1.05
        this._scrollBg = scrollBg

        NumUnit.initImage(scrollBg.width / 2, scrollBg.height - 27, resPlist.pvp_rank_title, scrollBg);
        NumUnit.initBtnClose(scrollBg.x + scrollBg.width *scale / 2 - 10, scrollBg.y + scrollBg.height / 2 - 10, this, this.onClose, 3);

        var x = this.scrollBg.x - this.scrollBg.width/2 * this.bgScale - 60;
        var myInfoNode = cc.Node.create();
        this.addChild(myInfoNode, 2)
        myInfoNode.setPosition(x, this.scrollBg.width/2 + 65)

        var level = this._tierLabel = NumUnit.initLabel(180, 3, myInfoNode, 28, "Lv:" + this._myDataInfo.min_lv + "~" + this._myDataInfo.max_lv, null, null, 0,0,0);
        var txt_rank_my = NumUnit.initImage(400, 2, resPlist.txt_rank_my, myInfoNode, 2, 0);       // 我的排名
        this._txt_rank_my = NumUnit.initLabelBMF(txt_rank_my.x + 97, txt_rank_my.y+10, myInfoNode, 16, this._myDataInfo.cur_rank || "9999", font.font_rank_fnt, 0);

        this.updateData(this._ranks)
    },

    // 页签
    initTab:function() {

        var scroll_W = 154
        var itemH = 74
        var scroll_H = this.scrollBg.height - 50;

        var len = this._ranks.length;


        var all_itemH = (itemH + this.gap) * this._rankList.length;      // 全部 items 的总高度
        if(all_itemH < scroll_H)
            all_itemH = scroll_H;

        // 创建滚动条
        var scrollView = ccui.ScrollView.create();
        scrollView.setAnchorPoint(cc.p(0.5, 0))
        scrollView.setDirection(ccui.ScrollView.DIR_VERTICAL);
        scrollView.setSize(cc.size(scroll_W, scroll_H));
        scrollView.setInnerContainerSize(cc.size(scroll_W, all_itemH));
        var x = this.scrollBg.x - this.scrollBg.width/2 * this.bgScale - 35;
        scrollView.setPosition(x, this.scrollBg.y - this.scrollBg.height / 2);
        this.addChild(scrollView, 1);

        var offy = 0
        for(var n = 0; n < this._rankList.length; n++)
        {
            var data = this._rankList[n]
            var tag = data.lv
            var btn = NumUnit.initButtonUI(resPlist.tap_up, resPlist.tap_up, this.onTableSelect, this);
            btn.scaleX = -1;
            btn.x = btn.getContentSize().width / 2
            btn.y = all_itemH  - itemH / 2 - (itemH + this.gap) * n
            btn.tag = tag;

            this.tabName[tag] = data.min_lv + "~" + data.max_lv

            var txt = NumUnit.initLabelBlack(btn.x - 5, btn.y, scrollView, Cache.languageConfig.ShopNinja_labelSize, this.tabName[btn.tag], null, null, 110);       // 页签上的文字
            txt.setLocalZOrder(4);

            if(this._select == tag)
            {
                this.addSelectImge(scrollView, btn);

                offy = (itemH + this.gap) * (this._rankList.length - 1 - n)
                offy = offy > (all_itemH - scroll_H) ? all_itemH - scroll_H : offy
            }

            scrollView.addChild(btn);
        }

        var onUpdate = function()
        {

            scrollView.getInnerContainer().setPosition(0, -offy)
        }

        this.scheduleOnce(onUpdate, 0.1);
    },

    addSelectImge: function(node, btn)
    {
        // 选中页签时加一层假的覆盖其上
        this.sprite_select = cc.Sprite.create(resPlist.tap_down);
        this.sprite_select.scaleX = -1
        this.sprite_select.setPosition(btn.getPosition())

        // 页签上的文字
        this.selectedLabel = NumUnit.initLabelBlack(this.sprite_select.x-Cache.languageConfig.ShopNinja_labelDx+10, this.sprite_select.y, node, Cache.languageConfig.ShopNinja_labelSize, this.tabName[this._select], gameColor.gold2, null, 110);
        node.addChild(this.sprite_select, 5);
        this.selectedLabel.setLocalZOrder(6);
    },

    // 选择页签
    onTableSelect:function(btn) {
        if(this._rankLoading || this._select == btn.tag)
            return ;
        this._select = btn.tag;
        this._rankLoading=true;
        this.updateData([]);

        this.sprite_select.setPosition(btn.getPosition())
        this.selectedLabel.setPosition(this.sprite_select.x-Cache.languageConfig.ShopNinja_labelDx+10, this.sprite_select.y)
        this.selectedLabel.setString(this.tabName[this._select])

        // 重新创建页面
        EventDispatcher.shared().addListener(SVRCMD.Cross3v3ArenaRank, function (cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.Cross3v3ArenaRank);
            Loading.remove();
            this._rankLoading=false;
            var errorcode = pkgReader.getPkgError(data);
            if(errorcode) {
                return;
            }

            this.updateData(data.data.ranks);
        }, this);

        Loading.add();
        Netty.shared().sendPackage(SVRCMD.Cross3v3ArenaRank, [this._select]);
    },

    onExit : function() {
        EventDispatcher.shared().removeListenerByDelgate(this);
        if(this._rankLoading)Loading.remove();
        this._rankLoading=false;
        this._ranks = null;
        this._super();
    }
});

/**
 * Created by Administrator on 2014/12/9.
 */

ccui.Layout.extend = cc.Class.extend;

var Cross3v3SetHeroItem = ccui.Layout.extend({

    _hero: null,
    _choosedImg: null,
    _grey: null,

    _team_img_1: null,
    _team_img_2: null,
    _team_img_3: null,
    _team_img_4: null,
    _team_img_5: null,
    _team_img_6: null,
    _team_img_7: null,

    _army_1: [],
    _army_2: [],
    _army_3: [],
    _army_4: [],
    _army_5: [],
    _army_6: [],
    _army_7: [],
    _resTeam :["tean_one", "tean_two", "tean_three", "tean_four", "tean_five", "tean_six", "tean_seven"],

    ctor: function(hero, army_1, army_2, army_3, army_4, army_5, army_6, army_7,select_team, totalTeam) {
        this._super();

        this._hero = hero;
        this._army_1 = army_1;
        this._army_2 = army_2;
        this._army_3 = army_3;
        this._army_4 = army_4;
        this._army_5 = army_5;
        this._army_6 = army_6;
        this._army_7 = army_7;
        this._totalNum = totalTeam

        this.anchorX = this.anchorY = 0.5;

        var icon_id = Hero.getHeroAwakenIconId(this._hero);

        var itemBg = NumUnit.initButtonUI("#head_" + icon_id + ".jpg", "#head_" + icon_id + ".jpg", function() {
            cc.log(this._hero.config.name);
            this.onClickFrame();
        }, this);

        this.setSize(cc.size(itemBg.width, itemBg.height));
        itemBg.setPosition(itemBg.width / 2, itemBg.height / 2);
        this.addChild(itemBg);

        var icon_lv = NumUnit.initImage(10, 10, UiRes.team_level, this, 1);
        var txt_lv = NumUnit.initLabel(icon_lv.width / 2, icon_lv.height / 2, icon_lv, 26, this._hero.level);
        icon_lv.scale = 0.8;

        var kuangImg = NumUnit.initImage(itemBg.x, itemBg.y, "#head_quality_" + this._hero.quality.quality + ".png", this);

        var beast = 0
        for (id in this._hero.beasts)
        {
            ++beast;
        }

        if(this._hero.bagate_level && this._hero.bagate_level> 0){
            NumUnit.initImage(kuangImg.width-15, kuangImg.height-15, NumUnit.getBamenSprite(this._hero.bagate_level), kuangImg);
        }
        else{
            NumUnit.initLabelYellow(kuangImg.width - 5, kuangImg.height - 5, kuangImg, 26, Tails.TAILS_NUM[beast], null, null, 0, 0, 1, 1);
        }



        this._grey = cc.Sprite.create();
        this._grey.setTextureRect(cc.rect(0, 0, 114, 114));
        this._grey.setColor(cc.color(0, 0, 0, 0));
        this._grey.setAnchorPoint(cc.p(0, 0));
        this._grey.setPosition(-8, -8);
        this.addNode(this._grey, 2);
        this._grey.setVisible(false);
        this._grey.setOpacity(100);

        for(var i = 0; i < totalTeam; i++)
        {
            var index =i + 1
            this["_team_img_" + index] = NumUnit.initImage(this.width / 2, this.height - 15, ShadowRes[this._resTeam[i]], this);
            this["_team_img_" + index].setVisible(false);
        }

        // this._team_img_1 = NumUnit.initImage(this.width / 2, this.height - 15, ShadowRes.tean_one, this);
        // this._team_img_1.setVisible(false);
        // this._team_img_2 = NumUnit.initImage(this.width / 2, this.height - 15, ShadowRes.tean_two, this);
        // this._team_img_2.setVisible(false);
        // this._team_img_3 = NumUnit.initImage(this.width / 2, this.height - 15, ShadowRes.tean_three, this);
        // this._team_img_3.setVisible(false);

        this._choosedImg = NumUnit.initImage(this.width - 20, this.height / 2 - 20, MapRes.icon_choosed, this);
        this._choosedImg.setVisible(false);

        // 判断是否被三个中当前队伍选中
        var army = this["_army_" + (select_team + 1)]

        if (army)
        {
            for (var i in army)
            {
                if (this._hero.id == army[i].id)
                {
                    this._hero.ischoosed = true;
                    this._choosedImg.setVisible(true);
                }
            }
        }

        // 判断被哪个队伍选中

        for(var n = 0; n < totalTeam; n++)
        {
            var armytemp = this["_army_" + (n + 1)]
            for (var i in armytemp)
            {
                if (this._hero.id == armytemp[i].id)
                {
                    this["_team_img_" + (n+1)].setVisible(true);
                    this._grey.setVisible(true);
                }
            }
        }

        // 切换页签时判断
        for (var i in army)
        {
            if (this._hero.config.id == this._hero.config.id && this._hero.ischoosed)
                this._choosedImg.setVisible(true);
        }
        if (this._hero.ischoosed)
        {
            this._grey.setVisible(true);
            //this._choosedImg.setVisible(true);
        }

        // 更新被item被选中状态
        EventDispatcher.shared().addListener(EventConst.updateHeroChoosedStatus, function(cmd, data) {
            this.updateItemStatus(data);
        }, this);
    },

    onClickFrame: function() {
        EventDispatcher.shared().dispatchEvent(EventConst.chooseHero, [this._hero]);
    },

    updateItemStatus: function(data) {
        var index = data[0];
        var obj = data[1];
        if(obj.id != this._hero.id) return
        //this._hero = obj;

        var army_arr = [];
        for(var n = 0; n < this._totalNum;  n++)
        {
            var id = n + 1
            if (index == n)
            {
                this["_team_img_"+ id].setVisible(false);

                for (var i in this["_army_" + id])
                {
                    army_arr.push(this["_army_" + id][i]);
                }
            } 
        }

        if (obj.ischoosed)
        {
            this._grey.setVisible(true);
            this._choosedImg.setVisible(true);

            this["_team_img_" + (index+1)].setVisible(true);
        }
        else
        {
            this._grey.setVisible(false);
            this._choosedImg.setVisible(false);
        }
    },

    onExit: function() {
        EventDispatcher.shared().removeListener(EventConst.updateHeroChoosedStatus);
        this._super();
    }
});

/**
 * Created by Administrator on 2014/12/8.
 *
 * "防守阵容调整界面"
 */
var Cross3v3SetView = BaseLayer.extend({

    _def_id_arr : null,     // 三组防守阵容Id
    size : null,
    bg : null,
    army_bg : null,
    _select : 0,            // 当前选中页签
    sprite_select : null,   // 页签选中时，加一层图在上面

    hero_arr : null,        // 所获得的hero(根据页签变化)
    scrollView : null,      // 所有忍者列表
    armyScrollView : null,  // 准备战斗队伍列表
    gap : 30,               // 滚动条各元素间距

    army_arr_1 : [],      // 准备战斗队伍一队
    army_arr_2 : [],      // 准备战斗队伍二队
    army_arr_3 : [],    // 准备战斗队伍三队
    army_arr_4 : [],    // 准备战斗队伍四队
    army_arr_5 : [],    // 准备战斗队伍五队
    army_arr_6 : [],    // 准备战斗队伍六队
    army_arr_7 : [],    // 准备战斗队伍七队

    army_index_1 : 0,     // 已进一队战斗队伍的个数
    army_index_2 : 0,     // 已进二队战斗队伍的个数
    army_index_3 : 0,   // 已进三队战斗队伍的个数
    army_index_4 : 0,     // 已进一队战斗队伍的个数
    army_index_5 : 0,     // 已进二队战斗队伍的个数
    army_index_6 : 0,   // 已进三队战斗队伍的个数
    army_index_7 : 0,   // 已进三队战斗队伍的个数

    // 按钮文字
    _team_1 : null,       // 1队
    _team_2 : null,       // 2队
    _team_3 : null,     // 3队
    _team_4 : null,       // 1队
    _team_5 : null,       // 2队
    _team_6 : null,     // 3队
    _team_7 : null,     // 3队



    _team_floor_1 : null,
    _team_floor_2 : null,
    _team_floor_3 : null,
    _team_floor_4 : null,
    _team_floor_5 : null,
    _team_floor_6 : null,
    _team_floor_7 : null,
    _select_team : 0,       // 当前选中队伍

    _next_btn : null,       // 下一步按钮
    _next_btn_txt : null,   // 下一步按钮上文字

    _allPower : null,       // 总战斗力

    tabName:[],

    ctor : function(def_id_arr) {
        this._super();
        this.size = cc.director.getWinSize();

        this.tabName.push(LANSTR.FightEmbattleView_tabName01);
        this.tabName.push(LANSTR.FightEmbattleView_tabName02);
        this.tabName.push(LANSTR.FightEmbattleView_tabName03);
        this.tabName.push(LANSTR.FightEmbattleView_tabName04);

        this._def_id_arr = def_id_arr;

        this.army_arr_1 = [];
        this.army_arr_2 = [];
        this.army_arr_3 = [];
        this.army_arr_4 = [];
        this.army_arr_5 = [];
        this.army_arr_6 = [];
        this.army_arr_7 = [];

        this._teamNum = def_id_arr.length

        for(var n = 0; n < this._teamNum; n++)
        {
            var army = def_id_arr[n]
            var index = n + 1

            // 初始化防守队伍
            if(!army) {
                if(n == 0)
                {
                    var arr = gameArmy.pk_def_str.split(",");
                    for(var i in arr) {
                        var id = Number(arr[i]);
                        for(var j in gamePlayer.getHeros) {
                            if(id == gamePlayer.getHeros[j].id)
                                this.army_arr_1.push(gamePlayer.getHeros[j]);
                        }
                    }
                }
                else
                {
                    this["army_arr_" + index] = []
                }

            } else {
                for(var i in army) {
                    for(var j in gamePlayer.getHeros) {
                        if(army[i] == gamePlayer.getHeros[j].id)
                            this["army_arr_" + index].push(gamePlayer.getHeros[j]);
                    }
                }
            }

        }

        // 初始化防守队伍

        for(var i = 0; i < this._teamNum; i++)
        {
            var index = i + 1
            if(this["army_arr_"+index].length > 5)
                this["army_arr_"+index]= [];
            this["army_index_" + index] = this["army_arr_"+index].length;
        }

        this.init_bg();
        gamePlayer.updateHerosSort();

        this.initNinja();   // 按类型显示忍者
        this.onArmySort();
        this.updateArmy();  // 战斗队伍

        EventDispatcher.shared().addListener(EventConst.chooseHero, function(cmd, data){
            this.onChooseHero(data[0]);
        }, this);
    },

    init_bg : function() {
        this.bg = cc.Sprite.create(MapRes.board_fight_choose);
        this.bg.anchorX = 0.5;
        this.bg.anchorY = 0.5;
        this.bg.x = WINSIZE.width/2 - 30;
        this.bg.y = WINSIZE.height/2 + 80;
        this.addChild(this.bg);

        // 回退按钮
        NumUnit.initBtnBack(50, WINSIZE.height-50, this, this.onClose);

        // 准备作战忍者背景图
        this.army_bg = NumUnit.initImage(this.size.width/2 - 80, 40, MapRes.board_choosed, this);
        for(var j = 0; j < 5; j++) {
            var icon_bg = NumUnit.initImage(this.army_bg.x - 275 + j*137, 48, UiRes.kuang_ninja, this);
            icon_bg.setTag(1004 - j);
            NumUnit.initImage(icon_bg.x, 93, MapRes.board_choosed_frame, this);
        }

        // 页签
        var table_select = cc.Menu.create();
        for(var i = 0; i < MAPCONST.PK_EMBATTLE_TAB_NUM; i++)
        {
            var btn = new cc.MenuItemImage(resPlist.tap_up, resPlist.tap_up, this.onTableSelect, this);
            btn.anchorX = 1;
            btn.x = this.bg.x + this.bg.width/2 + btn.width - 38;
            btn.y = this.bg.y + this.bg.height/2 - 85 * i - 90;
            btn.tag = Hero.TROOP_ALL + i;
            NumUnit.initLabelBlack(btn.width - 30, btn.height / 2, btn, 28, this.tabName[i], null, null, 0, 0, 1);   // 页签上的文字
            table_select.addChild(btn);
        }
        table_select.setPosition(0,0);
        this.addChild(table_select, 0);

        // 选中页签时加一层假的覆盖其上
        this.sprite_select = cc.Sprite.create(resPlist.tap_down);
        this.sprite_select.anchorX = 1;
        this.sprite_select.x = btn.x;
        this.sprite_select.y = this.bg.y + this.bg.height / 2 - 85 * (this._select % 1000) - 90;
        // 页签上的文字
        this.sprite_select.txt = NumUnit.initLabelBlack(this.sprite_select.width - 30, this.sprite_select.height / 2, this.sprite_select, 28, this.tabName[0], gameColor.brown, null, 0, 0, 1);
        this.addChild(this.sprite_select, 2);

        // 左侧队伍页签按钮
        this.initTeamTab()

        // 下一步按钮
        this._next_btn = new cc.MenuItemImage(UiRes.button_middle_up, UiRes.button_middle_down, this.onNextStep, this);
        this._next_btn.setPosition(this.size.width - 130, 80);
        this._next_btn_txt = NumUnit.initLabelYellow(this._next_btn.width/2, this._next_btn.height/2, this._next_btn, Cache.languageConfig.ShadowNext_labelSize, LANSTR.ShadowSetView_next);
        var menu_next = cc.Menu.create(this._next_btn);
        menu_next.setPosition(0, 0);
        this.addChild(menu_next);

        // 总战斗力
        this._allPower = NumUnit.initLabel(this._next_btn.x, 150, this, Cache.languageConfig.PkTeamSet_powerSize, LANSTR.PkFoeDetial_power + "\n0");
        this._allPower.setHorizontalAlignment(cc.TEXT_ALIGNMENT_CENTER);
    },


    // 队伍标签
    initTeamTab : function()
    {
        var scroll_W = 200
        var itemH = 90
        var scroll_H = 430;
        var allowH = 50
        var tabgap = 1

        var all_itemH = (itemH + tabgap) * this._teamNum + (allowH+tabgap) * (this._teamNum -1)   // 全部 items 的总高度

        // 创建滚动条
        var scrollView = ccui.ScrollView.create();
        scrollView.setAnchorPoint(cc.p(0.5, 0.5))
        scrollView.setDirection(ccui.ScrollView.DIR_VERTICAL);
        scrollView.setSize(cc.size(scroll_W, scroll_H));
        scrollView.setInnerContainerSize(cc.size(scroll_W, all_itemH));
        var x = this.bg.x - this.bg.width/2-5;
        scrollView.setPosition(x, this.bg.y - 70);
        this.addChild(scrollView, 0);

        var posy = all_itemH  - itemH / 2
        for(var n = 0; n < this._teamNum; n++)
        {
            var index = n + 1
            var btn = NumUnit.initButtonUI(ShadowRes.choose_bg, ShadowRes.choose_bg, this.chooseTeam, this);
            btn.x = btn.getContentSize().width / 2 + 2
            btn.y = posy
            btn.tag = n

            var image = index          
            this["_team_floor_" + index] = NumUnit.initImage(btn.width/2, btn.height/2, ShadowRes["team_floor_" + image], btn);
            var teamOneString = cc.formatStr(LANSTR["ShadowSetView_team" + index], this["army_index_" + index])
            this["_team_" + index] = NumUnit.initLabelBlack(btn.width/2, btn.height/2, btn, 22, teamOneString);
            this["_team_floor_" + index].setVisible(n==0)

            scrollView.addChild(btn);

            //箭头
            posy = posy - tabgap - itemH
            NumUnit.initImage(btn.x, posy + 20, ShadowRes.next_arrows, scrollView);

            posy = posy - tabgap - allowH
        }

        this._scrollView = scrollView
    },

    updateScoll : function()
    {
        if(!this._scrollView) return
        var scroll_W = 200
        var itemH = 90
        var scroll_H = 380;
        var allowH = 50
        var tabgap = 1
        var all_itemH = (itemH + tabgap) * this._teamNum + (allowH+tabgap) * (this._teamNum -1)   // 全部 items 的总高度

        var offy = (itemH + tabgap +allowH) * (this._teamNum - 1 - this._select_team)
        offy = offy > (all_itemH - scroll_H) ? all_itemH - scroll_H : offy

        var onUpdate = function()
        {

            this._scrollView.getInnerContainer().setPosition(0, -offy)
        }

        this.scheduleOnce(onUpdate, 0.02);
    },


    chooseTeam : function (btn) {
        if(this._select_team == btn.tag)
            return;

        for(var n = 0; n < this._teamNum; n++)
        {
            var index = n + 1
            this["_team_floor_" + index].setVisible(false) 
        }

        this._select_team = btn.tag;
        this["_team_floor_" + (this._select_team+1)].setVisible(true)
        var str = (this._select_team + 1) == this._teamNum ? LANSTR.ShadowSetView_sure : LANSTR.ShadowSetView_next
        this._next_btn_txt.setString(str);

        this.initNinja();
        // 更新战斗队伍
        this.onArmySort();
        this.updateArmy();
    },

    onNextStep : function () {
        for(var n = 0; n < this._teamNum; n++)
        {
            var index = n + 1
            this["_team_floor_" + index].setVisible(false) 
        }

        if(this._select_team != this._teamNum - 1)
        {
            this._select_team = this._select_team + 1;
            this.initNinja();
            // 更新战斗队伍
            this.updateArmy();

            this.updateScoll()

            var index = this._select_team + 1
            this["_team_floor_" + index].setVisible(true);


            if(this._select_team == this._teamNum - 1)
            {
                this._next_btn_txt.setString(LANSTR.ShadowSetView_sure);
            }
        }
        else
        {
            var index = this._select_team + 1
            this["_team_floor_" + index].setVisible(true);

            for(var n = 0; n < this._teamNum; n++)
            {
                var index = n + 1
                var army = this["army_arr_" + index]
                if(army.length <= 0)
                {
                    NumUnit.prompts(LANSTR["ShadowSetView_"+ index + "duimeiren"]);
                    return
                }
            }

            // 回到影之竞技场主界面
            var heroIdsList = []

            for(var n = 0; n < this._teamNum; n++)
            {
                heroIdsList[n] = ""
                var army_arr = this["army_arr_" + (n+1)]
                for(var i in army_arr) {
                    if(i == (army_arr.length-1))
                        heroIdsList[n] += army_arr[i].config.id;
                    else
                        heroIdsList[n] += army_arr[i].config.id + ",";
                }
            }


            EventDispatcher.shared().addListener(SVRCMD.CrossSet3v3ArenaLineup, function (cmd, data) {
                EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.CrossSet3v3ArenaLineup);
                Loading.remove();
                var errorcode = pkgReader.getPkgError(data);
                if(errorcode) {
                    return;
                }
                EventDispatcher.shared().dispatchEvent(EventConst.updateCross3v3Def, heroIdsList);
                this.onClose();
            }, this);

            Loading.add();
            Netty.shared().sendPackage(SVRCMD.CrossSet3v3ArenaLineup, [2, heroIdsList[0], heroIdsList[1], heroIdsList[2]]);
        }
    },

    initNinja : function () {
        // 忍者
        this.hero_arr = [];
        var arr_getHero = [];
        for(var i in gamePlayer.getHeros) {     // 玩家自己的英雄
            if((this._select == Hero.TROOP_ALL) || (this._select == gamePlayer.getHeros[i].config.type)) {
                if (gamePlayer.getHeros[i].has_awake) arr_getHero.push(gamePlayer.getHeros[i]);
            }
        }

        // 避免受其他战斗模块选英雄后改变英雄选中状态影响
        for(var i in arr_getHero) {
            arr_getHero[i].ischoosed = false;
            var index = this._select_team + 1
            for(var j in this["army_arr" +index])
            {
                if(arr_getHero[i].id == this["army_arr" +index][j].id) {
                    arr_getHero[i].ischoosed = true;
                }
            }
        }
        this.onSortHero(arr_getHero);

        // 切换页签时先删除之前的
        if(this.scrollView) {
            this.scrollView.removeFromParent();
            this.scrollView = null;
        }

        this.scrollView = ccui.ScrollView.create();
        this.scrollView.setDirection(ccui.ScrollView.DIR_VERTICAL);
        this.scrollView.setTouchEnabled(true);
        this.scrollView.setSize(cc.size(700, 370));
        this.scrollView.x = this.bg.x - this.scrollView.width/2;
        this.scrollView.y = this.scrollView.height/2 + 30;
        this.addChild(this.scrollView);

        var innerWidth = this.scrollView.width;
        var innerHeight = (parseInt(arr_getHero.length / 5) + 1) * (100 + this.gap);
        this.scrollView.setInnerContainerSize(cc.size(innerWidth, innerHeight));

        for(var j = 0; j < arr_getHero.length; j++)
        {
            var item = new Cross3v3SetHeroItem(arr_getHero[j], this.army_arr_1, this.army_arr_2, this.army_arr_3, this.army_arr_4, this.army_arr_5, this.army_arr_6, this.army_arr_7, this._select_team, this._teamNum);
            item.x = innerWidth/2 - (item.width + this.gap) * (2 - j%5);
            item.y = this.scrollView.getInnerContainerSize().height - item.height/2 - (item.height + this.gap) * parseInt(j/5) - this.gap/2;
            this.hero_arr.push(item);
            this.scrollView.addChild(this.hero_arr[j]);
        }
    },

    // 英雄按先品质、后等级、最后id排列
    onSortHero : function(arr) {
        arr.sort(function(a, b){
            if(a.quality.quality < b.quality.quality)
                return 1;
            else if(a.quality.quality > b.quality.quality)
                return -1;
            else {
                if(a.level < b.level)
                    return 1;
                else if(a.level > b.level)
                    return -1;
                else {
                    if(a.config.id < b.config.id)
                        return -1;
                    else
                        return 1;
                }
            }
        });

        return arr;
    },

    // 选择页签
    onTableSelect:function(btn) {
        if (this._select == btn.tag)
            return;
        this._select = btn.tag;
        this.initNinja();
        this.sprite_select.y = this.bg.y + this.bg.height / 2 - 85 * (this._select) - 90;
        this.sprite_select.txt.setString(this.tabName[this._select]);
        cc.log("切页" + btn.tag);
    },

    // 更新战斗队伍
    updateArmy : function () {
        if(this.armyScrollView)
            this.armyScrollView.removeFromParent();

        this.armyScrollView = ccui.ScrollView.create();
        this.armyScrollView.setDirection(ccui.ScrollView.DIR_HORIZONTAL);
        this.armyScrollView.setTouchEnabled(true);
        this.armyScrollView.setAnchorPoint(cc.p(0, 0));
        this.armyScrollView.setSize(cc.size(750, 180));
        this.armyScrollView.setPosition(this.army_bg.x - this.army_bg.width/2 + 30, this.army_bg.y - 35);
        this.addChild(this.armyScrollView);

        var innerWidth = this.armyScrollView.width;
        var innerHeight = this.armyScrollView.height;
        this.armyScrollView.setInnerContainerSize(cc.size(innerWidth, innerHeight));

        var army_arr = this["army_arr_" + (this._select_team+1)]

        var power = 0;
        for(var i = 0; i < army_arr.length; i++)
        {
            var frame = this.getChildByTag(1000 + i);
            var item = new FightArmyHeroItem(army_arr, i);
            item.setAnchorPoint(cc.p(0,0.5));
            item.x = 8 + (4-i) * 137;
            item.y = this.armyScrollView.height / 2
            this.armyScrollView.addChild(item);
            power += army_arr[i].getPower();
        }

        this._allPower.setString(LANSTR.PkFoeDetial_power + "\n" + power);
    },

    // 选择忍者
    onChooseHero : function (data) {
       var army_arr = [];          // 当前队伍
        var army_other_arr = [];    // 其余队伍

        var index = this._select_team + 1
        army_arr = this["army_arr_" + index];
        //army_other_arr = this.army_arr_2.slice(0);

        for(var i = 0; i < this._teamNum; i++)
        {
            if(i != this._select_team)
            {
                var army = this["army_arr_"+(i+1)]
                for(var n in army) {
                    army_other_arr.push(army[n]);
                }
            }
        }

        for(var i in army_arr) {
            if(army_arr[i].id == data.id) {    // 选择相同忍者
                // 从战斗队伍飞到选择区域
                this.flyBackEffect(data);
                return;
            } else if(army_arr[i].config.id == data.config.id) {
                NumUnit.prompts(LANSTR.FightEmbattleView_notongshishangchang);
                return;
            }
        }

        for(var i in army_other_arr) {
            if(army_other_arr[i].config.id == data.config.id) {
                NumUnit.prompts(LANSTR.ShadowSetView_notchooseotherarmy);
                return;
            }
        }

        if(this["army_index_" + index] >= 5)
        {
            NumUnit.prompts(LANSTR.ShadowSetView_onlyfive);
            return;
        }

        this["army_index_" + index]++;

       
        for(var i = 0; i < this._teamNum; i++)
        {
            var index = i + 1
            var teamOneString = cc.formatStr(LANSTR["ShadowSetView_team" + index], this["army_index_" + index]);
            this["_team_"+index].setString(teamOneString)
        }

        data.ischoosed = true;
        army_arr.push(data)

      
        this.onArmySort();
        EventDispatcher.shared().dispatchEvent(EventConst.updateHeroChoosedStatus, [this._select_team, data]);

        // 忍者飞到战斗队伍效果
        this.enterArmyEffect(data);
    },

    // 忍者飞到战斗队伍效果
    enterArmyEffect : function(data) {
        // 计算出起始点
        var obj = null;
        for(var i in this.hero_arr) {
            if(data.id == this.hero_arr[i]._hero.id){
                obj = this.hero_arr[i];
            }
        }
        var star_pos = obj.convertToWorldSpaceAR(cc.p(0.5, 0.5));
        var icon_id = Hero.getHeroAwakenIconId(data);
        var img = NumUnit.initImageTwo(star_pos.x, star_pos.y, "#head_" + icon_id + ".jpg", "#head_quality_" + data.quality.quality + ".png", this, 10);
        var icon_lv = NumUnit.initImage(10, 10, UiRes.team_level, img, 1);
        var txt_lv = NumUnit.initLabel(icon_lv.width/2, icon_lv.height/2, icon_lv, 26, data.level);
        icon_lv.scale = 0.8;
        if(data.id > Hero.Hire_ID_BASE) {
            NumUnit.initImage(icon_lv.x + 20, img.height - 20, UiRes.icon_hire, img, 1);
        }

        var army_arr = this["army_arr_" + (this._select_team + 1)]

        var index = null;
        for(var i in army_arr) {
            if(army_arr[i].id == data.id) {
                index = i;
            }
        }

        // 计算出终点
        var _this = this;
        var end_pos = {x:this.army_bg.x - 275 + (4 - index)*137, y:93};
        var action = cc.MoveTo.create(0.15, cc.p(end_pos.x, end_pos.y));
        img.runAction(cc.Sequence.create(action, cc.CallFunc.create(function(){
            img.removeFromParent();
            img = null;

            _this.updateArmy();
        }, this)));
    },

    // 从战斗队伍飞到选择区域
    flyBackEffect : function(data) {
        var army_arr = this["army_arr_" + (this._select_team + 1)]

        // 起始点
        var index = null;
        for(var i in army_arr) {
            if(army_arr[i].id == data.id) {
                index = i;
            }
        }
        var star_pos = {x:this.army_bg.x - 275 + (4 - index)*137, y:93};
        var icon_id = Hero.getHeroAwakenIconId(data);
        var img = NumUnit.initImageTwo(star_pos.x, star_pos.y, "#head_" + icon_id + ".jpg", "#head_quality_" + data.quality.quality + ".png", this, 10);
        img.setCascadeOpacityEnabled(true);
        var icon_lv = NumUnit.initImage(10, 10, UiRes.team_level, img, 1);
        icon_lv.setCascadeOpacityEnabled(true);
        var txt_lv = NumUnit.initLabel(icon_lv.width/2, icon_lv.height/2, icon_lv, 26, data.level);
        icon_lv.scale = 0.8;
        if(data.id > Hero.Hire_ID_BASE) {
            NumUnit.initImage(icon_lv.x + 20, img.height - 20, UiRes.icon_hire, img, 1);
        }

        // 获取完起始点后更新作战队伍
        data.ischoosed = false;
    
        for(var i in army_arr) {
            if (army_arr[i].id == data.id) {
                army_arr.splice(i, 1);
                this["army_index_"+(this._select_team + 1)]--;
            }
        }

        for(var i = 0; i < this._teamNum; i++)
        {
            var index1 = i + 1
            var teamOneString = cc.formatStr(LANSTR["ShadowSetView_team" + index1], this["army_index_" + index1]);
            this["_team_"+index1].setString(teamOneString)
        }

        this.onArmySort();
        this.updateArmy();
        EventDispatcher.shared().dispatchEvent(EventConst.updateHeroChoosedStatus, [this._select_team, data]);

        // 终点
        var obj = null;
        var end_pos = null;
        for(var i in this.hero_arr) {
            if(this.hero_arr[i]._hero.id == data.id) {
                obj = this.hero_arr[i];
            }
        }
        if(obj)
            end_pos = obj.convertToWorldSpaceAR(cc.p(0.5, 0.5));
        else
            end_pos = {x:WINSIZE.width/2, y:WINSIZE.height/2};

        var action = cc.MoveTo.create(0.3, cc.p(end_pos.x, end_pos.y));
        var action1 = cc.FadeOut.create(0.15);
        img.runAction(action1);
        img.runAction(cc.Sequence.create(action, cc.CallFunc.create(function(){
            img.removeFromParent();
            img = null;

        }, this)));
    },

    // 战斗队伍忍者排序
    onArmySort : function () {
        var army_arr = this["army_arr_" + (this._select_team + 1)]
        army_arr.sort(function(a, b){
                if(Config.skill[a.config.id].getValByKey("target_point") > Config.skill[b.config.id].getValByKey("target_point")){
                    return 1;
                }else if(Config.skill[a.config.id].getValByKey("target_point") < Config.skill[b.config.id].getValByKey("target_point")){
                    return -1;
                }else{
                    return a.config.id - b.config.id;
                }
        });
    },

    onExit : function () {
        for(var i = 0; i < this.hero_arr.length; i++)
        {
            this.hero_arr[i]._hero.ischoosed = false;
        }
        EventDispatcher.shared().removeListener(EventConst.chooseHero);
        this.army_arr_1 = [];
        this.army_arr_2 = [];
        this.army_arr_3 = [];
        this._super();
    }
});
/**
 * Created by Administrator on 2014/12/8.
 *
 * "影之竞技场" 界面
 */
var Cross3v3View = BaseLayer.extend({

    _targe : null,
    _reward_hourly : null,  // 当前排名可累计数值
    _reward_total : null,   // 累计可以领取奖励数值

    _txt_remain:null,       // 剩余次数文字
    _txt_times:null,        // 挑战次数文本
    _txt_time_cold:null,    // 冷却时间文本
    _txt_pk_again:null,     // 可再次挑战
    _img_stone_clear:null,  // 宝石图－重置
    _txt_stone_clear:null,  // 宝石花费－重置
    _btn_clear:null,        // 重置按钮

    _txt_buy:null,          // 花费文字
    _img_stone_buy:null,    // 宝石图－购买
    _txt_stone_cost:null,   // 宝石花费－购买
    _txt_times_buy:null,    // 购买次数
    _btn_buy:null,          // 购买按钮

    _defend_bg : null,      // 防守阵容底

    _def_id_arr : [],       // 防守阵容id

    _myDataInfo : null,     // 竞技场个人信息
    _myRank : null,         // 当前排名
    _fightCount : null,     // 挑战次数

    ctor:function(targe, rankList) {
        this._super();

        this._targe = targe;
        this._def_id_arr = [];
        this._rankList = rankList

        MAINSCENE.currentViewStatus = MAINSCENE.CROSS_SHADOW;
    },

    addRes:function() {
        this._super(res_shadow);
    },

    initLayer:function() {
        this._super();

        var bg = this._bg = NumUnit.initImage(WINSIZE.width/2, WINSIZE.height/2 - 20, MapRes.Map_fightgo_bg, this);
        var di = NumUnit.initImage(bg.width/2, bg.height - 55, MapRes.intro_bg, bg, 1);
        di.setScaleY(2.1);
        NumUnit.initBtnBack(50, WINSIZE.height-50, this, this.onClose, 3);

        // 获取个人信息
        EventDispatcher.shared().addListener(SVRCMD.Cross3v3ArenaInfo, function (cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.Cross3v3ArenaInfo);
            Loading.remove();
            var errorcode = pkgReader.getPkgError(data);
            if(errorcode) {
                return;
            }

            this._myDataInfo = data.data;
            this._myRank = data.data.rank.rank;
            this._fightCount = data.data.fightCount;
            this._teamNum = this._myDataInfo.team_num

            // 显示防守阵容
            gamePlayer.updateHerosSort();
            // var arr1 = [];
            // var arr2 = [];
            // var arr3 = [];
            // var len1 = 5;
            // var len2 = 10;
            // var len3 = 15;
            // if(gamePlayer.getHeros.length <= 5) {
            //     len1 = gamePlayer.getHeros.length;
            //     len2 = 0;
            //     len3 = 0;
            // } else if(gamePlayer.getHeros.length > 5 && gamePlayer.getHeros.length <= 10) {
            //     len1 = 5;
            //     len2 = gamePlayer.getHeros.length;
            //     len3 = 0;
            // } else if(gamePlayer.getHeros.length > 10 && gamePlayer.getHeros.length <= 15) {
            //     len1 = 5;
            //     len2 = 10;
            //     len3 = gamePlayer.getHeros.length;
            // }

            // for(var i = 0; i < len1; i++) {
            //     arr1.push(gamePlayer.getHeros[i].config.id);
            // }
            // for(var i = 5; i < len2; i++) {
            //     arr2.push(gamePlayer.getHeros[i].config.id);
            // }
            // for(var i = 10; i < len3; i++) {
            //     arr3.push(gamePlayer.getHeros[i].config.id);
            // }

            // 便利防守阵容Id
            // var def_heros_1 = null;
            // var def_heros_2 = null;
            // var def_heros_3 = null;
            // var arrId1 = [];
            // var arrId2 = [];
            // var arrId3 = [];

            for(var n = 0; n < this._teamNum; n++)
            {
                var index = n + 1
                var def = data.data.rank["def_heros_" + index]
                if(def.length > 0)
                {
                    var def_heros_1 = JSON.parse(def);
                    var arrId1 = [];
                    for(var i in def_heros_1) {
                        arrId1.push(def_heros_1[i].hero_id);
                    }
                    this._def_id_arr.push(arrId1);
                } else  {
                    var arr1 = [];
                    var hero = gamePlayer.getHeros[n]
                    if(hero) arr1.push(hero.config.id)
                    this._def_id_arr.push(arr1);
                }

            }

            // if(data.data.rank.def_heros_1.length > 0)
            // {
            //     def_heros_1 = JSON.parse(data.data.rank.def_heros_1);
            //     for(var i in def_heros_1) {
            //         arrId1.push(def_heros_1[i].hero_id);
            //     }
            //     this._def_id_arr.push(arrId1);
            // } else  {
            //     this._def_id_arr.push(arr1);
            // }

            // if(data.data.rank.def_heros_2.length > 0)
            // {
            //     def_heros_2 = JSON.parse(data.data.rank.def_heros_2);
            //     for(var i in def_heros_2) {
            //         arrId2.push(def_heros_2[i].hero_id);
            //     }
            //     this._def_id_arr.push(arrId2);
            // } else {
            //     this._def_id_arr.push(arr2);
            // }

            // if(data.data.rank.def_heros_3.length > 0)
            // {
            //     def_heros_3 = JSON.parse(data.data.rank.def_heros_3);
            //     for(var i in def_heros_3) {
            //         arrId3.push(def_heros_3[i].hero_id);
            //     }
            //     this._def_id_arr.push(arrId3);
            // } else {
            //     this._def_id_arr.push(arr3);
            // }

            // 若初始没有防守阵容 则告诉服务器设置防守阵容
            if(data.data.rank.def_heros_1.length == 0)
            {
                var heroIdsList = []

                for(var n = 0; n < this._teamNum; n++)
                {
                    var heroIds = ""
                    for(var i in this._def_id_arr[n])
                    {
                        if(i == (this._def_id_arr[n].length-1))
                            heroIds += this._def_id_arr[n][i];
                        else
                            heroIds += this._def_id_arr[n][i] + ",";
                    }

                    heroIdsList[n] = heroIds
                }


                // for(var i in this._def_id_arr[0])
                // {
                //     if(i == (this._def_id_arr[0].length-1))
                //         heroIds1 += this._def_id_arr[0][i];
                //     else
                //         heroIds1 += this._def_id_arr[0][i] + ",";
                // }
                // for(var i in this._def_id_arr[1])
                // {
                //     if(i == (this._def_id_arr[1].length-1))
                //         heroIds2 += this._def_id_arr[1][i];
                //     else
                //         heroIds2 += this._def_id_arr[1][i] + ",";
                // }
                // for(var i in this._def_id_arr[2])
                // {
                //     if(i == (this._def_id_arr[2].length-1))
                //         heroIds3 += this._def_id_arr[2][i];
                //     else
                //         heroIds3 += this._def_id_arr[2][i] + ",";
                // }
                Netty.shared().sendPackage(SVRCMD.CrossSet3v3ArenaLineup, [2, heroIdsList[0], heroIdsList[1], heroIdsList[2]]);
            }

            this.initBg();

            this.isCooling = false;
            if(data.data.fightCount < 5) {
                var allTime = (Cache.getServerTime() - data.data.lastFightTime * 1000) / 1000;
                if(data.data.lastFightTime > 0 && allTime < PkView.TIME_COLD) {
                    this.isCooling = true;
                    this.schedule(this.timeRunning, 1.0);
                }
            } else {
                this._txt_times[0].setString(0);
                this._txt_time_cold.visible = false;
                this._txt_pk_again.visible = false;
                this._img_stone_clear.visible = false;
                this._txt_stone_clear.visible = false;
                this._btn_clear.visible = false;
            }

            // 获取购买次数
            this.updateBuyTimes();

        }, this);

        Loading.add();
        Netty.shared().sendPackage(SVRCMD.Cross3v3ArenaInfo, []);
    },

    // 获取购买次数
    updateBuyTimes:function() {
        var _this = this;
        EventDispatcher.shared().addListener(SVRCMD.DailyGet, function(cmd, data) {
            var errorcode = pkgReader.getPkgError(data);
            if (errorcode) {
                return;
            }
            if(data.data.key != "PLAYER_GOODS2_COUNT_ID_21001") return;
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.DailyGet);

            var count = data.data["value"];
            _this._buyCount = count;

            _this._good = Config.goods2[21001][count + 1];
            if (!_this._good)
                _this._good = Config.goods2[21001][count];

            _this._txt_stone_cost.setString(_this._good.price);

            // 购买次数用完，不显示
            if(count >= 5) {
                _this._txt_buy.visible = false;
                _this._img_stone_buy.visible = false;
                _this._txt_stone_cost.visible = false;
                _this._txt_times_buy.visible = false;
                _this._btn_buy.visible = false;
            } else if(_this._fightCount >= 5){
                _this._txt_buy.visible = true;
                _this._img_stone_buy.visible = true;
                _this._txt_stone_cost.visible = true;
                _this._txt_times_buy.visible = true;
                _this._btn_buy.visible = true;
            }
        }, this);

        Netty.shared().sendPackage(SVRCMD.DailyGet, ["PLAYER_GOODS2_COUNT_ID_21001"]);
    },

    initBg:function() {
        var txt_rank_my = NumUnit.initImage(25, this._bg.height - 55, resPlist.txt_rank_my, this._bg, 2, 0);       // 我的排名

        this._txt_rank_my = NumUnit.initLabelBMF(txt_rank_my.x + 100, txt_rank_my.y+15, this._bg, 24, this._myRank, font.font_rank_fnt, 0);
        this._txt_rank_my.setLocalZOrder(2);
        if(this._myRank < 1000)
            this._txt_rank_my.x = txt_rank_my.x + 120;

        var btn_explain = new cc.MenuItemImage(UiRes.button_small_up, UiRes.button_small_down, this.onExplain, this);
        btn_explain.setPosition(405, txt_rank_my.y);
        NumUnit.initLabelWithStrParser(btn_explain.width/2, btn_explain.height/2, btn_explain,LANSTR.PkView_explain,null,null, null,null, null,null,null, gameColor.btn_yellow,3);

        var btn_rank = new cc.MenuItemImage(UiRes.button_small_up, UiRes.button_small_down, this.onPkRank, this);
        btn_rank.setPosition(btn_explain.x + 130, btn_explain.y);
        NumUnit.initLabelWithStrParser(btn_rank.width/2, btn_rank.height/2, btn_rank,LANSTR.PkView_rank,null,null, null,null, null,null,null, gameColor.btn_yellow,3);

        var btn_fight_notes = new cc.MenuItemImage(UiRes.button_small_up, UiRes.button_small_down, this.onFightNotes, this);
        btn_fight_notes.setPosition(btn_rank.x + 130, btn_explain.y);
        NumUnit.initLabelWithStrParser(btn_fight_notes.width/2, btn_fight_notes.height/2, btn_fight_notes,LANSTR.PkView_notes,null,null, null,null, null,null,null, gameColor.btn_yellow,3);

        var menu = cc.Menu.create(btn_explain, btn_rank, btn_fight_notes);
        menu.setPosition(0,0);
        this._bg.addChild(menu, 3);

        this._txt_remain = NumUnit.initImage(this._bg.width - 100, this._bg.y + 130, resPlist.txt_last_time, this._bg, 2);
        this._txt_times = NumUnit.initLabelTwoColor(this._txt_remain.x - 15, this._txt_remain.y - 60, this._bg, 26, (5-this._fightCount), cc.color.WHITE, "/5", cc.color.WHITE);
        this._txt_time_cold = NumUnit.initLabel(this._txt_remain.x, this._txt_remain.y - 70, this._bg, 22, LANSTR.PkView_10after, cc.color.RED);
        this._txt_pk_again = NumUnit.initLabel(this._txt_remain.x, this._txt_remain.y - 100, this._bg, 22, LANSTR.PkView_pkagain, cc.color.WHITE);
        this._img_stone_clear = NumUnit.initImage(this._txt_remain.x - 60, this._txt_remain.y - 150, UiRes.icon_money, this._bg);
        this._img_stone_clear.scaleX = this._img_stone_clear.scaleY = 0.6;
        this._txt_stone_clear = NumUnit.initLabel(this._img_stone_clear.x + 20, this._img_stone_clear.y, this._bg, 22, ConfigGlobalVar.CS_3V3_ARENA_CD_COST_STONE, null, null, 0,0,0);
        this._btn_clear = new cc.MenuItemImage(UiRes.button_small_up, UiRes.button_small_down, this.onClear, this);
        this._btn_clear.setPosition(this._img_stone_clear.x + 100, this._img_stone_clear.y);
        NumUnit.initLabelYellow(this._btn_clear.width/2, this._btn_clear.height/2, this._btn_clear, 26, LANSTR.PkView_chongzhi);
        this._btn_clear.scaleX = this._btn_clear.scaleY = 0.7;

        this._txt_time_cold.visible = false;
        this._txt_pk_again.visible = false;
        this._img_stone_clear.visible = false;
        this._txt_stone_clear.visible = false;
        this._btn_clear.visible = false;

        this._txt_buy = NumUnit.initLabel(this._txt_remain.x - 35, this._txt_remain.y - 90, this._bg, 22, LANSTR.PkView_cost);
        this._img_stone_buy = NumUnit.initImage(this._txt_buy.x + 45, this._txt_buy.y, UiRes.icon_money, this._bg);
        this._img_stone_buy.scaleX = this._img_stone_buy.scaleY = 0.5;
        this._txt_stone_cost = NumUnit.initLabel(this._txt_buy.x + 70, this._txt_buy.y, this._bg, 22, "", null, null, 0,0,0);
        var timesBuyString = cc.formatStr(LANSTR.ShadowView_timesbuy, Config.goods2[21001][1].value);
        this._txt_times_buy = NumUnit.initLabel(this._txt_remain.x, this._txt_buy.y - 30, this._bg, 22, timesBuyString);
        this._btn_buy = new cc.MenuItemImage(UiRes.button_small_up, UiRes.button_small_down, this.onBuy, this);
        this._btn_buy.setPosition(this._txt_remain.x, this._txt_buy.y - 70);
        NumUnit.initLabelYellow(this._btn_buy.width/2, this._btn_buy.height/2, this._btn_buy, 26, LANSTR.PkView_buy);
        this._btn_buy.scaleX = this._btn_buy.scaleY = 0.7;

        this._txt_buy.visible = false;
        this._img_stone_buy.visible = false;
        this._txt_stone_cost.visible = false;
        this._txt_times_buy.visible = false;
        this._btn_buy.visible = false;

        var menu_time = cc.Menu.create(this._btn_clear, this._btn_buy);
        menu_time.setPosition(0,0);
        this._bg.addChild(menu_time, 3);

        // 挑战
        var challenge_btn = new cc.MenuItemImage(UiRes.button_small_up, UiRes.button_small_down, this.toChallenge, this);
        challenge_btn.setPosition(this._txt_remain.x, this._btn_buy.y - 65);
        NumUnit.initLabelWithStrParser(challenge_btn.width/2, challenge_btn.height/2, challenge_btn, LANSTR.ShadowView_challenge, null,null,null, 0,0,0.5,0.5, gameColor.btn_yellow, 3);
        var menu_challenge = cc.Menu.create(challenge_btn);
        menu_challenge.setPosition(0, 0);
        this._bg.addChild(menu_challenge, 3);

        // 防守阵容
        this._defend_bg = NumUnit.initScale9Sprite(this._bg.x + 20, this._bg.y - 40, 540, 420, this, 14, 2);
        var defend_txt = NumUnit.initImage(80, this._defend_bg.y + 110, resPlist.txt_def_team, this._defend_bg);

        var adjust_btn = new cc.MenuItemImage(UiRes.button_small_up, UiRes.button_small_down, this.toAdjust, this);
        adjust_btn.setPosition(450, defend_txt.y);
        NumUnit.initLabelWithStrParser(adjust_btn.width/2, adjust_btn.height/2, adjust_btn, LANSTR.ShadowView_tiaozheng, null,null,null, 0,0,0.5,0.5, gameColor.btn_yellow, 3);
        var menu_adjust = cc.Menu.create(adjust_btn);
        menu_adjust.setPosition(0, 0);
        this._defend_bg.addChild(menu_adjust);

        // var sprite = cc.Sprite.create();
        // this._defend_bg.addChild(sprite);

        // for(var i = 0; i < 3; i++) {
        //     var item = new Cross3v3DefendItemRender(i, this._def_id_arr[i]);
        //     sprite.addChild(item);
        //     item.x = this._defend_bg.width/2;
        //     item.y = this._defend_bg.height - 140 - i * 105;
        // }
        // 防守阵容
        this.updateDef()

        // 监听自己防守阵容
        EventDispatcher.shared().addListener(EventConst.updateCross3v3Def, function (cmd, data) {

            // var sprite = cc.Sprite.create();
            // this._defend_bg.addChild(sprite);

            // var def_id_arr = [];
            // var def_id_1 = data[0].split(",");
            // var def_id_2 = data[1].split(",");
            // var def_id_3 = data[2].split(",");
            // def_id_arr.push(def_id_1);
            // def_id_arr.push(def_id_2);
            // def_id_arr.push(def_id_3);

            // for(var i = 0; i < 3; i++) {
            //     var item = new Cross3v3DefendItemRender(i, def_id_arr[i]);
            //     sprite.addChild(item);
            //     item.x = this._defend_bg.width/2;
            //     item.y = this._defend_bg.height - 140 - i * 105;
            // }

            var def_id_arr = [];
            for(var n = 0; n < this._teamNum; n++)
            {
                var def_id = data[n].split(",");
                def_id_arr.push(def_id)
            }
            this._def_id_arr = def_id_arr;
            this.updateDef()
        }, this);
    },

    updateDef:function()
    {

        if(this._scroview)
        {
            this._scroview.removeFromParent()
        }
        var scroll_W = this._defend_bg.width - 30
        var itemH = 104
        var scroll_H = this._defend_bg.height - 100;
        var tabgap = 0

        var all_itemH = (itemH + tabgap) * this._teamNum - tabgap  // 全部 items 的总高度

        // 创建滚动条
        var scrollView = ccui.ScrollView.create();
        scrollView.setAnchorPoint(cc.p(0.5, 0))
        scrollView.setDirection(ccui.ScrollView.DIR_VERTICAL);
        scrollView.setSize(cc.size(scroll_W, scroll_H));
        scrollView.setInnerContainerSize(cc.size(scroll_W, all_itemH));
        scrollView.setPosition(this._defend_bg.width/2, 10);
        this._defend_bg.addChild(scrollView);

        var x = scroll_W / 2
        var posy = all_itemH  - itemH / 2
        for(var n = 0; n < this._teamNum; n++)
        {
            var item = new Cross3v3DefendItemRender(n, this._def_id_arr[n]);
            item.x = x
            item.y = posy
            posy = posy - tabgap - itemH
            scrollView.addChild(item);
        }

        this._scroview = scrollView
    },

    // 重置
    onClear:function() {
        if(gamePlayer.stone < ConfigGlobalVar.CS_3V3_ARENA_CD_COST_STONE) {
            NumUnit.prompts(LANSTR.PkView_zuanshibuzu);
            return ;
        }
        EventDispatcher.shared().addListener(SVRCMD.CrossClear3v3ArenaFightCD, function(cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.CrossClear3v3ArenaFightCD);
            Loading.remove();
            var errorcode = pkgReader.getPkgError(data);
            if (errorcode) {
                return;
            }

            if (this._myDataInfo) this._myDataInfo.lastFightTime = 0;
            this.clearCooling();
            this.getPlayerInfo(); // 刷新
            NumUnit.prompts(LANSTR.PkView_chongzhichenggong);
        }, this);

        Loading.add();
        Netty.shared().sendPackage(SVRCMD.CrossClear3v3ArenaFightCD, []);
    },

    // 购买
    onBuy:function() {
        if(gamePlayer.getPrice(this._good.price_type) < this._good.price) {
            NumUnit.prompts(ConfigGoods2.getPriceName(this._good.price_type) + LANSTR.PkView_buzu);
            return ;
        }
        if(this._buyCount >= 5) {
            NumUnit.prompts(LANSTR.PKView_jrgmcsym);
            return;
        }

        EventDispatcher.shared().addListener(SVRCMD.BuyGoods2, function(cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.BuyGoods2);
            Loading.remove();
            var errorcode = pkgReader.getPkgError(data);
            if (errorcode) {
                return;
            }

            this.getPlayerInfo(); // 刷新
            NumUnit.prompts(LANSTR.PkView_buyok);
        }, this);

        Loading.add();
        Netty.shared().sendPackage(SVRCMD.BuyGoods2, [21001]);
    },

    // 每秒运行
    clearCooling:function() {
        this.unschedule(this.timeRunning);
        this.isCooling = false;
        this._txt_time_cold.visible = false;
        this._txt_pk_again.visible = false;
        this._img_stone_clear.visible = false;
        this._txt_stone_clear.visible = false;
        this._btn_clear.visible = false;
    },

    timeRunning:function() {
        if (!this._myDataInfo || !this._myDataInfo.lastFightTime) {
            this.clearCooling();
            return;
        }
        var allTime = Math.round((Cache.getServerTime() - this._myDataInfo.lastFightTime * 1000) / 1000);

        this._txt_time_cold.setString(NumUnit.getTimeString(PkView.TIME_COLD - allTime) + LANSTR.PkView_hou);
        if(!this._txt_time_cold.visible) {
            this._txt_time_cold.visible = true;
            this._txt_pk_again.visible = true;
            this._img_stone_clear.visible = true;
            this._txt_stone_clear.visible = true;
            this._btn_clear.visible = true;
        }

        if(allTime >= PkView.TIME_COLD) {
            this.unschedule(this.timeRunning);
            this._txt_time_cold.visible = false;
            this._txt_pk_again.visible = false;
            this._img_stone_clear.visible = false;
            this._txt_stone_clear.visible = false;
            this._btn_clear.visible = false;

            this.isCooling = false;
        }
    },

    // 获取玩家信息
    getPlayerInfo:function() {
        // 获取个人信息
        EventDispatcher.shared().addListener(SVRCMD.Cross3v3ArenaInfo, function (cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.Cross3v3ArenaInfo);
            Loading.remove();
            var errorcode = pkgReader.getPkgError(data);
            if(errorcode) {
                return;
            }

            this._myDataInfo = data.data;
            this._myRank = data.data.rank.rank;
            this._fightCount = data.data.fightCount;

            this.unschedule(this.timeRunning);

            this._txt_times[0].setString(5 - data.data.fightCount);
            this._txt_rank_my.setString(data.data.rank.rank);

            this._txt_times[0].visible = true;
            this._txt_times[1].visible = true;

            this._txt_time_cold.visible = false;
            this._txt_pk_again.visible = false;
            this._img_stone_clear.visible = false;
            this._txt_stone_clear.visible = false;
            this._btn_clear.visible = false;

            this._txt_buy.visible = false;
            this._img_stone_buy.visible = false;
            this._txt_stone_cost.visible = false;
            this._txt_times_buy.visible = false;
            this._btn_buy.visible = false;

            this.isCooling = false;
            if(data.data.fightCount < 5) {
                var allTime = (Cache.getServerTime() - this._myDataInfo.lastFightTime * 1000) / 1000;
                if(data.data.lastFightTime > 0 && allTime < PkView.TIME_COLD) {
                    this.isCooling = true;
                    this.schedule(this.timeRunning, 1.0);
                }
            } else {
                this._txt_times[0].setString(0);
                this._txt_time_cold.visible = false;
                this._txt_pk_again.visible = false;
                this._img_stone_clear.visible = false;
                this._txt_stone_clear.visible = false;
                this._btn_clear.visible = false;

                this.updateBuyTimes();
            }

        }, this);

        Loading.add();
        Netty.shared().sendPackage(SVRCMD.Cross3v3ArenaInfo, []);
    },

    onExplain : function() {
        var explain = new Cross3v3Explain();
        this._targe.addChild(explain, 20);
    },

    onPkRank : function() {
        EventDispatcher.shared().addListener(SVRCMD.Cross3v3ArenaRank, function (cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.Cross3v3ArenaRank);
            Loading.remove();
            var errorcode = pkgReader.getPkgError(data);
            if(errorcode) {
                return;
            }

            var rank = new Cross3v3RankView(data.data.ranks, this._myDataInfo, this._rankList);
            this._targe.addChild(rank, 20);
        }, this);

        Loading.add();
        var level = gamePlayer.crossRankLv || NumUnit.getLevelPart(gamePlayer.team_lv)
        Netty.shared().sendPackage(SVRCMD.Cross3v3ArenaRank, [level]);
    },

    onFightNotes : function() {
        var note = new Cross3v3FightNotes();
        this._targe.addChild(note, 20);
    },

    

    

    toChallenge : function() {
        if(this._fightCount >= 5) {
            NumUnit.prompts(LANSTR.PkFoeItemRender_cishuyongwan);
            return ;
        }

        if(this.isCooling) {
            NumUnit.prompts(LANSTR.PkFoeItemRender_lengque);
            return ;
        }

        cc.log("挑战");
        EventDispatcher.shared().addListener(SVRCMD.CrossMatch3v3ArenaFighters, function (cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.CrossMatch3v3ArenaFighters);
            Loading.remove();
            var errorcode = pkgReader.getPkgError(data);
            if(errorcode) {
                return;
            }

            var challenge = new Cross3v3ChallengeView(data.data, this._myDataInfo);
            this._targe.addChild(challenge, 20);
        }, this);

        Loading.add();
        Netty.shared().sendPackage(SVRCMD.CrossMatch3v3ArenaFighters, []);
    },

    toAdjust : function() {
        cc.log("调整");
        var layer = new Cross3v3SetView(this._def_id_arr);
        this._targe.addChild(layer, 20);
    },

    onExit : function() {
        if(this._defend_bg)
            cc.eventManager.removeListeners(this._defend_bg);
        EventDispatcher.shared().removeListenerByDelgate(this);
        this._def_id_arr = [];
        this._super();
    }
});

(function() {
    CrossBattleChoose.prototype.choose3v3 = function() {
        if (gamePlayer.team_lv < 70) { NumUnit.prompts("XS 3v3 mở từ cấp 70"); return; }
        if (gamePlayer.getHeros.filter(function(hero) { return hero.has_awake; }).length < 3) {
            NumUnit.prompts("Cần ít nhất 3 ninja đã thức tỉnh"); return;
        }
        Netty.withCrossAccess("dark_arena", this, function() {
            this._target.addChild(new Cross3v3MainView(this._target), tagMain.NINJA_MAIN_LAYER, this._target.popupTag);
            this.onClose();
        });
    };
})();

(function () {
    function button(layer, x, y, label, callback) {
        var btn = NumUnit.initButtonUI(UiRes.button_small_up, UiRes.button_small_down, callback, layer);
        btn.setPosition(x, y);
        layer.addChild(btn);
        NumUnit.initLabelYellow(btn.width / 2, btn.height / 2, btn, 21, label);
        return btn;
    }

    var LuanVoBracketView = BaseLayer.extend({
        addRes: function () { this._super(res_cross_choose); },

        initLayer: function () {
            this._super();
            var self = this;
            var cx = WINSIZE.width / 2, cy = WINSIZE.height / 2;
            var panel = new cc.DrawNode();
            this.addChild(panel);
            panel.drawRect(cc.p(0, 0), cc.p(WINSIZE.width, WINSIZE.height),
                cc.color(6, 12, 22, 185), 0, cc.color(0, 0, 0, 0));
            panel.drawRect(cc.p(18, 18), cc.p(WINSIZE.width - 18, WINSIZE.height - 18),
                cc.color(21, 35, 53, 255), 2, cc.color(185, 145, 83, 255));
            NumUnit.initBtnClose(WINSIZE.width - 43, WINSIZE.height - 43, this, this.onClose);
            NumUnit.initLabelYellow(cx, WINSIZE.height - 51, this, 31, "Luận Võ");
            this._bracketLayer = new cc.Node();
            this.addChild(this._bracketLayer);
            this._status = NumUnit.initLabel(cx, cy, this, 23, "Đang tải sơ đồ Luận võ…");
            this._mode = "bracket";
            this._matchTargets = [];
            var touch = cc.EventListener.create({
                event: cc.EventListener.TOUCH_ONE_BY_ONE,
                swallowTouches: false,
                onTouchBegan: function (event) {
                    if (self._mode !== "bracket") return false;
                    var point = self._bracketLayer.convertToNodeSpace(event.getLocation());
                    var found = self._matchTargets.filter(function (card) {
                        return Math.abs(card.x - point.x) <= card.width / 2 && Math.abs(card.y - point.y) <= 18;
                    })[0];
                    if (found) self.openMatch(found.match);
                    return Boolean(found);
                }
            });
            cc.eventManager.addListener(touch, this);
            EventDispatcher.shared().addListener("TournamentRoom", function (cmd, packet) {
                var action = self._pendingRoom;
                self._pendingRoom = null;
                if (self._mode === "bracket") return;
                if (pkgReader.getPkgError(packet)) {
                    if (action === "choose") self._selectedHeroes = [];
                    return;
                }
                var incoming = packet.data.room;
                if (!self._activeMatch || incoming.match.id !== self._activeMatch.id) return;
                var previous = self._room;
                self._room = incoming;
                if (packet.data.inventory) self._inventory = packet.data.inventory;
                if (!previous || action === "choose" || previous.draft && self._room.draft &&
                    previous.draft.step !== self._room.draft.step) self._selectedHeroes = [];
                self._mode = "room";
                self.renderRoom();
                if (self._room.phase === "packing" && self._room.side >= 0 && !self._room.locked[self._room.side] && action !== "lock")
                    self.requestRoom("lock");
                else if (self._room.phase === "between" && self._room.side >= 0 && !self._room.ready[self._room.side] && action !== "ready")
                    self.requestRoom("ready");
            }, this);
            EventDispatcher.shared().addListener("TournamentReplay", function (cmd, packet) {
                if (!pkgReader.getPkgError(packet) && packet.data.history) self.playReplay(packet.data.history);
            }, this);
            this.schedule(function () {
                if (self._mode === "room" && self._room.phase !== "done") self.requestRoom("state");
            }, 1);
            EventDispatcher.shared().addListener("TournamentBracket", function (cmd, packet) {
                if (pkgReader.getPkgError(packet)) {
                    self._status.setString("Không tải được sơ đồ Luận võ.");
                    return;
                }
                if (self._mode === "bracket") self.renderBracket(packet.data && packet.data.tournament);
            }, this);
            button(this, cx, 40, "Cây đấu", function () {
                self._mode = "bracket";
                self._activeMatch = null;
                self._pendingRoom = null;
                self._bracketLayer.removeAllChildren();
                Netty.shared().sendPackage("TournamentBracket", []);
            });
            Netty.shared().sendPackage("TournamentBracket", []);
        },

        renderBracket: function (tournament) {
            this._matchTargets = [];
            this._bracketLayer.removeAllChildren();
            this._status.setString(tournament ? "" : "Sơ đồ Luận võ chưa được công bố.");
            if (!tournament) return;

            var top = WINSIZE.height - 107;
            var stepX = (WINSIZE.width - 38) / 9;
            var stepY = (top - 125) / 7;
            var positions = {};
            var columns = {};
            var layer = this._bracketLayer;
            var rounds = ["Vòng ngoài", "Top 16", "Tứ kết", "Bán kết", "Chung kết"];
            var targets = this._matchTargets;
            var lineLayer = new cc.DrawNode();
            layer.addChild(lineLayer);
            tournament.matches.forEach(function (match) {
                var column = match.side === "right" ? 9 - match.round : match.round - 1;
                var x = 19 + stepX * (column + 0.5);
                var sources = match.slots.map(function (slot) { return positions[slot.winnerOf]; }).filter(Boolean);
                var row = columns[column] || 0;
                var y = sources.length ? sources.reduce(function (total, point) { return total + point.y; }, 0) / sources.length :
                    top - 37 - row * stepY;
                if (row === 0) NumUnit.initLabelYellow(x, top + 13, layer, 14, rounds[match.round - 1] + " · BO" + match.bestOf);
                columns[column] = row + 1;
                positions[match.id] = cc.p(x, y);
                targets.push({x:x, y:y, width: stepX * .87, match:match});
                sources.forEach(function (source) {
                    var direction = source.x < x ? 1 : -1;
                    var from = source.x + direction * stepX * .43;
                    var to = x - direction * stepX * .43;
                    var mid = (from + to) / 2;
                    var ink = cc.color(190, 137, 112, 255);
                    lineLayer.drawSegment(cc.p(from, source.y), cc.p(mid, source.y), 1, ink);
                    lineLayer.drawSegment(cc.p(mid, source.y), cc.p(mid, y), 1, ink);
                    lineLayer.drawSegment(cc.p(mid, y), cc.p(to, y), 1, ink);
                });
                var card = NumUnit.initImage(x, y, "#panel_normal_title.png", layer);
                card.setScaleX(stepX * .87 / card.width);
                card.setScaleY(36 / card.height);
                match.slots.forEach(function (slot, index) {
                    var name = slot.player ? (slot.luckyBye ? "★ " : "") + "S" + slot.player.serverId + " " + slot.player.name :
                        "Chờ " + slot.winnerOf;
                    if (name.length > 13) name = name.slice(0, 12) + "…";
                    var score = match.score[0] || match.score[1] ? " " + match.score[index] : "";
                    NumUnit.initLabelYellow(x, y + (index ? -9 : 9), layer, 12, name + score);
                });
            });
        },

        openMatch: function (match) {
            this._activeMatch = match;
            this._inventory = [];
            this._mode = "detail";
            this._room = null;
            this._selectedHeroes = [];
            this._filter = 0;
            this._page = 0;
            this.renderDetail();
        },

        replay: function (game) {
            Netty.shared().sendPackage("TournamentReplay", [this._activeMatch.id, game]);
        },

        renderDetail: function () {
            var self = this;
            var match = this._activeMatch;
            var layer = this._bracketLayer;
            var cx = WINSIZE.width / 2, top = WINSIZE.height - 110;
            layer.removeAllChildren();
            var names = match.slots.map(function (slot) { return slot.player ? "S" + slot.player.serverId + " · " + slot.player.name : "Chờ " + slot.winnerOf; });
            NumUnit.initLabelYellow(cx, top, layer, 26, match.id + " · BO" + match.bestOf);
            NumUnit.initLabelYellow(cx, top - 38, layer, 24, names[0] + "   " + match.score.join("–") + "   " + names[1]);
            match.games.forEach(function (game, index) {
                var x = cx + ((index % 4) - Math.min(3, match.games.length - 1) / 2) * 145;
                var y = top - 96 - Math.floor(index / 4) * 52;
                if (game.walkover) NumUnit.initLabelYellow(x, y, layer, 15, "Ván " + game.game + ": " + (game.winner ? "Đỏ" : "Xanh") + " thắng (xử)");
                else button(layer, x, y, "Xem ván " + game.game, function () { self.replay(game.game); }).setScale(.85);
            });
            if (match.note) NumUnit.initLabelYellow(cx, 150, layer, 15, match.note);
            if (match.scheduledAt) {
                var date = new Date(match.scheduledAt + 7 * 3600000);
                NumUnit.initLabelYellow(cx, top - 63, layer, 14,
                    "Lịch đấu " + date.toISOString().slice(0, 16).replace("T", " ") + " (UTC+7)");
            }
            if (match.streamUrl) button(layer, cx + 175, 100, "Livestream", function () {
                if (cc.sys.openURL) cc.sys.openURL(match.streamUrl);
                else NumUnit.prompts(match.streamUrl);
            });
            if (match.canEnter && match.slots.every(function (slot) { return !!slot.player; }) && match.winner < 0)
                button(layer, cx, 100, "Vào phòng", function () { self.requestRoom("join"); });
        },

        requestRoom: function (action, payload) {
            if (!this._activeMatch || this._pendingRoom) return;
            this._pendingRoom = action;
            Netty.shared().sendPackage("TournamentRoom", [this._activeMatch.id, action, payload || {}]);
        },

        renderRoom: function () {
            var self = this, room = this._room, layer = this._bracketLayer;
            var cx = WINSIZE.width / 2, top = WINSIZE.height - 108;
            layer.removeAllChildren();
            var names = room.match.slots.map(function (slot) { return slot.player.name; });
            NumUnit.initLabelYellow(cx, top, layer, 23, names[0] + "   " + room.score.join("–") + "   " + names[1]);
            var labels = {waiting:"Phòng chờ", between:"Chờ ván tiếp theo", packing:"Đang chốt đội hình", locked:"Đã chốt đủ hai đội", running:"Backend đang xử lý combat", done:"Cặp đấu đã kết thúc", admin:"Chờ admin xử lý"};
            if (room.observer) NumUnit.initLabelYellow(WINSIZE.width - 110, top, layer, 16, "Bạn là Trọng tài");
            if (room.note && room.phase !== "draft") NumUnit.initLabelYellow(cx, 150, layer, 15, room.note);
            if (room.deadline && room.phase !== "draft") {
                var waitLeft = Math.max(0, Math.ceil((room.deadline - room.serverTime) / 1000));
                var waitText = {ready:"Bên chưa sẵn sàng sẽ bị xử thua cặp sau ", lock:"Tự xử thua bên chưa khóa đội hình sau ", start:"Ván 1 tự chạy nếu Trọng tài chưa mở sau "}[room.deadlineKind];
                if (waitText) NumUnit.initLabelYellow(cx, 175, layer, 15, waitText + waitLeft + "s");
            }
            if (room.phase !== "draft") NumUnit.initLabelYellow(cx, top - 31, layer, 18, labels[room.phase] || "");
            if (room.phase === "waiting" || room.phase === "between") {
                NumUnit.initLabelYellow(cx, top - 67, layer, 18, "Xanh: " + (room.ready[0] ? "Sẵn sàng" : "Đang chờ") +
                    "     Đỏ: " + (room.ready[1] ? "Sẵn sàng" : "Đang chờ"));
                var early = room.match.scheduledAt && room.match.scheduledAt > room.serverTime;
                if (early) NumUnit.initLabelYellow(cx, top - 91, layer, 15, "Chưa đến giờ mở trận");
                if (!early && room.side >= 0 && !room.ready[room.side])
                    button(layer, cx, top - 112, "Sẵn sàng", function () { self.requestRoom("ready"); });
            }
            if (room.canStart) button(layer, cx, 120, "Mở combat ván 1", function () { self.requestRoom("start"); });

            if (room.draft) {
                function heroIcon(parent, x, y, id, quality) {
                    var icon = Hero.getIconByHeroIdNQuality(id, quality || 1);
                    if (!icon) return;
                    var face = NumUnit.initImage(x, y, "#head_" + icon + ".jpg", parent);
                    face.setScale(36 / face.width);
                    if (quality) {
                        var frame = NumUnit.initImage(x, y, "#head_quality_" + quality + ".png", parent);
                        frame.setScale(37 / frame.width);
                    }
                }
                [0,1].forEach(function (side) {
                    var x = WINSIZE.width * (side ? .73 : .27);
                    NumUnit.initLabelYellow(x, top - 37, layer, 16, (side ? "ĐỎ" : "XANH") + " · " + room.draft.picks[side].length + "/5");
                    room.draft.picks[side].forEach(function (id, i) { heroIcon(layer, x + (i - 2) * 42, top - 65, id); });
                    var bans = room.draft.bans.filter(function (entry) { return entry.side === side; });
                    NumUnit.initLabelYellow(x, top - 95, layer, 14, "Đã cấm " + bans.length + "/5");
                    bans.forEach(function (entry, i) { heroIcon(layer, x + (i - 2) * 42, top - 122, entry.heroId); });
                });
                var turn = room.draft.turn;
                if (turn) {
                    var countdown = Math.max(0, Math.ceil((room.draft.deadline - room.serverTime) / 1000));
                    NumUnit.initLabelYellow(cx, top - 155, layer, 16,
                        (turn[1] ? "Đỏ" : "Xanh") + " · " + (turn[0] === "ban" ? "Cấm " : "Chọn ") + turn[2] + " tướng · " + countdown + "s");
                    if (room.side >= 0) {
                        var inventory = this._inventory.filter(function (hero) { return !self._filter || hero.position === self._filter; });
                        var pageSize = 16;
                        var lastPage = Math.max(0, Math.ceil(inventory.length / pageSize) - 1);
                        this._page = Math.min(this._page, lastPage);
                        var canChoose = room.side === turn[1];
                        var filterNames = ["Tất cả", "Hàng trước", "Hàng giữa", "Hàng sau"];
                        filterNames.forEach(function (name, index) {
                            button(layer, cx + (index - 1.5) * 124, top - 182, name, function () {
                                self._filter = index;
                                self._page = 0;
                                self.renderRoom();
                            }).setScale(self._filter === index ? .76 : .65);
                        });
                        inventory.slice(this._page * pageSize, (this._page + 1) * pageSize).forEach(function (hero, index) {
                            var x = cx + (index % 8 - 3.5) * 75;
                            var y = top - 223 - Math.floor(index / 8) * 55;
                            heroIcon(layer, x, y, hero.id, hero.quality);
                            NumUnit.initLabelYellow(x, y - 23, layer, 10, "Lv." + hero.level);
                            var selected = self._selectedHeroes.indexOf(hero.id) >= 0;
                            var eligible = canChoose && room.draft.available.indexOf(hero.id) >= 0;
                            if (eligible) {
                                button(layer, x + 20, y + 13, selected ? "✓" : "+", function () {
                                    var current = self._selectedHeroes.indexOf(hero.id);
                                    if (current >= 0) self._selectedHeroes.splice(current, 1);
                                    else if (self._selectedHeroes.length < turn[2]) self._selectedHeroes.push(hero.id);
                                    self.renderRoom();
                                }).setScale(.32);
                            } else if (room.draft.used.indexOf(hero.id) >= 0 || room.draft.bans.some(function (item) {return item.heroId === hero.id;})) {
                                NumUnit.initLabelYellow(x, y, layer, 12, room.draft.used.indexOf(hero.id) >= 0 ? "印" : "CẤM");
                            }
                        });
                        if (this._page > 0) button(layer, cx - 328, top - 263, "‹", function () { self._page--; self.renderRoom(); }).setScale(.45);
                        if (this._page < lastPage) button(layer, cx + 328, top - 263, "›", function () { self._page++; self.renderRoom(); }).setScale(.45);
                        if (canChoose && turn[0] === "ban" && room.draft.available.length === 0)
                            button(layer, cx, 80, "Bỏ qua cấm", function () {
                                self.requestRoom("choose", {step: room.draft.step, ids: []});
                            }).setScale(.85);
                        else if (canChoose && this._selectedHeroes.length === turn[2])
                            button(layer, cx, 80, "Xác nhận", function () {
                                self.requestRoom("choose", {step: room.draft.step, ids: self._selectedHeroes});
                            }).setScale(.85);
                    }
                }
            }
            if (room.phase !== "draft" && room.games.length && !room.games[room.games.length - 1].walkover)
                button(layer, cx + 150, 70, "Xem ván " + room.games.length, function () { self.replay(room.games.length); }).setScale(.85);
        },

        playReplay: function (history) {
            var data = getVideoBattleRecData(history.fight_data);
            if (!data || !data.bm) { NumUnit.prompts(LANSTR.ERROR_REPLAYDATA); return; }
            var bm = BattleModle.getModleFromString(data.bm.split(","));
            bm.atk_name = history.atk_name;
            bm.def_name = history.def_name;
            bm.atk_lv = history.atk_lv;
            bm.def_lv = history.def_lv;
            bm.isAttackAvatar = Netty.isHistoryAttacker(history);
            var replay = new ReplayData(bm);
            replay.data = data;
            bm.replaydata = replay;
            bm.result = data.result;
            bm.resetForReplay();
            var bg = "res/background/bg_1001.jpg";
            Loading.loadRes(NumUnit.prepareLoadingRes([bm]).concat(res_fight, [bg]), function () {
                var scene = new ReplayScene();
                scene.setReplayData(bg, bm, false);
                cc.director.runScene(scene);
            });
        },

        onExit: function () {
            EventDispatcher.shared().removeListenerByDelgate(this);
            this._super();
        }
    });

    CrossBattleChoose.prototype.init_bg = function () {
        var self = this;
        var bg = NumUnit.initImage(WINSIZE.width / 2, WINSIZE.height / 2, "#cs_aboard.png", this);
        NumUnit.initBtnClose(bg.x + bg.width / 2 - 10, bg.y + bg.height / 2 - 10, this, this.onClose);
        var entries = [
            [100, "1v1", function () { self.choose1v1(); }],
            [255, "XS 3v3", function () { self.choose3v3(); }],
            [410, "Luận Võ", function () {
                var scene = cc.director.getRunningScene();
                var tournament = new LuanVoBracketView();
                self.onClose();
                scene.addChild(tournament, 9998);
            }],
            [565, "7v7", function () { self.choose7v7(); }],
            [720, "Boss", function () { self.chooseBoss(); }]
        ];
        entries.forEach(function (entry) {
            button(bg, entry[0] * bg.width / 826, 100, entry[1], entry[2]);
        });
    };
})();

(function () {
    if (typeof MainSceneLayer === "undefined" || !MainSceneLayer.prototype.initBg || !MainSceneLayer.prototype.update) return;
    var initBg = MainSceneLayer.prototype.initBg, update = MainSceneLayer.prototype.update;
    var ink = [
        cc.color(217, 241, 255, 145),
        cc.color(244, 251, 255, 230),
        cc.color(255, 255, 255, 255)
    ];
    function drawSnow(state, dt) {
        state.elapsed += dt;
        var canvas = state.node;
        canvas.clear();
        for (var i = 0; i < state.flakes.length; i++) {
            var f = state.flakes[i];
            f.x += (18 + 20 * Math.sin(state.elapsed * 1.15 + f.phase)) * dt;
            f.y -= f.speed * dt;
            if (f.y < -6) { f.y = state.height + 6; f.x = Math.random() * state.width; }
            if (f.x > state.width + 6) f.x = -6;
            if (f.x < -6) f.x = state.width + 6;
            var point = cc.p(f.x, f.y);
            canvas.drawDot(point, f.radius + .8, ink[0]);
            canvas.drawDot(point, f.radius, ink[f.bright ? 2 : 1]);
        }
    }
    MainSceneLayer.prototype.initBg = function () {
        var result = initBg.apply(this, arguments);
        if (!cc.DrawNode || !cc.DrawNode.create || this._noelSnowLayer) return result;
        var state = { node: cc.DrawNode.create(), width: WINSIZE.width, height: WINSIZE.height, elapsed: 0, flakes: [] };
        for (var i = 0; i < 87; i++) {
            var foreground = i % 4 === 0;
            state.flakes.push({
                x: Math.random() * state.width, y: Math.random() * state.height,
                radius: foreground ? 2.25 + Math.random() * 1.5 : 1.15 + Math.random() * .75,
                speed: foreground ? 66 + Math.random() * 42 : 22 + Math.random() * 35,
                bright: foreground, phase: Math.random() * 6.28
            });
        }
        this._noelSnowLayer = state;
        this.addChild(state.node, 7);
        drawSnow(state, 0);
        return result;
    };
    MainSceneLayer.prototype.update = function (dt) {
        var result = update.apply(this, arguments);
        if (this._noelSnowLayer) drawSnow(this._noelSnowLayer, Math.min(dt || 0, .075));
        return result;
    };
})();

(function () {
    if (typeof BattlePassDevView === "undefined") return;
    var view = BattlePassDevView.prototype;
    view.render = function(){
        if(this._root) this._root.removeFromParent();
        var root=cc.Node.create(),scale=Math.min((WINSIZE.width-52)/1120,(WINSIZE.height-44)/628);
        root.setScale(scale);
        root.setPosition(Math.round((WINSIZE.width-1120*scale)/2),Math.round((WINSIZE.height-628*scale)/2));
        this.addChild(root);
        this._root=root;

        var gold=[255,215,90],white=[255,245,225],muted=[210,185,155],cyan=[140,225,245];
        var data=this._data,level=data?data.level:0,xp=data?data.xp:0,xpPerLevel=data?data.season.xpPerLevel:290;
        var days=data?Math.max(0,Math.ceil((data.season.end-data.now)/86400000)):0;

        // Background with pre-rendered lacquer panels
        this.art(root,'background.png',0,0,1120,628);

        // Header Title & Authentic Red Seal Close Button
        this.text(root,'HÀNH TRÌNH NHẪN GIẢ',560,598,22,gold);
        this.btn(root,'close',null,1084,594,44,44,function(){this.removeFromParent();});

        // Top Tabs: Active Tab with Silver Cloud Scroll Wings
        this.btn(root,this._tab==='rewards'?'tab_active':'tab_inactive','PHẦN THƯỞNG',455,568,155,50,function(){this._tab='rewards';this.render();},{fontSize:15,color:this._tab==='rewards'?[255,245,220]:[200,180,150],stroke:[50,15,8]});
        this.btn(root,this._tab==='missions'?'tab_active':'tab_inactive','NHIỆM VỤ NGÀY',645,568,155,50,function(){this._tab='missions';this.render();},{fontSize:15,color:this._tab==='missions'?[255,245,220]:[200,180,150],stroke:[50,15,8]});

        // ==========================================
        // LEFT CONTAINER: Premium Pass & Info (x=166)
        // ==========================================
        var lx = 166;
        this.text(root,'GÓI CAO CẤP',lx,525,16,gold);
        this.text(root,'Mở khóa toàn bộ 30 cấp quà!',lx,502,11,muted);

        // Season artwork: Will of Fire legacy, separate from the navigation badge.
        this.art(root,'season_fire_legacy.png',lx-75,368,150,115);

        // Season & Level Info
        this.text(root,data && data.season ? data.season.subtitle + ': ' + data.season.name : 'BATTLE PASS',lx,340,13,gold);
        if (data && data.season) this.text(root,'CÒN '+days+' NGÀY  ·  '+data.season.levels+' CẤP',lx,318,11,muted);
        this.text(root,'CẤP HIỆN TẠI: '+level,lx,292,16,white);

        // Small EXP bar in left box
        var expRatio = level>=30?1:(xp%xpPerLevel)/xpPerLevel;
        this.rect(root,lx-95,266,190,10,[20,8,8],false);
        this.rect(root,lx-95,266,190*expRatio,10,[245,185,50],false);
        this.text(root,level>=30?'CẤP TỐI ĐA':(xp%xpPerLevel)+' / '+xpPerLevel+' EXP',lx,250,11,muted);

        // Left Action Buttons: Authentic Cyan Chakra & Gold Bezel Buttons
        this.btn(root,'blue','+500 EXP'+(data&&data.entitlements?' ('+data.entitlements.xp_uses+' lượt)':''),lx,208,145,46,function(){this.purchase('xp');},{fontSize:13,stroke:[10,45,80]});
        this.btn(root,'gold',data&&data.premium?'ĐÃ MỞ CAO CẤP':'Mở Gói Cao Cấp',lx,158,165,50,function(){this.purchase('premium');},{fontSize:15,stroke:[70,20,10]});
        this.text(root,'FULL CẤP 30: 8.700 EXP',lx,124,10,muted);

        // ==========================================
        // RIGHT CONTAINER: Rewards Track or Missions
        // ==========================================
        if(data){
            if(this._tab==='rewards') this.renderRewards(root,data);
            else this.renderMissions(root,data);
        } else {
            this.text(root,'Đang tải Battle Pass…',690,340,18,muted);
        }
    };
    view.renderRewards = function(root,d){
        var gold=[255,215,90],muted=[210,185,155],cyan=[140,225,245];
        var level=d.level,xp=d.xp,xpPerLevel=d.season.xpPerLevel||290;

        // Top Progress Header (Clean breathing room under tabs)
        this.text(root,'TIẾN ĐỘ: CẤP '+level+' / 30',376,532,15,gold,'left');
        this.text(root,(level>=30?'8.700 / 8.700':(xp%xpPerLevel)+' / '+xpPerLevel)+' EXP',1065,532,13,cyan,'right');

        // Top Progress Bar
        var barRatio = level>=30?1:Math.min(1, level/30);
        this.rect(root,376,508,689,12,[22,8,8],false);
        this.rect(root,376,508,689*barRatio,12,[245,185,55],false);

        // Timeline dots and Tier numbers (5 tiers per page: 0..4)
        var start = this._page * 5;
        for(var i=0; i<5; i++){
            var tier = start + i + 1;
            var cx = 450 + i * 133;
            var reached = tier <= level;
            // Node dot
            this.rect(root, cx-5, 480, 10, 10, reached ? [245,185,50] : [70,70,75], false);
            // Label
            this.text(root, 'CẤP '+tier, cx, 464, 12, reached ? [255,225,100] : [180,160,140]);

            // Slot Cards: Free (Row 1, y=388) & Premium (Row 2, y=270)
            this.rewardSlot(root, d, tier, 'free', cx, 388);
            this.rewardSlot(root, d, tier, 'premium', cx, 270);
        }

        // Track Row Labels on left
        this.text(root,'MIỄN PHÍ',395,388,12,cyan);
        this.text(root,'CAO CẤP',395,270,12,gold);

        // Bottom Action Bar (y=86)
        this.text(root,'Làm nhiệm vụ ngày để nhận EXP Battle Pass!',376,86,12,muted,'left');

        // Pagination: Authentic Game Arrow Sprites
        this.btn(root,'arrow_left',null,695,86,36,30,function(){this._page=Math.max(0,this._page-1);this.render();});
        this.text(root,'Trang '+(this._page+1)+' / 6',750,86,13,gold);
        this.btn(root,'arrow_right',null,805,86,36,30,function(){this._page=Math.min(5,this._page+1);this.render();});

        // Refresh & Claim All: Authentic Blue and Gold Action Buttons
        this.btn(root,'blue','Làm mới',890,86,105,42,function(){this.request('BattlePassInfo',[]);},{fontSize:14,stroke:[10,45,80]});
        this.btn(root,'gold','Nhận tất cả',1015,86,135,46,function(){this.request('BattlePassClaim',[1,'all']);},{fontSize:15,stroke:[70,20,10]});

        if(this._pending || this._message){
            this.text(root,this._pending?'Đang xử lý…':this._message,690,120,12,cyan);
        }
    };
    view.renderMissions = function(root,d){
        // Title & Header info
        this.text(root,'DANH SÁCH NHIỆM VỤ NGÀY',376,535,15,[255,215,90],'left');
        this.text(root,'Tổng cộng: +580 EXP mỗi ngày',1065,535,13,[140,225,245],'right');

        // Scrollable Mission List (ccui.ScrollView)
        var scroll_W = 735, scroll_H = 415;
        var scroll = ccui.ScrollView.create();
        scroll.setDirection(ccui.ScrollView.DIR_VERTICAL);
        scroll.setTouchEnabled(true);
        scroll.setBounceEnabled(true);
        if(scroll.setClippingType && ccui.Layout && ccui.Layout.CLIPPING_SCISSOR){
            scroll.setClippingType(ccui.Layout.CLIPPING_SCISSOR);
        }
        scroll.setSize(cc.size(scroll_W, scroll_H));
        scroll.setPosition(332, 110);
        root.addChild(scroll);

        var list = d.missions || [];
        var itemH = 58, itemGap = 8, itemStep = itemH + itemGap;
        var totalH = Math.max(scroll_H, list.length * itemStep + 6);
        scroll.setInnerContainerSize(cc.size(scroll_W, totalH));

        for(var i=0; i<list.length; i++){
            var m = list[i];
            var iy = totalH - (i + 1) * itemStep + 4;

            // Compact Mission Box
            var bgCol = m.completed ? [45, 20, 12] : [32, 12, 10];
            this.rect(scroll, 2, iy, scroll_W - 6, itemH, bgCol, true);

            // Mission Name & Description
            var nameCol = m.completed ? [255, 225, 100] : [255, 245, 225];
            this.text(scroll, m.name, 20, iy + 39, 15, nameCol, 'left');
            this.text(scroll, m.description, 20, iy + 18, 12, [200, 180, 155], 'left');

            // EXP Reward
            this.text(scroll, '+' + m.xp + ' EXP', 480, iy + 29, 14, [255, 215, 90]);

            // Progress (e.g. 2 / 3)
            var progCol = m.completed ? [140, 240, 160] : [140, 225, 245];
            this.text(scroll, m.progress + ' / ' + m.target, 575, iy + 29, 14, progCol);

            // Status Badge
            if(m.completed){
                this.rect(scroll, 638, iy + 14, 82, 30, [30, 80, 45], false);
                this.text(scroll, 'ĐÃ XONG', 679, iy + 29, 12, [180, 255, 200]);
            } else {
                this.rect(scroll, 638, iy + 14, 82, 30, [45, 25, 18], false);
                this.text(scroll, 'ĐANG LÀM', 679, iy + 29, 12, [225, 185, 140]);
            }
        }

        // Bottom Action Bar: Info + Refresh Button
        this.text(root,'Reset 00:00 hàng ngày (giờ VN)  ·  Cuộn để xem toàn bộ nhiệm vụ',376,86,12,[210,185,155],'left');
        this.btn(root,'blue','Làm mới',1010,86,115,42,function(){this.request('BattlePassInfo',[]);},{fontSize:14,stroke:[10,45,80]});
    };
})();

(function () {
    if (typeof FriendshipView === "undefined" || FriendshipView.prototype._referralPatched) return;

    var commands = ["ReferralStatus", "ReferralRedeem", "ReferralClaim"];
    var original = FriendshipView.prototype.initLayer;
    FriendshipView.prototype._referralPatched = true;
    FriendshipView.prototype.initLayer = function () {
        Config.friendship[2815] = {"id":2815,"name":"Đường Ray Noel","type":2,"heros":"815","hp":5000,"hp_inc":0,"atk":0,"atk_inc":0,"def":0,"def_inc":0,"mp":0,"mp_inc":0,"mp_def":0,"mp_def_inc":0,"cri":0,"cri_inc":0,"mp_cri":0,"mp_cri_inc":0};
        original.apply(this, arguments);
        var view = this;
        var state;
        var popup;
        var page = 0;
        var tab = 0;
        var pending = false;
        var dispatcher = EventDispatcher.shared();
        var frame = view._bg;
        var scroll = view.scrollView;
        var scrollSize = scroll.getContentSize();
        var scrollY = scroll.getPositionY();
        var footerHeight = 58;

        function setEntryVisible(visible) {
            entry.setVisible(visible && !popup);
            scroll.setSize(cc.size(scrollSize.width, scrollSize.height - (visible ? footerHeight : 0)));
            scroll.setPositionY(scrollY + (visible ? footerHeight : 0));
        }

        function button(parent, x, y, title, action, enabled, maxWidth) {
            var control = NumUnit.initButtonUI(UiRes.button_middle_up, UiRes.button_middle_down, action, view);
            control.setPosition(x, y);
            control.setEnabled(enabled !== false);
            parent.addChild(control);
            NumUnit.initLabelYellow(control.width / 2, control.height / 2, control, 21, title);
            control.setScale(Math.min(1, (maxWidth || 122) / control.width));
            return control;
        }

        function send(command, args) {
            if (pending) return;
            pending = true;
            Netty.shared().sendPackage(command, args);
        }

        function close() {
            if (!popup) return;
            popup.removeFromParent(true);
            popup = null;
            view.scrollView.setTouchEnabled(true);
            entry.setVisible(!!(state && state.enabled));
        }

        function draw() {
            if (popup) popup.removeFromParent(true);
            var panelWidth = Math.min(frame.width - 48, 716);
            var panelHeight = Math.min(frame.height - 48, 450);
            popup = new cc.Layer();
            popup.setPosition(frame.x - panelWidth / 2, frame.y - panelHeight / 2);
            var backdrop = NumUnit.initImage(panelWidth / 2, panelHeight / 2, FriendshipRes.tails_mainpanel, popup);
            backdrop.setScaleX(panelWidth / backdrop.width);
            backdrop.setScaleY(panelHeight / backdrop.height);
            view.addChild(popup, 10000);
            scroll.setTouchEnabled(false);
            entry.setVisible(false);

            var mid = panelWidth / 2;
            function label(y, text, size) {
                NumUnit.initLabelYellow(mid, y, popup, size || 19, text);
            }

            label(panelHeight - 25, "Mời bạn bè", 24);
            var tabStep = Math.min(150, (panelWidth - 54) / 3);
            var tabWidth = tabStep - 18;
            button(popup, mid - tabStep, panelHeight - 67, "Mã của bạn", function () { tab = 0; draw(); }, tab !== 0, tabWidth);
            button(popup, mid, panelHeight - 67, "Nhập mã", function () { tab = 1; draw(); }, tab !== 1, tabWidth);
            button(popup, mid + tabStep, panelHeight - 67, "Đóng", close, true, tabWidth);
            label(panelHeight - 105, "Cấp cao nhất trên 5 server: " + state.level + " · Cấp nhận quà: " + state.minimumLevel);

            function drawInvite(row, y, prefix) {
                NumUnit.initLabelYellow(mid - 88, y, popup, 17, prefix + " #" + row.accountId + " · Cấp " + row.level);
                if (row.received) {
                    NumUnit.initLabelYellow(mid + 135, y, popup, 17, "Đã nhận");
                } else {
                    button(popup, mid + 135, y, row.ordinal ? "Nhận quà" : "Chờ đủ cấp", function () {
                        send("ReferralClaim", [row.inviteeId]);
                    }, !!row.ordinal);
                }
            }

            if (tab === 1) {
                if (state.inviter) {
                    drawInvite(state.inviter, panelHeight - 161, "Người mời");
                } else if (!state.canEnterCode) {
                    label(panelHeight - 161, "Tài khoản phải tạo từ 17/11/2026 (giờ Việt Nam).", 18);
                } else {
                    var input = new cc.EditBox(cc.size(235, 42), new cc.Scale9Sprite());
                    input.setPosition(mid, panelHeight - 161);
                    input.setPlaceHolder("Nhập mã mời");
                    input.setMaxLength(6);
                    popup.addChild(input);
                    var confirming = false;
                    var selectedCode;
                    button(popup, mid, panelHeight - 221, "Xác nhận", function () {
                        var value = input.getString().trim().toUpperCase();
                        if (!/^[2-9A-HJ-NP-Z]{6}$/.test(value)) {
                            NumUnit.prompts("Mã mời gồm 6 ký tự.");
                            return;
                        }
                        if (!confirming || selectedCode !== value) {
                            confirming = true;
                            selectedCode = value;
                            NumUnit.prompts("Mỗi tài khoản chỉ nhập một mã. Bấm lại để lưu.");
                            return;
                        }
                        send("ReferralRedeem", [value]);
                    });
                }
                return;
            }

            label(panelHeight - 127, "Mã mời của bạn", 16);
            label(panelHeight - 153, state.code, 24);
            if (typeof jsb !== "undefined" && typeof jsb.copyToClipboard === "function") {
                button(popup, mid + 190, panelHeight - 148, "Sao chép", function () {
                    jsb.copyToClipboard(state.code);
                    NumUnit.prompts("Đã sao chép mã mời.");
                });
            }
            var perPage = Math.max(1, Math.floor((panelHeight - 264) / 52) + 1);
            var lastPage = Math.max(0, Math.ceil(state.invitees.length / perPage) - 1);
            page = Math.min(page, lastPage);
            if (!state.invitees.length) label(panelHeight - 204, "Chưa có người nhập mã của bạn.");
            state.invitees.slice(page * perPage, (page + 1) * perPage).forEach(function (row, index) {
                drawInvite(row, panelHeight - 201 - index * 52, "Bạn đã mời");
            });
            if (lastPage) {
                button(popup, mid - 135, 25, "Trang trước", function () { page--; draw(); }, page > 0);
                label(25, (page + 1) + "/" + (lastPage + 1), 16);
                button(popup, mid + 135, 25, "Trang sau", function () { page++; draw(); }, page < lastPage);
            }
        }

        var entry = button(view, frame.x, frame.y - frame.height / 2 + 42, "Mời bạn bè", function () {
            if (state && state.enabled) draw();
            send("ReferralStatus", []);
        });
        entry.setLocalZOrder(100);
        entry.setVisible(false);
        commands.forEach(function (command) {
            dispatcher.addListener(command, function (cmd, packet) {
                pending = false;
                if (packet.error) {
                    if (popup) NumUnit.prompts(packet.error.msg || "Không thể xử lý lượt mời.");
                    return;
                }
                state = packet.data;
                if (!state.enabled) close();
                setEntryVisible(!!state.enabled);
                if (state.enabled && popup) draw();
            }, view);
        });
        send("ReferralStatus", []);
    };
})();

(function () {
    if (typeof MainSceneLayer === "undefined" || !MainSceneLayer.prototype.initBg) return;
    var original = MainSceneLayer.prototype.initBg;
    function nightAt(ms) {
        var hour = new Date(ms + 7 * 3600000).getUTCHours();
        return hour >= 19 || hour < 6;
    }
    MainSceneLayer.prototype.initBg = function () {
        var makeImage = NumUnit.initImage;
        var mountain;
        NumUnit.initImage = function (x, y, spriteFrame) {
            var sprite = makeImage.apply(this, arguments);
            if (spriteFrame === resPlist.scene_mountain) mountain = sprite;
            return sprite;
        };
        var result;
        try {
            result = original.apply(this, arguments);
        } finally {
            NumUnit.initImage = makeImage;
        }
        if (this._noelNight && this._noelNight.getParent()) return result;
        var scene = this, lights = [], elapsed = 0, groundCanvas = null, groundLights = [];
        var terrain = [], scenery = [], stars = null, amount = -1;
        function tintNode(list, node, color) {
            if (!node || !node.setColor || !node.getColor || list.some(function (x) { return x.node === node; })) return;
            var saved = node.getColor();
            list.push({node:node, color:color, day:[saved.r, saved.g, saved.b]});
        }
        function recolor(list, blend) {
            for (var i = 0; i < list.length; i++) {
                var item = list[i], rgb = item.day.map(function (day, channel) {
                    return Math.round(day + (day * item.color[channel] / 255 - day) * blend);
                });
                item.node.setColor(cc.color(rgb[0], rgb[1], rgb[2]));
            }
        }
        tintNode(scenery, scene._scene_sky, [52,80,151]);
        tintNode(scenery, mountain, [91,119,181]);
        tintNode(terrain, scene.scene_land_1, [149,171,220]);
        tintNode(terrain, scene.scene_land_2, [149,171,220]);
        if (scene._scene_sky && cc.DrawNode && cc.DrawNode.create) {
            var skySize = scene._scene_sky.getContentSize();
            stars = cc.DrawNode.create();
            scene._scene_sky.addChild(stars, 2);
            for (var starIndex = 0; starIndex < 70; starIndex++) {
                var x = (starIndex * 177.61) % skySize.width;
                var y = skySize.height * (.47 + ((starIndex * 79.13) % 100) * .005);
                stars.drawDot(cc.p(x, y), starIndex % 7 === 0 ? 1.9 : 1.05, cc.color(214, 234, 255, 175));
            }
        }
        var ceiling = cc.Node.create();
        scene._noelNight = ceiling;
        // Scroll-view coordinates follow the original sảnh artwork and pan with it.
        var anchors = [
            [150,200,64,38],[230,370,72,35],[400,180,104,56],
            [480,410,77,43],[630,180,84,9],[700,460,91,55],
            [900,210,106,26],[1300,160,102,9],[1510,250,100,30],
            [1700,420,121,37],[1780,180,108,30],[1930,350,83,22],
            [2120,380,95,5],[2130,160,89,16],[2350,340,102,24]
        ];
        if (scene.scrollView && scene.scrollView.getInnerContainer) {
            var village = scene.scrollView.getInnerContainer();
            village.addChild(ceiling, 6);
            var landscape = village.getChildren();
            for (var child = 0; child < landscape.length; child++) {
                var node = landscape[child], depth = node.getLocalZOrder();
                if (depth === 4 || depth === 6) tintNode(terrain, node, depth === 6 ? [120,147,192] : [174,189,222]);
            }
            // These points match the gift groups painted into main_bg.
            var parcels = [[308,78],[337,78],[1055,97],[1433,88],[1885,77],[2243,84],[2273,84]];
            for (var giftIndex = 0; giftIndex < parcels.length; giftIndex++) {
                var parcel = parcels[giftIndex];
                for (var bulb = 0; bulb < 2; bulb++) {
                    var spark = cc.Sprite.create("res/lobby_noel/warm_light.png");
                    if (!spark) continue;
                    ceiling.addChild(spark);
                    lights.push({node:spark, village:village, x:parcel[0] + (bulb ? 6 : -6),
                        y:parcel[1] + bulb * 3, phase:giftIndex * 1.65 + bulb * 2.12});
                }
            }
            groundLights = [[78,372,1],[170,430,5],[262,461,3],[354,453,1],[446,457,5],[538,461,3],[630,431,1],[722,437,5],[814,452,3],[906,215,1],[998,204,5],[1090,191,3],[1182,175,1],[164,345,5],[256,377,3],[348,385,1],[440,372,5],[532,380,3],[624,363,1],[716,351,5],[808,369,3],[923,141,1],[1015,114,5],[1107,109,3],[156,98,0],[248,108,4],[340,117,2],[432,98,0],[524,109,4],[616,117,2],[708,98,0],[800,110,4],[892,116,2],[984,98,0],[1076,110,4],[1168,116,2],[279,36,3],[371,53,1],[463,52,5],[555,36,3],[647,53,1],[739,51,5],[831,36,3],[923,54,1],[1015,51,5],[1107,36,3],[26,394,1],[78,396,5],[130,440,3],[182,460,1],[234,470,5],[286,472,3],[338,478,1],[390,482,5],[442,482,3],[494,478,1],[546,466,5],[598,458,3],[650,458,1],[702,460,5],[754,462,3],[806,462,1],[858,458,5],[910,244,3],[962,234,1],[1014,224,5],[1066,204,3],[1118,194,1],[1170,202,5],[1222,204,3],[1372,177,4],[1464,215,2],[1556,361,0],[1648,366,4],[1740,401,2],[1832,399,0],[1924,357,4],[2016,348,2],[2108,282,0],[2200,279,4],[2292,304,2],[2384,428,0],[1366,100,4],[1458,122,2],[1573,289,0],[1665,294,4],[1757,317,2],[1849,319,0],[1941,276,4],[2033,261,2],[2125,207,0],[2217,204,4],[2309,219,2],[1381,98,0],[1473,99,4],[1565,115,2],[1657,98,0],[1749,99,4],[1841,115,2],[1933,97,0],[2025,100,4],[2117,115,2],[2209,97,0],[2301,101,4],[2393,115,2],[1596,43,1],[1688,52,5],[1872,44,1],[1964,52,5],[2148,45,1],[2240,51,5],[1261,200,0],[1313,200,4],[1365,206,2],[1417,218,0],[1469,230,4],[1521,358,2],[1573,380,0],[1625,390,4],[1677,406,2],[1729,414,0],[1781,418,4],[1833,414,2],[1885,400,0],[1937,386,4],[1989,370,2],[2041,354,0],[2093,304,4],[2145,300,2],[2197,312,0],[2249,314,4],[2301,316,2],[2353,428,0],[2405,454,4],[2457,470,2]];
            if (cc.DrawNode && cc.DrawNode.create) {
                groundCanvas = cc.DrawNode.create();
                ceiling.addChild(groundCanvas);
            }
            var openings = [
                [150,168,34,73],[124,193,23,43],[177,188,22,45],[480,376,40,56],
                [631,188,63,51],[696,446,48,71],[900,211,72,73],[1300,161,55,30],
                [1510,235,61,72],[1652,403,31,37],[1746,408,33,36],[1781,174,71,51],
                [1914,336,29,39],[1960,333,26,37],[2118,375,39,51],[2130,161,62,31],[2350,330,66,53]
            ];
            for (var windowIndex = 0; windowIndex < openings.length; windowIndex++) {
                var windowLight = openings[windowIndex];
                for (var kind = 0; kind < (windowIndex % 3 === 0 ? 2 : 1); kind++) {
                    var glow = cc.Sprite.create("res/lobby_noel/building-glow.png");
                    if (!glow) continue;
                    ceiling.addChild(glow);
                    lights.push({node:glow, x:windowLight[0],
                        y:windowLight[1] - kind * windowLight[3] * .51,
                        sx:windowLight[2] * (kind ? 1.65 : 1.32) / 64,
                        sy:windowLight[3] * (kind ? .33 : 1.25) / 64,
                        strength:kind ? 64 : 110, phase:windowIndex * .59});
                }
            }
            for (var row = 0; row < anchors.length; row++) {
                var anchor = anchors[row];
                for (var i = 0; i < 5; i++) {
                    var node = cc.Sprite.create("res/lobby_noel/warm_light.png");
                    if (!node) continue;
                    ceiling.addChild(node);
                    lights.push({node:node, village:village, x:anchor[0] + (i - 2) * anchor[2] / 4,
                        y:anchor[1] + anchor[3] + Math.abs(i-2) * 5, phase:row * 1.12 + i * 1.7});
                }
            }
        }
        for (var i = 0; i < lights.length; i++) {
            var light = lights[i];
            light.node.setPosition(light.x, light.y);
            if (light.sx) {
                light.node.setScaleX(light.sx);
                light.node.setScaleY(light.sy);
            } else light.node.setScale(.59);
        }
        function refresh(dt) {
            if (!ceiling.getParent()) return;
            var target = nightAt(Date.now()) ? 1 : 0;
            var next = amount < 0 ? target :
                amount + Math.max(-dt * .45, Math.min(dt * .45, target - amount));
            if (next !== amount) {
                amount = next;
                recolor(scenery, amount);
                recolor(terrain, amount);
            }
            if (stars) stars.setVisible(amount > .6);
            ceiling.setVisible(amount > .14);
            if (amount <= .14) return;
            elapsed += Math.min(dt, .12);
            if (groundCanvas && scene.scene_land_1 && scene.scene_land_2) {
                groundCanvas.clear();
                var palette = [[255,218,163],[246,148,181],[133,221,251],[194,169,240],[154,232,187],[255,181,124]];
                for (var lampIndex = 0; lampIndex < groundLights.length; lampIndex++) {
                    var lamp = groundLights[lampIndex], x = lamp[0], y = lamp[1];
                    var pulse = .5 + .5 * Math.sin(elapsed * .87 + lampIndex * 1.61);
                    var glow = (.12 + .88 * pulse * pulse) * amount;
                    var rgb = palette[lamp[2]], point = cc.p(x, y);
                    groundCanvas.drawDot(point, 8, cc.color(rgb[0], rgb[1], rgb[2], Math.round(70 * glow)));
                    groundCanvas.drawDot(point, 4.7, cc.color(rgb[0], rgb[1], rgb[2], Math.round(165 * glow)));
                    groundCanvas.drawDot(point, 2.2, cc.color(255, 249, 232, Math.round(240 * glow)));
                }
            }
            for (var i = 0; i < lights.length; i++) {
                var light = lights[i];
                var pulse = .5 + .5 * Math.sin(elapsed * .79 + light.phase);
                var peak = light.strength || 190;
                light.node.setOpacity(Math.round(peak * (.7 + .3 * pulse) * amount));
            }
        }
        refresh(0);
        scene.schedule(refresh, 1 / 20);
        return result;
    };
})();

(function () {
    if (typeof MainSceneLayer === "undefined") return;
    MainSceneLayer.prototype.initPlayer = function() {
        var _this = this;

        var ww = WINSIZE.width - 175 - 140; // 减去左右两边
        var gold_floor = new cc.MenuItemImage(resPlist.up_frame, resPlist.up_frame, this.buyGold, this);
        gold_floor.setPosition(175 + ww / 2, WINSIZE.height - 35);

        var stone_floor = new cc.MenuItemImage(resPlist.up_frame, resPlist.up_frame, this.buyStone, this);
        stone_floor.setPosition(175 + ww / 6 * 5, gold_floor.y);

        var sp_floor = this._sp_floor = NumUnit.initImage(175 + ww / 6, gold_floor.y, resPlist.up_frame, this, tagMain.DROP_MENU);

        var icon_gold = NumUnit.initImage(25, gold_floor.height / 2, UiRes.icon_gold, gold_floor);
        var icon_sp = NumUnit.initImage(25, sp_floor.height / 2, UiRes.icon_food, sp_floor);
        var icon_stone = NumUnit.initImage(25, stone_floor.height / 2, UiRes.icon_money, stone_floor);
        icon_gold.scale = icon_sp.scale = icon_stone.scale = 0.8;

        var btn_gold = new cc.MenuItemImage(resPlist.icon_add, resPlist.icon_add, this.buyGold, this);
        btn_gold.setPosition(gold_floor.x + gold_floor.width / 2 - 25, gold_floor.y);

        var btn_sp = new cc.MenuItemImage(resPlist.icon_add, resPlist.icon_add, this.buySp, this);
        btn_sp.setPosition(sp_floor.x + sp_floor.width / 2 - 25, sp_floor.y);

        var btn_stone = new cc.MenuItemImage(resPlist.icon_add, resPlist.icon_add, this.buyStone, this);
        btn_stone.setPosition(stone_floor.x + stone_floor.width / 2 - 25, stone_floor.y);

        var menu_top = cc.Menu.create(gold_floor, stone_floor, btn_gold, btn_sp, btn_stone);
        menu_top.setPosition(0, 0);
        this.addChild(menu_top, tagMain.DROP_MENU + 1);

        this._old_gold = gamePlayer.gold;
        this._old_stone = gamePlayer.stone;
        this.txt_gold = NumUnit.initLabelBMF(gold_floor.width / 2, gold_floor.height / 2, gold_floor, 32, NumUnit.formatNum(gamePlayer.gold), font.font_white_fnt);
        this.txt_stone = NumUnit.initLabelBMF(stone_floor.width / 2, stone_floor.height / 2, stone_floor, 32, NumUnit.formatNum(gamePlayer.stone), font.font_white_fnt);
        this.txt_sp = [];
        this.txt_sp[0] = NumUnit.initLabelBMF(sp_floor.width / 2, sp_floor.height / 2, sp_floor, 32, gamePlayer.sp, font.font_white_fnt, 1, 0.5);
        this.txt_sp[1] = NumUnit.initLabelBMF(sp_floor.width / 2, sp_floor.height / 2, sp_floor, 32, "/" + Config.level[gamePlayer.team_lv].init_sp, font.font_white_fnt, 0, 0.5);
        if (gamePlayer.sp > Config.level[gamePlayer.team_lv].init_sp)
        {
            this.txt_sp[0].color = gameColor.sky;
        }

        // SP显示
        this.spBg = NumUnit.initScale9Sprite(WINSIZE.width / 2, WINSIZE.height - 80, 330, 180, this, 4, tagMain.DROP_MENU, 0.5, 1);
        this.spBg.visible = false;
        this.spBgNode = cc.Node.create();
        this.spBgNode.anchorX = 0.5;
        this.spBgNode.anchorY = 1.0;
        this.spBgNode.setContentSize(330, 180);
        this.spBgNode.setPosition(this.spBg.x, this.spBg.y);
        this.addChild(this.spBgNode, tagMain.DROP_MENU + 1);
        this.spBgNode.visible = false;

        this.txt_time_now = NumUnit.initLabel(20, 150, this.spBgNode, Cache.languageConfig.MainScene_spSize, LANSTR.timenow + "00:00:00", null, null, 0, 0, 0);
        this.txt_sp_buy_times = NumUnit.initLabel(20, 120, this.spBgNode, Cache.languageConfig.MainScene_spSize, LANSTR.spbuytimes + this._sp_buy_times + "/" + (gamePlayer.vip_lv + 1), null, null, 0, 0, 0);
        this.txt_sp_max = NumUnit.initLabel(20, 90, this.spBgNode, Cache.languageConfig.MainScene_spSize, LANSTR.spismax, null, null, 0, 0, 0);
        this.txt_sp_time = NumUnit.initLabel(20, 90, this.spBgNode, Cache.languageConfig.MainScene_spSize, LANSTR.sptime + "00:00:00", null, null, 0, 0, 0);
        this.txt_time_all = NumUnit.initLabel(20, 60, this.spBgNode, Cache.languageConfig.MainScene_spSize, LANSTR.sptimeall + "00:00:00", null, null, 0, 0, 0);
        this.txt_sp_gap = NumUnit.initLabel(20, 30, this.spBgNode, Cache.languageConfig.MainScene_spSize, LANSTR.spgap, null, null, 0, 0, 0);
        this.txt_sp_time.visible = false;
        this.txt_time_all.visible = false;
        this.txt_sp_gap.visible = false;

        var onTouch = cc.EventListener.create({
            event: cc.EventListener.TOUCH_ONE_BY_ONE,
            swallowTouches: true,
            onTouchBegan: function(touch, event) {
                var target = event.getCurrentTarget();

                var location = target.convertToNodeSpace(touch.getLocation());
                var rect = cc.rect(0, 0, 160, 50);
                if (cc.rectContainsPoint(rect, location))
                {
                    _this.spBg.visible = true;
                    _this.spBgNode.visible = true;
                    return true;
                }
                return false;
            },
            onTouchEnded: function(touch, event) {
                _this.spBg.visible = false;
                _this.spBgNode.visible = false;
            }
        });
        cc.eventManager.addListener(onTouch, this._sp_floor);



        // 玩家头像
        this._player_icon = gamePlayer.icon;
        var icon = gamePlayer.getIcon();
        var frame = gamePlayer.getFrame();
        var img_player = NumUnit.initImage(55, WINSIZE.height - 60, icon, this, tagMain.PLAYER_ICON - 1);
        img_player.scale = 0.8;
        var icon_team = new cc.MenuItemImage(frame, frame, this.showPlayer, this);
        icon_team.setPosition(img_player.x, img_player.y);
        if (this.animateNoelAvatarFrame) this.animateNoelAvatarFrame(icon_team, true);
        icon_team.scale = 0.8;

        var vipImage = gamePlayer.vip_lv > 15 ? resPlist.head_vip2 : resPlist.head_vip;
        var vipLv = gamePlayer.vip_lv > 15 ? gamePlayer.vip_lv - 15 : gamePlayer.vip_lv;
        var vip_floor = this.txt_vip_floor = NumUnit.initImage(img_player.x + 45, img_player.y + 45, resPlist.head_vip_floor, this, tagMain.LANTERN_FLOOR, 0, 1);
        var vip_text = NumUnit.initImage(vip_floor.width / 2, vip_floor.height / 2+1, vipImage, vip_floor);
        this.txt_vip = NumUnit.initLabel(58, vip_floor.height / 2, vip_floor, 20, vipLv);
        if (gamePlayer.vip_lv <= 0)
            this.txt_vip_floor.visible = false;
        var lv_floor = NumUnit.initImage(img_player.x + 45, img_player.y - 27, UiRes.team_level, this, tagMain.LANTERN_FLOOR);
        this.txt_lv = NumUnit.initLabel(lv_floor.width / 2, lv_floor.height / 2, lv_floor, 20, gamePlayer.team_lv);
        var name_floor = NumUnit.initImage(img_player.x, img_player.y - 60, UiRes.team_name_frame, this, tagMain.PLAYER_ICON - 1);
        this.txt_name = NumUnit.initLabel(name_floor.width / 2, name_floor.height / 2, name_floor, 20, gamePlayer.team_name);
        if (gamePlayer.team_name == null || gamePlayer.team_name == "")
        {
            this.txt_name.setString(LANSTR.nonameteam);
        }

        EventDispatcher.shared().addListener(EventConst.updatePlayTeamName, function(cmd, data) {
            _this.txt_name.setString(gamePlayer.team_name);
            if (gamePlayer.team_name == null || gamePlayer.team_name == "")
            {
                _this.txt_name.setString(LANSTR.nonameteam);
            }
        }, Delgate.delgate_MainScene);

        // 充值
        var shortcutEffects = new cc.Node();
        this.addChild(shortcutEffects, tagMain.PLAYER_ICON - 1);
        var btn_shop = new cc.MenuItemImage(resPlist.icon_pay, resPlist.icon_pay, this.buyStone, this);
        btn_shop.setPosition(230, WINSIZE.height - 115);
        btn_shop.setScale(0.8);

        // 充值特效
        this._effect_recharge = NumUnit.onEffectforever(shortcutEffects, btn_shop.x, btn_shop.y, "skeleton_main_recharge", "texture_main_recharge", "effect_main_recharge");
        this._effect_recharge.setLocalZOrder(tagMain.PLAYER_ICON - 1);
        this._effect_recharge.setScale(0.8);

        // 签到
        var btn_sign_in = new cc.MenuItemImage(resPlist.icon_sign_in, resPlist.icon_sign_in, this.goSignIn, this);
        btn_sign_in.setPosition(btn_shop.x + 105, btn_shop.y);
        btn_sign_in.setScale(0.8);

        // 活动
        var btn_active = new cc.MenuItemImage(resPlist.icon_activity, resPlist.icon_activity, this.goActivity, this);
        btn_active.setPosition(btn_sign_in.x + 105, btn_sign_in.y);
        btn_active.setScale(0.8);
        this.updateActivityGet();

        // 活动特效
        this._effect_activity = NumUnit.onEffectforever(shortcutEffects, btn_active.x, btn_active.y, "skeleton_main_recharge", "texture_main_recharge", "effect_main_recharge");
        this._effect_activity.setLocalZOrder(tagMain.PLAYER_ICON - 1);
        this._effect_activity.setScale(0.8);

        // 首充礼包
        this.btn_gift = new cc.MenuItemImage(resPlist.icon_libao, resPlist.icon_libao, this.openOnlineNoelGift, this);
        this.btn_gift.setPosition(btn_active.x + 105, btn_active.y);
        this.btn_gift.setScale(0.8);
        this.btn_gift.setVisible(true);

        // 升级礼包
        this.btn_lvup = new cc.MenuItemImage(resPlist.icon_lvup, resPlist.icon_lvup, this.goLvUp, this);
        this.btn_lvup.setPosition(this.btn_gift.x + 105, this.btn_gift.y + 1);
        this.btn_lvup.setScale(0.8);
        this.btn_lvup.visible = false;

        var shortcuts = cc.Menu.create(btn_shop, btn_sign_in, btn_active, this.btn_gift, this.btn_lvup);
        shortcuts.setPosition(0, 0);
        this._noelActivityRowY = btn_shop.y;
        this._noelActivityRowX = btn_shop.x + 7 * (btn_sign_in.x - btn_shop.x);
        this.addChild(shortcuts, tagMain.PLAYER_ICON);

        var shortcutMarks = new cc.Node();
        this.addChild(shortcutMarks, tagMain.PLAYER_ICON);

        var toggleShortcuts = new cc.MenuItemSprite(
            cc.Sprite.create("res/lobby_noel/activity-flake-0.png"),
            cc.Sprite.create("res/lobby_noel/activity-flake-1.png"), function() {
            var expanded = !shortcuts.isVisible();
            this._shortcutsExpanded = expanded;
            shortcuts.setVisible(expanded);
            if (this._noelActivityMenu) this._noelActivityMenu.setVisible(expanded);
            if (this.zhuangPanMenu) this.zhuangPanMenu.setVisible(expanded);
            shortcutEffects.setVisible(expanded);
            shortcutMarks.setVisible(expanded);
            toggleShortcuts.setOpacity(expanded ? 235 : 170);
        }, this);
        toggleShortcuts.setOpacity(235);
        toggleShortcuts.setScale(.75);
        toggleShortcuts.setPosition(btn_shop.x - 61, btn_shop.y);
        this._shortcutsExpanded = true;

        var menu_player = cc.Menu.create(icon_team, toggleShortcuts);
        menu_player.setPosition(0, 0);
        this.addChild(menu_player, tagMain.PLAYER_ICON);

        // 活动红点
        this.mark_active = NumUnit.initImage(btn_active.x + btn_active.width / 2 - 15, btn_active.y + btn_active.height / 2 - 15, UiRes.icon_red, shortcutMarks, tagMain.PLAYER_ICON);
        this.mark_active.setVisible(false);
        EventDispatcher.shared().addListener(EventConst.redMarkActivity, function() {
            _this.updateActivityGet();
        }, Delgate.delgate_MainScene);

        // 聊天
        this.btn_chat = new cc.MenuItemImage(ChatRes.chat_up, ChatRes.chat_down, this.openChatView, this);
        this.btn_chat.setPosition(this.btn_chat.width / 2, WINSIZE.height / 2);
        this.menu_chat = cc.Menu.create(this.btn_chat);
        this.menu_chat.setPosition(0, 0);
        this.addChild(this.menu_chat, tagMain.LANTERN_FLOOR);

        this.mark_chat = NumUnit.initImage(this.btn_chat.width - 15, this.btn_chat.height - 15, UiRes.icon_red, null);
        this.btn_chat.addChild(this.mark_chat, 3);
        this.mark_chat.setVisible(false);

        // 等级礼包更新
        EventDispatcher.shared().addListener(EventConst.TeamLvUp, function() {
            _this.updateLvReward();
        }, Delgate.delgate_MainScene);

        // 签到红点标记
        EventDispatcher.shared().addListener(SVRCMD.SignInInfo, function(cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(Delgate.delgate_MainScene, SVRCMD.SignInInfo);
            var errorcode = pkgReader.getPkgError(data);
            if (errorcode)
            {
                return;
            }
            var date = new Date(Cache.getServerTime());
            var hasDays = data.data["days"];

            var isSignIn = false;
            for (var i in hasDays)
            {
                if (hasDays[i].day == date.getDate())
                {
                    isSignIn = true;
                    break;
                }
            }

            if (!isSignIn)
            {
                _this.mark_sign_in = NumUnit.initImage(btn_sign_in.x + btn_sign_in.width / 2 - 15, btn_sign_in.y + btn_sign_in.height / 2 - 15, UiRes.icon_red, _this, tagMain.PLAYER_ICON);

                EventDispatcher.shared().addListener(SVRCMD.SignIn, function(cmd, data) {
                    var errorcode = pkgReader.getPkgError(data);
                    if (errorcode)
                    {
                        return;
                    }

                    EventDispatcher.shared().removeListenerByDelgate(Delgate.delgate_MainScene, SVRCMD.SignIn);
                    _this.mark_sign_in.removeFromParent();
                    _this.mark_sign_in = null;
                }, Delgate.delgate_MainScene);
            }

            Netty.shared().sendPackage(SVRCMD.GetLvRewardInfo, []);
        }, Delgate.delgate_MainScene);

        // 获取等级礼包领取情况
        EventDispatcher.shared().addListener(SVRCMD.GetLvRewardInfo, function(cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.GetLvRewardInfo);
            var errorcode = pkgReader.getPkgError(data);
            if (errorcode)
            {
                return;
            }

            if (data.data)
                _this._gots = data.data;
            else
                _this._gots = [];
            _this.eventLvReward();

            Netty.shared().sendPackage(SVRCMD.MessageInfo, []);
        }, this);

        // 邮箱红点标记
        EventDispatcher.shared().addListener(SVRCMD.MessageInfo, function(cmd, data) {
            var errorcode = pkgReader.getPkgError(data);
            if (errorcode)
            {
                return;
            }

            // 更新购买体力次数
            Netty.shared().sendPackage(SVRCMD.DailyGet, ["PLAYER_GOODS2_COUNT_ID_1001"]);

            var messages = data.data["messages"];
            for (var id in messages)
            {
                var mail = new Mail(messages[id]);
                if (mail.has_read == Mail.READ_NONE)
                {
                    _this.mark_mail.setVisible(true);
                    //                    _this.mail_area.loadTextures("mainbg_mail_busy.png", "mainbg_mail_busy.png", "", ccui.Widget.PLIST_TEXTURE);
                    return;
                }
            }
            _this.mark_mail.setVisible(false);
            //            _this.mail_area.loadTextures("mainbg_mail.png", "mainbg_mail.png", "", ccui.Widget.PLIST_TEXTURE);
        }, Delgate.delgate_MainScene);

        // 聊天红点标记
        EventDispatcher.shared().addListener(SVRCMD.Chat, function(cmd, data) {
            var errorcode = pkgReader.getPkgError(data);
            if (errorcode)
            {
                return;
            }
            if (data.data && data.data.chat)
            {
                var chat = data.data.chat;
                if (chat.player_id != gamePlayer.id)
                {
                    if (chat.send_to == 0 || chat.send_to == -1 || chat.send_to == gamePlayer.id)
                    {
                        if (!_this.isOpenChat)
                        {
                            _this.mark_chat.setVisible(true);
                        }
                    }
                }
            }
        }, Delgate.delgate_MainScene);

        EventDispatcher.shared().addListener(EventConst.updatePrivateMark, function(cmd, data) {
            _this.mark_chat.setVisible(data[0]);
        }, Delgate.delgate_MainScene);

        // 初始请求是否有新私聊消息(有加红点)
        EventDispatcher.shared().addListener(SVRCMD.ChatMessage, function(cmd, data) {
            EventDispatcher.shared().removeListenerByDelgate(this, SVRCMD.ChatMessage);
            var errorcode = pkgReader.getPkgError(data);
            if (errorcode)
            {
                return;
            }
            var rawChats = (data.data && data.data.chats) ? data.data.chats : [];
            var unreadChats = [];
            for (var i = 0; i < rawChats.length; i++) {
                var c = rawChats[i];
                if (c && c.send_to == gamePlayer.id && c.player_id != gamePlayer.id) {
                    unreadChats.push(c);
                }
            }
            if (unreadChats.length > 0)
            {
                if (gameArmy.private_chat_create_time < unreadChats[0].create_time)
                    this.mark_chat.setVisible(true);
            }
        }, this);
        Netty.shared().sendPackage(SVRCMD.ChatMessage, [ChatConst.TYPE_PRIVATE]);

        // 更新购买体力次数
        EventDispatcher.shared().addListener(SVRCMD.DailyGet, function(cmd, data) {
            var errorcode = pkgReader.getPkgError(data);
            if (errorcode)
            {
                return;
            }
            if (data.data.key != "PLAYER_GOODS2_COUNT_ID_1001") return;

            _this._sp_buy_times = data.data["value"];

        }, Delgate.delgate_MainScene);

        Netty.shared().sendPackage(SVRCMD.SignInInfo, []);


        // 侦听人物信息
        EventDispatcher.shared().addListener(SVRCMD.PlayerAttr, function(cmd, data) {
            var errorcode = pkgReader.getPkgError(data);
            if (errorcode)
            {
                return;
            }

            if (_this._old_gold != gamePlayer.gold)
            {
                _this.txt_gold.setString(NumUnit.formatNum(gamePlayer.gold));
                var scale1 = cc.ScaleTo.create(0.25, 1.4);
                var ease1 = cc.EaseOut.create(scale1, 2);
                var scale2 = cc.ScaleTo.create(0.2, 1);
                _this.txt_gold.runAction(cc.Sequence.create(ease1, scale2));
            }
            if (_this._old_stone != gamePlayer.stone)
            {
                _this.txt_stone.setString(NumUnit.formatNum(gamePlayer.stone));
                var scale3 = cc.ScaleTo.create(0.25, 1.4);
                var ease2 = cc.EaseOut.create(scale3, 2);
                var scale4 = cc.ScaleTo.create(0.2, 1);
                _this.txt_stone.runAction(cc.Sequence.create(ease2, scale4));
            }
            _this._old_gold = gamePlayer.gold;
            _this._old_stone = gamePlayer.stone;

            _this.txt_lv.setString(gamePlayer.team_lv);
            _this.txt_name.setString(gamePlayer.team_name);
            _this.txt_vip.setString(gamePlayer.vip_lv);
            if (gamePlayer.vip_lv > 0)
                _this.txt_vip_floor.visible = true;
            if (gamePlayer.team_name == null || gamePlayer.team_name == "")
            {
                _this.txt_name.setString(LANSTR.nonameteam);
            }
            _this.txt_sp[0].setString(gamePlayer.sp);
            _this.txt_sp[1].setString("/" + Config.level[gamePlayer.team_lv].init_sp);
            if (gamePlayer.sp > Config.level[gamePlayer.team_lv].init_sp)
            {
                _this.txt_sp[0].color = gameColor.sky;
            } else
            {
                _this.txt_sp[0].color = cc.color.WHITE;
            }

            // 判断显示更新计时
            if (gamePlayer.sp < Config.level[gamePlayer.team_lv].init_sp)
            {
                _this.spBg.height = 180;
                _this.txt_sp_max.visible = false;
                _this.txt_sp_time.visible = true;
                _this.txt_time_all.visible = true;
                _this.txt_sp_gap.visible = true;
                _this._sp_waiting = false;
            } else
            {
                _this.spBg.height = 130;
                _this.txt_sp_max.visible = true;
                _this.txt_sp_time.visible = false;
                _this.txt_time_all.visible = false;
                _this.txt_sp_gap.visible = false;
                _this._sp_waiting = true;
            }

            if (_this._player_icon == gamePlayer.icon)
                return;
            _this._player_icon = gamePlayer.icon;
            var icon = gamePlayer.getIcon(null, true);
            var frame = gamePlayer.getFrame();
            img_player.setSpriteFrame(icon);
            var f1 = new cc.Sprite(frame);
            var f2 = new cc.Sprite(frame);
            icon_team.setNormalImage(f1);
            icon_team.setSelectedImage(f2);
            icon_team.stopAllActions();
            icon_team.scale = 0.8;
            
        }, Delgate.delgate_MainScene);

        // sp时时更新（显示当前时间）
        this.schedule(this.timeSpRunning, 1.0);
        this.checkPlayerHead();
    };
    var updateShortcuts = MainSceneLayer.prototype.updateZhuanPanPos;
    MainSceneLayer.prototype.updateZhuanPanPos = function () {
        var result = updateShortcuts.apply(this, arguments);
        if (this.zhuangPanMenu) this.zhuangPanMenu.setVisible(this._shortcutsExpanded !== false);
        return result;
    };
})();

(function () {
    if (typeof MapMainLayer === "undefined") return;
    if (typeof FightEmbattleView === "undefined") return;
    var TrainingEmbattle = FightEmbattleView.extend({
        requestBattle: function () {
            if (this._trainingPending) return;
            var self = this;
            var ids = this.army_arr.map(function (row) { return Number(row.id); });
            if (!ids.length || ids.some(function (id) { return id > Hero.Hire_ID_BASE; })) {
                Loading.remove();
                return NumUnit.prompts("Chọn ninja của bạn để vào Phòng Tập.");
            }
            var dispatcher = EventDispatcher.shared(), command = "LocalTrainingBattle";
            this._trainingPending = true;
            function finish() {
                self._trainingPending = false;
                dispatcher.removeListenerByDelgate(self, command);
                Loading.remove();
            }
            dispatcher.addListener(command, function (cmd, packet) {
                finish();
                if (pkgReader.getPkgError(packet)) return;
                var data = getVideoBattleRecData(packet.data.fight_data);
                if (!data || !data.bm) return NumUnit.prompts("Không đọc được trận tập.");
                var bm = BattleModle.getModleFromString(data.bm.split(","));
                var replay = new ReplayData(bm);
                replay.data = data;
                bm.replaydata = replay;
                bm.result = data.result;
                bm.resetForReplay();
                var bg = "res/background/bg_1028.jpg";
                Loading.loadRes(NumUnit.prepareLoadingRes([bm]).concat(res_fight, [bg]), function () {
                    var scene = new ReplayScene();
                    scene.setReplayData(bg, bm, false);
                    cc.director.runScene(scene);
                });
            }, this);
            this.scheduleOnce(function () {
                if (!self._trainingPending) return;
                finish();
                NumUnit.prompts("Chờ phản hồi quá lâu.");
            }, 12);
            Netty.shared().sendPackage(command, [ids]);
        }
    });
    function openTraining(map) {
        map.addChild(new TrainingEmbattle(50018, 1), 90);
    }
    var init = MapMainLayer.prototype.init_data;
    MapMainLayer.prototype.init_data = function () {
        var result = init.apply(this, arguments), map = this;
        if (this.btn_select !== MAPCONST.TAB_COMMON || !this.mapView) return result;
        var first = this.mapView.getPage ? this.mapView.getPage(0) : null;
        if (!first && this.mapView.getPages) first = this.mapView.getPages()[0];
        if (!first && this.mapView.getItems) first = this.mapView.getItems()[0];
        if (!first) return result;
        var entry = ccui.Button.create();
        entry.setTouchEnabled(true);
        entry.loadTextures("chapter_1001.png", "chapter_1001.png", "", ccui.Widget.PLIST_TEXTURE);
        entry.setScale(.68);
        entry.setPosition(812, 148);
        entry.addTouchEventListener(function (sender, type) {
            if (type === ccui.Widget.TOUCH_ENDED) openTraining(map);
        }, this);
        first.addChild(entry, 4);
        NumUnit.initLabelYellow(812, 95, first, 18, "Phòng Tập");
        return result;
    };
})();


// Local visual test for the Christmas tree event.
(function () {
    if (typeof MainSceneLayer === "undefined" || !MainSceneLayer.prototype.initPlayer) return;
    var asset = "res/lobby_noel/christmas-tree-event.png";
    var rewards = [
        {level:1, name:"Vàng", currency:"PRICE_GOLD", weight:3600, x:.30, y:.24},
        {level:1, name:"Thể lực", currency:"PRICE_SP", weight:2800, x:.69, y:.24},
        {level:1, name:"Kim cương", currency:"PRICE_STONE", weight:800, x:.57, y:.29},
        {level:1, name:"Sách EXP", id:10030, weight:2000, x:.40, y:.31},
        {level:10, name:"Vé Quét", id:40010, x:.33, y:.35},
        {level:20, name:"Tem", id:10230, x:.66, y:.35},
        {level:50, name:"Doll", id:10220, x:.50, y:.38},
        {level:101, name:"Kẹo", id:10210, weight:400, x:.36, y:.41},
        {level:201, name:"Bí", id:10140, weight:250, x:.62, y:.41},
        {level:301, name:"Huân Chương", id:10050, weight:145, x:.46, y:.46},
        {level:401, name:"Chìa khóa bạc", id:10420, weight:100, x:.40, y:.52},
        {level:501, name:"Mảnh Rasengan Vô Hình", id:31501, weight:75, x:.60, y:.54},
        {level:701, name:"Hồn Kinshiki", id:21070, weight:50, x:.46, y:.61},
        {level:901, name:"Chìa khóa sắt", id:10410, weight:40, x:.55, y:.67},
        {level:1000, name:"Chìa khóa vàng", id:10430, weight:10, x:.49, y:.75},
        {level:1, frameMarker:true},
        {"level":151,"equip":40403,"name":"Ngọc Né cấp 3","x":0.327,"y":0.469},
        {"level":151,"equip":40503,"name":"Ngọc Hút Máu cấp 3","x":0.529,"y":0.459},
        {"level":151,"equip":40603,"name":"Ngọc Sát Thương Chí Mạng cấp 3","x":0.676,"y":0.517},
        {"level":372,"equip":40404,"name":"Ngọc Né cấp 4","x":0.398,"y":0.544},
        {"level":372,"equip":40504,"name":"Ngọc Hút Máu cấp 4","x":0.593,"y":0.577},
        {"level":372,"equip":40604,"name":"Ngọc Sát Thương Chí Mạng cấp 4","x":0.307,"y":0.603},
        {"level":601,"equip":40405,"name":"Ngọc Né cấp 5","x":0.503,"y":0.623},
        {"level":601,"equip":40505,"name":"Ngọc Hút Máu cấp 5","x":0.665,"y":0.658},
        {"level":601,"equip":40605,"name":"Ngọc Sát Thương Chí Mạng cấp 5","x":0.371,"y":0.685},
        {"level":855,"equip":40406,"name":"Ngọc Né cấp 6","x":0.561,"y":0.715},
        {"level":855,"equip":40506,"name":"Ngọc Hút Máu cấp 6","x":0.435,"y":0.748},
        {"level":855,"equip":40606,"name":"Ngọc Sát Thương Chí Mạng cấp 6","x":0.597,"y":0.781}
    ];

    function levelCost(level) {
        return 4 + Math.floor((level - 1) / 100);
    }

    function progress(total) {
        var level = 1, xp = total;
        while (level < 1000 && xp >= levelCost(level)) {
            xp -= levelCost(level);
            level++;
        }
        return {level:level, xp:xp, cost:levelCost(level)};
    }

    var railwayReward = {name:"Đường Ray Noel", id:815, x:.49, y:.821};
    function rewardIcon(reward) {
        if (reward === railwayReward) return cc.Sprite.create("res/avatar_frames/815.png");
        if (reward.currency) return cc.Sprite.create(ConfigGoods2.getTexture(ConfigGoods2[reward.currency]));
        var config = reward.equip ? Config.equip[reward.equip] : Config.item[reward.id];
        return config ? NumUnit.getIconImageByData(config) : null;
    }

    function fit(icon, size) {
        var dimensions = icon.getContentSize();
        if (dimensions.width > 0 && dimensions.height > 0) {
            icon.setScale(size / Math.max(dimensions.width, dimensions.height));
        }
    }

    function menuButton(text, x, y, callback) {
        var item = new cc.MenuItemImage(UiRes.button_middle_up, UiRes.button_middle_down, callback);
        NumUnit.initLabelYellow(item.width / 2, item.height / 2, item, 22, text);
        item.setPosition(x, y);
        return item;
    }

    function open(scene) {
        if (scene._christmasTreeView) return;
        var tree = cc.Sprite.create(asset);
        if (!tree) return;
        var root = new cc.Layer();
        var width = WINSIZE.width, height = WINSIZE.height, center = width / 2;
        var size = Math.min(width * .76, height * .93);
        center = Math.min(center, width - size * .48);
        var positionY = size * .479 + 1;
        var totalXp = 0, remaining = 0;
        var dispatcher = EventDispatcher.shared();
        var busy = false;
        var hanging = [];
        var railwayEntry = {reward:railwayReward, icon:null};

        scene._christmasTreeView = root;
        scene._noelActivityMenu.setVisible(false);
        cc.director.getRunningScene().addChild(root, 20000);
        var visibleSize = cc.director.getVisibleSize();
        var visibleOrigin = cc.director.getVisibleOrigin();
        var shade = new cc.LayerColor(cc.color(4, 9, 20, 211),
            Math.max(width, visibleSize.width), Math.max(height, visibleSize.height));
        shade.setPosition(Math.min(0, visibleOrigin.x), Math.min(0, visibleOrigin.y));
        root.addChild(shade, -3);

        function addGlow(x, y, wide, tall, low, high, duration) {
            var glow = cc.Sprite.create("res/lobby_noel/building-glow.png");
            if (!glow) return;
            var dimensions = glow.getContentSize();
            glow.setPosition(x, y);
            glow.setScaleX(wide / dimensions.width);
            glow.setScaleY(tall / dimensions.height);
            glow.setOpacity(low);
            root.addChild(glow, -2);
            glow.runAction(cc.repeatForever(cc.sequence(cc.fadeTo(duration, high), cc.fadeTo(duration, low))));
        }
        addGlow(center, positionY + size * .02, size * 1.42, size * 1.24, 176, 224, 2.5);
        addGlow(center - size * .19, positionY - size * .13, size * .67, size * .63, 116, 179, 2.8);
        addGlow(center + size * .17, positionY - size * .04, size * .64, size * .63, 112, 170, 2.3);
        addGlow(center, positionY + size * .42, size * .46, size * .46, 177, 246, 2.0);
        var swallow = cc.EventListener.create({
            event: cc.EventListener.TOUCH_ONE_BY_ONE,
            swallowTouches: true,
            onTouchBegan: function () { return true; }
        });
        cc.eventManager.addListener(swallow, root);

        tree.setPosition(center, positionY);
        fit(tree, size);
        root.addChild(tree);
        var treeSize = tree.getContentSize();
        var treeScale = tree.getScale();
        var levelText = new cc.LabelTTF("…", "Arial", Math.round(Math.min(23, size * .047) / treeScale));
        levelText.setColor(cc.color(80, 42, 13));
        levelText.setAnchorPoint(.5, .5);
        levelText.setPosition(treeSize.width * .50, treeSize.height * .931);
        tree.addChild(levelText, 2);
        var xpText = NumUnit.initLabelYellow(treeSize.width * .481, treeSize.height * .844, tree,
            Math.round(Math.min(13, size * .026) / treeScale), "");
        var giftX = center + size * .008;
        var giftY = positionY - size * .441;
        var milestone = NumUnit.initLabelYellow(giftX, giftY + 51, root, 15, "");
        var giftName = NumUnit.initLabelYellow(giftX, giftY + 32, root, 15, "");
        milestone.setLocalZOrder(8);
        giftName.setLocalZOrder(8);
        var status = NumUnit.initLabelYellow(Math.min(width - 108, center + size * .43),
            positionY - size * .23, root, 16, "Đang tải tiến độ…");
        status.setLocalZOrder(8);
        var queue = new cc.Node();
        root.addChild(queue, 7);
        var shownNext = null;
        var canWidth = treeSize.width * treeScale * .25;
        var canHeight = treeSize.height * treeScale * .135;
        var hitArea = cc.Sprite.create();
        hitArea.setContentSize(cc.size(canWidth, canHeight));
        var water = new cc.MenuItemSprite(hitArea, null, function () { draw(1); }, root);
        water.setPosition(center + treeSize.width * treeScale * (.29 - .5),
            positionY + treeSize.height * treeScale * (.105 - .5));
        var countText = NumUnit.initLabelYellow(treeSize.width * .304, treeSize.height * .107, tree,
            Math.round(Math.min(18, size * .035) / treeScale), "…");
        NumUnit.initLabelYellow(treeSize.width * .304, treeSize.height * .075, tree,
            Math.round(Math.min(13, size * .025) / treeScale), "Tưới");
        var close = menuButton("Đóng", width - 75, height - 32, function () {
            if (busy) return;
            dispatcher.removeListenerByDelgate(root, "LocalChristmasTreeInfo");
            dispatcher.removeListenerByDelgate(root, "LocalChristmasTreeWater");
            dispatcher.removeListenerByDelgate(root, "LocalChristmasCommunityClaim");
            scene._christmasTreeView = null;
            scene._noelActivityMenu.setVisible(scene._shortcutsExpanded !== false);
            root.removeFromParent(true);
        });
        close.setScale(.7);
        var bulkX = Math.min(width - 104, center + size * .63);
        var results = new cc.Node();
        results.setPosition(bulkX, positionY + size * .25);
        root.addChild(results, 9);
        function quickWater(count, side) {
            var control = menuButton(count + " lần", 0, 21, function () { draw(count); });
            var buttonWidth = Math.min(96, width * .13);
            control.setScale(Math.min(buttonWidth / control.width, 38 / control.height));
            control.setPosition(water.x + side * (buttonWidth / 2 + 5), 21);
            return control;
        }
        var waterTen = quickWater(10, -1);
        var waterHundred = quickWater(100, 1);
        function setWaterControls(enabled) {
            water.setEnabled(enabled && remaining > 0);
            waterTen.setEnabled(enabled && remaining >= 10);
            waterHundred.setEnabled(enabled && remaining >= 100);
        }
        var menu = cc.Menu.create(water, waterTen, waterHundred, close);
        menu.setPosition(0, 0);
        root.addChild(menu, 20);

        var communityBars = [
            communityBar("Server này", "local", width * .20, cc.color(103, 210, 255, 255)),
            communityBar("Toàn server", "all", width * .80, cc.color(255, 201, 111, 255))
        ];
        function communityBar(title, scope, x, tint) {
            var half = Math.min(124, width * .145), y = 10;
            var draw = cc.DrawNode.create();
            draw.setPosition(x, y);
            root.addChild(draw, 10);
            function pill(left, bottom, right, top, radius, fill, border, line) {
                radius = Math.min(radius, (right-left)/2, (top-bottom)/2);
                var points = [];
                for (var i = 0; i < 4; i++) {
                    var cx = i < 2 ? right-radius : left+radius;
                    var cy = i === 0 || i === 3 ? bottom+radius : top-radius;
                    for (var j = 0; j <= 4; j++) {
                        var angle = (i-1) * Math.PI/2 + j * Math.PI/8;
                        points.push(cc.p(cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius));
                    }
                }
                draw.drawPoly(points, fill, line, border);
            }
            var label = new cc.LabelTTF(title, "Arial", 15);
            label.setAnchorPoint(0, .5);
            label.setPosition(x-half+14,y+26);
            label.setColor(cc.color(226,240,254));
            root.addChild(label, 11);
            var value = new cc.LabelTTF("…", "Arial", 15);
            value.setAnchorPoint(1, .5);
            value.setPosition(x+half-14,y+26);
            value.setColor(tint);
            root.addChild(value, 11);
            var claimButton = menuButton("Nhận quà", x, y + 60, function () {
                claimButton.setEnabled(false);
                Netty.shared().sendPackage("LocalChristmasCommunityClaim", [scope]);
            });
            claimButton.setScale(.57);
            claimButton.setVisible(false);
            menu.addChild(claimButton);
            return function (state) {
                claimButton.setVisible(!!(state && state.reward && !state.claimed));
                claimButton.setEnabled(true);
                draw.clear();
                pill(-half,0,half,42,10,cc.color(13,29,52,235),cc.color(125,170,201,175),1);
                pill(-half+12,8,half-12,15,3,cc.color(35,56,80,255),cc.color(35,56,80,255),0);
                var ratio = state ? Math.max(0, Math.min(1, state.current / state.target)) : 0;
                if (ratio > 0) {
                    var edge = -half+13 + Math.max(1,(half*2-26)*ratio);
                    pill(-half+13,9,edge,14,2.5,tint,tint,0);
                }
                var percent = Math.floor(ratio*1000000)/10000;
                value.setString(state ? (state.claimed ? "Đã nhận" : String(percent).replace(".", ",") + "%") : "—");
            };
        }
        function updateCommunity(state) {
            if (!state) return;
            communityBars[0](state.local);
            communityBars[1](state.all);
        }

        function drawProgress() {
            var state = progress(totalXp);
            var maxed = state.level === 1000;
            levelText.setString(String(state.level));
            xpText.setString(maxed ? "Tối đa" : state.xp + " / " + state.cost + " EXP");
            var nextRewards = rewards.filter(function (reward) { return !reward.frameMarker && reward.level > state.level; }).sort(function(a,b) { return a.level-b.level; }); var next = nextRewards[0];
            if (shownNext === next) return;
            shownNext = next;
            queue.removeAllChildren(true);
            milestone.setString(next ? "Cấp " + next.level + " treo thêm" : "");
            giftName.setString(next ? next.name : "");
            giftName.setScale(Math.min(1, 175 / Math.max(1, giftName.width)));
            if (!next) return;
            var upcoming = nextRewards;
            var spacing = Math.min(6, size * .01);
            upcoming.forEach(function (reward, index) {
                var icon = rewardIcon(reward);
                if (!icon) return;
                var x = giftX + index * spacing;
                var y = giftY + index * spacing * .30;
                fit(icon, Math.min(42, size * .082));
                queue.addChild(icon, upcoming.length - index);
                if (index === 0) {
                    icon.setPosition(x - size * .09, y + size * .18);
                    icon.runAction(cc.sequence(cc.moveTo(.45, cc.p(x, y)),
                        cc.moveBy(.10, cc.p(0, 5)), cc.moveBy(.12, cc.p(0, -5))));
                } else {
                    icon.setPosition(x, y);
                    icon.setOpacity(230);
                }

            });
        }

        function syncRewards() {
            if (!railwayEntry.icon) {
                var frame = rewardIcon(railwayReward);
                if (frame) {
                    fit(frame, size * .105);
                    frame.setAnchorPoint(.5, 1);
                    frame.setPosition(center + size * (railwayReward.x - .5), positionY + size * (railwayReward.y - .5));
                    root.addChild(frame, 3);
                    if (scene.animateRailwayReward) scene.animateRailwayReward(frame, false);
                    railwayEntry.icon = frame;
                }
            }
            var level = progress(totalXp).level;
            rewards.forEach(function (reward, index) {
                if (hanging[index] || reward.level > level) return;
                var icon = rewardIcon(reward);
                if (icon) {
                    fit(icon, size * .067);
                    icon.setAnchorPoint(.5, 1);
                    icon.setPosition(center + size * (reward.x - .5), positionY + size * (reward.y - .5));
                    root.addChild(icon, 3);
                }
                hanging[index] = {reward:reward, icon:icon};
                return false;
            });
        }

        function spray() {
            for (var index = 0; index < 14; index++) {
                var drop = cc.DrawNode.create();
                drop.drawDot(cc.p(0, 0), 2 + index % 2, cc.color(161, 224, 255, 220));
                drop.setPosition(center + size * (.21 + index % 4 * .025),
                    Math.min(height - 45, positionY + size * .43));
                root.addChild(drop, 5);
                drop.runAction(cc.sequence(cc.delayTime(index * .025),
                    cc.spawn(cc.moveBy(.43, cc.p(-size * (.12 + index % 4 * .025), -size * (.17 + index % 5 * .026))),
                        cc.fadeOut(.43)),
                    cc.callFunc(function (node) { node.removeFromParent(true); })));
            }
        }

        function draw(count) {
            if (busy || remaining < count) return;
            results.removeAllChildren(true);
            busy = true;
            setWaterControls(false);

            close.setEnabled(false);
            status.setString("Đang tưới nước…");
            var request = {};
            waitingForWater = request;
            Netty.shared().sendPackage("LocalChristmasTreeWater", [count]);
            root.scheduleOnce(function () {
                if (waitingForWater !== request) return;
                waitingForWater = null;
                finish("Mất kết nối. Mở lại Cây Noel để đồng bộ.");
                setWaterControls(false);

            }, 8);
        }

        var waitingForWater = null;
        function finish(text) {
            busy = false;
            close.setEnabled(true);
            setWaterControls(true);

            countText.setString(String(remaining));
            status.setString(text);
            status.setScale(Math.min(1, 174 / Math.max(1, status.width)));
        }

        function animateReward(data, entry) {
            var reward = entry.reward;
            spray();
            root.runAction(cc.sequence(cc.delayTime(.57), cc.callFunc(function () {
                tree.runAction(cc.sequence(cc.rotateTo(.23, -.65), cc.rotateTo(.33, .5), cc.rotateTo(.36, 0)));
                hanging.concat(railwayEntry).forEach(function (slot, index) {
                    if (!slot || !slot.icon) return;
                    var angle = index % 2 ? -7 : 7;
                    slot.icon.runAction(cc.sequence(cc.delayTime(index % 3 * .045), cc.rotateTo(.20, angle),
                        cc.rotateTo(.28, -angle * .72), cc.rotateTo(.28, angle * .34), cc.rotateTo(.24, 0)));
                });
            }), cc.delayTime(1.14), cc.callFunc(function () {
                if (entry.icon) {
                    entry.icon.runAction(cc.moveTo(.58, cc.p(entry.icon.x, 124)));
                }
            }), cc.delayTime(.64), cc.callFunc(function () {
                if (entry.icon) {
                    entry.icon.setPosition(center + size * (reward.x - .5), positionY + size * (reward.y - .5));
                }
                totalXp = data.xp;
                remaining = data.remaining;
                updateCommunity(data.community);
                syncRewards();
                drawProgress();
                if (data.count > 1) {
                    showResults(data.counts, data.count);
                    finish("Đã tưới " + data.count + " lần");
                } else {
                    finish(reward === railwayReward ? "Đã nhận khung Đường Ray Noel" : "Nhận " + (data.counts[data.reward] || 1) + " " + reward.name);
                }
            })));
        }

        function showResults(counts, count) {
            var slots = Object.keys(counts);
            NumUnit.initLabelYellow(0, 14, results, 17, "Quà nhận · " + count + " lượt");
            var columns = Math.min(3, slots.length);
            var columnWidth = 66;
            slots.forEach(function (key, index) {
                var reward = Number(key) === 15 ? railwayReward : rewards[Number(key)], icon = rewardIcon(reward);
                if (!icon) return;
                var x = (index % columns - (columns - 1) / 2) * columnWidth;
                var y = -10 - Math.floor(index / columns) * 45;
                fit(icon, 27);
                icon.setPosition(x, y);
                results.addChild(icon);
                var amount = String(counts[key]).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                var label = NumUnit.initLabelYellow(x, y - 17, results, 13, "×" + amount);
                label.setScale(Math.min(1, (columnWidth - 6) / Math.max(1, label.getContentSize().width)));
            });
        }

        setWaterControls(false);

        dispatcher.addListener("LocalChristmasTreeInfo", function (cmd, packet) {
            if (pkgReader.getPkgError(packet)) {
                status.setString("Không tải được tiến độ Cây Noel.");
                return;
            }
            totalXp = packet.data.xp;
            remaining = packet.data.remaining;
            updateCommunity(packet.data.community);
            drawProgress();
            syncRewards();
            finish(remaining > 0 ? "Kiếm hôm nay: " + (packet.data.earned || 0) + "/1.000" : "Làm hoạt động để kiếm lượt tưới");
        }, root);
        dispatcher.addListener("LocalChristmasTreeWater", function (cmd, packet) {
            if (!waitingForWater) return;
            waitingForWater = false;
            if (pkgReader.getPkgError(packet)) {
                finish("Không thể tưới. Mở lại Cây Noel để đồng bộ.");
                setWaterControls(false);

                return;
            }
            var entry = hanging[packet.data.reward];
            if (packet.data.reward === 15) entry = railwayEntry;
            if (!entry) {
                finish("Tiến độ đã đổi. Mở lại Cây Noel để đồng bộ.");
                setWaterControls(false);

                return;
            }
            animateReward(packet.data, entry);
        }, root);
        syncRewards();
        dispatcher.addListener("LocalChristmasCommunityClaim", function (cmd, packet) {
            if (pkgReader.getPkgError(packet)) {
                Netty.shared().sendPackage("LocalChristmasTreeInfo", []);
                return;
            }
            updateCommunity(packet.data.community);
            finish(packet.data.amount ? "Nhận " + packet.data.amount + " Chìa khóa vàng" : "Đã nhận quà mốc này");
        }, root);
        Netty.shared().sendPackage("LocalChristmasTreeInfo", []);
    }

    var initPlayer = MainSceneLayer.prototype.initPlayer;
    MainSceneLayer.prototype.initPlayer = function () {
        var result = initPlayer.apply(this, arguments);
        var scene = this;
        function makeBadge(pressed) {
            var badge = cc.Sprite.create();
            badge.setContentSize(cc.size(84, 88));
            var rim = cc.DrawNode.create();
            rim.drawDot(cc.p(42, 49), 39, cc.color(32, 43, 61, 255));
            rim.drawDot(cc.p(42, 50), 37, cc.color(230, 238, 245, 255));
            rim.drawDot(cc.p(42, 50), 34, cc.color(122, 143, 162, 255));
            rim.drawDot(cc.p(42, 50), 32, pressed ? cc.color(63, 112, 126, 255) : cc.color(22, 66, 88, 255));
            badge.addChild(rim);
            var picture = cc.Sprite.create(asset);
            fit(picture, 59);
            picture.setPosition(42, 50);
            badge.addChild(picture);
            NumUnit.initLabelYellow(42, 14, badge, 16, "Cây Noel");
            return badge;
        }
        var button = new cc.MenuItemSprite(makeBadge(false), makeBadge(true), function () {
            open(scene);
        }, scene);
        button.setPosition(Math.min(this._noelActivityRowX, WINSIZE.width - 50), this._noelActivityRowY);
        var menu = cc.Menu.create(button);
        menu.setPosition(0, 0);
        this._noelActivityMenu = menu;
        this.addChild(menu, tagMain.PLAYER_ICON);
        return result;
    };
})();

(function () {
    var id = 814;
    var texture = "res/avatar_frames/814.png";
    function register() {
        if (typeof Config !== "undefined" && Config.item) Config.item[id] = {"id":814,"name":"Đêm Tuyết Noel","icon_id":"814","item_type":10,"quality":2,"sell_price":0,"desc":"Khung sự kiện Noel"};
        if (typeof Config !== "undefined" && Config.item) Config.item[815] = {
            id:815, name:"Đường Ray Noel", icon_id:"815", item_type:10, quality:2, sell_price:0, desc:"Thưởng vòng quay Noel"
        };
        if (!cc.spriteFrameCache.getSpriteFrame("item_815.png")) {
            cc.spriteFrameCache.addSpriteFrame(new cc.SpriteFrame("res/avatar_frames/815.png", cc.rect(0, 0, 132, 132)), "item_815.png");
        }
        var key = "item_814.png";
        if (!cc.spriteFrameCache.getSpriteFrame(key)) {
            cc.spriteFrameCache.addSpriteFrame(new cc.SpriteFrame(texture, cc.rect(0, 0, 152, 152)), key);
        }
    }
    if (typeof Player !== "undefined") {
        var reset = Player.prototype.onReset;
        Player.prototype.onReset = function () {
            register();
            return reset.apply(this, arguments);
        };
        var getFrame = Player.prototype.getFrame;
        Player.prototype.getFrame = function (icon, noSymbol) {
            var frameId = Math.floor((icon || this.icon) / 100000);
            if (frameId === id || frameId === 815) register();
            return getFrame.apply(this, arguments);
        };
    }
    register();
    function animateRailway(button, equippedOnly) {
        var ride = new cc.Node();
        ride.setContentSize(cc.size(256, 151));
        var poses = [0, 1, 2].map(function (index) {
            return cc.Sprite.create("res/avatar_frames/815-pose-" + index + ".png");
        });
        if (poses.some(function (sprite) { return !sprite; })) return;
        poses.forEach(function (sprite) {
            sprite.setPosition(128, 75.5);
            ride.addChild(sprite);
        });
        ride.setVisible(false);
        var snow = cc.DrawNode.create();
        button.addChild(snow, 3);
        button.addChild(ride, 4);
        var time = 0, previous = -1, nextGift = .24;
        var gifts = [];
        var wraps = [[229,58,66],[39,178,144],[83,138,240]];
        var giftIndex = 0;
        button.schedule(function (dt) {
            var visible = !equippedOnly || Math.floor(gamePlayer.icon / 100000) === 815;
            ride.setVisible(visible);
            snow.setVisible(visible);
            if (!visible) return;
            time += dt;
            snow.clear();
            for (var index = 0; index < 9; index++) {
                var fall = (time * (.32 + index % 3 * .045) + index * .382) % 1;
                var edgeX = index % 2 ? .91 : .09;
                var flakeX = button.width * (edgeX + Math.sin(fall * 5 + index) * .035);
                var flakeY = button.height * (.94 - fall * .88);
                var opacity = Math.round(Math.sin(fall * Math.PI) * 157);
                var ice = cc.color(231, 248, 255, opacity);
                if (index % 3 !== 0) {
                    snow.drawDot(cc.p(flakeX, flakeY), .85, ice);
                    continue;
                }
                var radius = Math.max(2.1, button.width * (.024 + index * .001));
                var origin = cc.p(flakeX, flakeY);
                for (var arm = 0; arm < 6; arm++) {
                    var angle = time * .55 + index + arm * Math.PI / 3;
                    var ux = Math.cos(angle), uy = Math.sin(angle);
                    snow.drawSegment(origin, cc.p(flakeX + ux * radius, flakeY + uy * radius), .29, ice);
                    var branch = cc.p(flakeX + ux * radius * .62, flakeY + uy * radius * .62);
                    for (var side = -1; side <= 1; side += 2) {
                        var diagonal = angle + side * .76;
                        snow.drawSegment(branch, cc.p(branch.x + Math.cos(diagonal) * radius * .32,
                            branch.y + Math.sin(diagonal) * radius * .32), .22, ice);
                    }
                }
            }
            var edge = .828, r = .185, straight = edge - 2 * r, part = straight + r * Math.PI / 2;
            var distance = (time % 7.2) / 7.2 * 4 * part;
            var side = Math.min(3, Math.floor(distance / part)), offset = distance - side * part;
            var turn = Math.max(0, (offset - straight) / r);
            var x = r + Math.min(straight, offset) + Math.sin(turn) * r, y = r * (1 - Math.cos(turn));
            var point = [[x,y],[edge-y,x],[edge-x,edge-y],[y,edge-x]][side];
            ride.setPosition(button.width * (.081 + point[0]), button.height * (.918 - point[1]));
            ride.setAnchorPoint(.5, .10);
            ride.setScale(button.width * .46 / 256);
            var direction = side * Math.PI / 2 + turn;
            ride.setRotation(direction * 180 / Math.PI);
            if (time >= nextGift) {
                var dx = Math.cos(direction), dy = -Math.sin(direction);
                var width = button.width;
                var sideSign = giftIndex % 2 ? -1 : 1;
                for (var n = 0; n < 3; n++) {
                    var speed = .047 + n * .033;
                    gifts.push({time:time + n * .042,
                        x:ride.x - dx * width * (.11 + n * .022),
                        y:ride.y - dy * width * (.11 + n * .022),
                        vx:(dy * speed * sideSign - dx * (.035 + n * .012)) * width,
                        vy:(-dx * speed * sideSign - dy * (.035 + n * .012)) * width,
                        size:width * [.024,.017,.020][n],
                        tilt:(n - 1) * .21, color:wraps[(giftIndex + n) % wraps.length]});
                }
                giftIndex++;
                nextGift = time + .38;
            }
            while (gifts.length && time - gifts[0].time >= .82) gifts.shift();
            gifts.forEach(function (gift) {
                var age = time - gift.time;
                if (age < 0) return;
                var x = gift.x + gift.vx * age, y = gift.y + gift.vy * age + 3 * Math.sin(Math.PI * age / .82);
                var half = Math.max(1, gift.size);
                var alpha = Math.round(248 * Math.min(1, (.82 - age) / .26));
                var angle = gift.tilt + age * gift.tilt;
                var cos = Math.cos(angle), sin = Math.sin(angle);
                function point(px, py) {
                    return cc.p(x + half * (px * cos - py * sin), y + half * (px * sin + py * cos));
                }
                function shape(coords, color) {
                    snow.drawPoly(coords.map(function (p) { return point(p[0], p[1]); }), color, 0, color);
                }
                var rgb = gift.color;
                var face = cc.color(rgb[0], rgb[1], rgb[2], alpha);
                var shadow = cc.color(rgb[0] * .62 | 0, rgb[1] * .62 | 0, rgb[2] * .62 | 0, alpha);
                var lid = cc.color(Math.min(255,rgb[0]+33), Math.min(255,rgb[1]+33), Math.min(255,rgb[2]+33), alpha);
                var ribbon = cc.color(255, 216, 122, alpha);
                shape([[-1,-.78],[.60,-.78],[.60,.51],[-1,.51]], face);
                shape([[.60,-.78],[1,-.51],[1,.73],[.60,.51]], shadow);
                shape([[-1.06,.42],[.61,.42],[1.04,.70],[-.64,.70]], lid);
                shape([[-.34,-.78],[-.10,-.78],[-.10,.54],[-.34,.54]], ribbon);
                shape([[-.33,.68],[-.72,1],[-.52,1.12],[-.19,.81],[.18,1.12],[.39,.98],[-.04,.68]], ribbon);
            });
            var pose = [0,1,2,1][Math.floor(time * 10) % 4];
            if (pose !== previous) {
                poses.forEach(function (sprite, index) { sprite.setVisible(index === pose); });
                previous = pose;
            }
        }, 1 / 24);
    }
    function animateNoelFrame(button, equippedOnly) {
        var effects = cc.DrawNode.create();
        button.addChild(effects, 2);
        var elapsed = 0;
        effects.schedule(function (dt) {
            effects.clear();
            if (equippedOnly && Math.floor(gamePlayer.icon / 100000) !== id) return;
            elapsed += dt;
            var w = button.width, h = button.height;
            for (var i = 0; i < 48; i++) {
                var phase = (elapsed * (.31 + i % 5 * .05) + i * .381966) % 1;
                var x = w * (.12 + (i * 37 % 76) / 100) + Math.sin(phase * 5 + i) * 2;
                var y = h * (.92 - phase * .86);
                var alpha = Math.round(Math.sin(phase * Math.PI) * 190);
                effects.drawDot(cc.p(x, y), i % 6 === 0 ? 1.85 : .95, cc.color(226, 247, 255, alpha));
                if (i % 8 === 0) {
                    for (var arm = 0; arm < 6; arm++) {
                        var angle = phase + arm * Math.PI / 3;
                        effects.drawDot(cc.p(x + Math.cos(angle) * 2.4, y + Math.sin(angle) * 2.4),
                            .5, cc.color(228, 250, 255, alpha));
                    }
                }
            }
            var orbit = (elapsed / 3.8) % 1 * 4;
            var edge = Math.floor(orbit), phaseOnEdge = orbit - edge;
            var trailX = [.09 + .81 * phaseOnEdge, .90, .90 - .81 * phaseOnEdge, .09][edge] * w;
            var trailY = [.89, .89 - .80 * phaseOnEdge, .09, .09 + .80 * phaseOnEdge][edge] * h;
            effects.drawDot(cc.p(trailX, trailY), 3.4, cc.color(101, 183, 255, 120));
            effects.drawDot(cc.p(trailX, trailY), 1.7, cc.color(228, 250, 255, 242));
            var pulse = Math.round(100 + Math.sin(elapsed * 1.8) * 90);
            effects.drawDot(cc.p(w * .82, h * .76), 4, cc.color(255, 208, 91, pulse / 3 | 0));
            effects.drawDot(cc.p(w * .82, h * .76), 1.6, cc.color(255, 244, 191, pulse));
        }, 1 / 24);
    }
    if (typeof MainSceneLayer !== "undefined") {
        MainSceneLayer.prototype.animateRailwayReward = animateRailway;
        MainSceneLayer.prototype.animateNoelAvatarFrame = function (button, equippedOnly) {
            animateNoelFrame(button, equippedOnly);
            animateRailway(button, equippedOnly);
        };
    }
    var initImage = NumUnit.initImage;
    NumUnit.initImage = function (x, y, textureName) {
        var sprite = initImage.apply(this, arguments);
        if (sprite && (textureName === "#item_814.png" || textureName === "item_814.png")) {
            animateNoelFrame(sprite, false);
        }
        if (sprite && (textureName === "#item_815.png" || textureName === "item_815.png")) animateRailway(sprite, false);
        return sprite;
    };
    var initImageTwo = NumUnit.initImageTwo;
    NumUnit.initImageTwo = function (x, y, portrait, frame) {
        if (frame !== "#item_815.png" && frame !== "item_815.png") {
            return initImageTwo.apply(this, arguments);
        }
        var overlay = cc.Sprite.create("#item_815.png");
        if (!overlay) return initImageTwo.apply(this, arguments);
        var args = Array.prototype.slice.call(arguments);
        args[3] = overlay;
        var avatar = initImageTwo.apply(this, args);
        animateRailway(overlay, false);
        return avatar;
    };
    var initButtonUI = NumUnit.initButtonUI;
    NumUnit.initButtonUI = function (normal) {
        var button = initButtonUI.apply(this, arguments);
        if (button && (normal === "#item_814.png" || normal === "item_814.png")) {
            animateNoelFrame(button, false);
        }
        if (button && (normal === "#item_815.png" || normal === "item_815.png")) animateRailway(button, false);
        return button;
    };
})();

(function () {
    if (typeof MainSceneLayer === "undefined") return;
    MainSceneLayer.prototype.openOnlineNoelGift = function () {
        var lobby = this;
        if (lobby._onlineGiftView) return;
        var root = new cc.Layer();
        lobby._onlineGiftView = root;
        var w = WINSIZE.width, h = WINSIZE.height;
        var panelW = Math.min(650,w - 36), panelH = Math.min(374,h - 30);
        var x = w / 2, y = h / 2;
        cc.director.getRunningScene().addChild(root, 20000);
        root.addChild(new cc.LayerColor(cc.color(3,9,23,172), w,h));
        cc.eventManager.addListener(cc.EventListener.create({event:cc.EventListener.TOUCH_ONE_BY_ONE,
            swallowTouches:true,onTouchBegan:function(){return true;}}),root);
        var bagFrame = cc.spriteFrameCache.getSpriteFrame("bag_mainpanel.png");
        if (!bagFrame) {
            cc.spriteFrameCache.addSpriteFrames(res.Bag_plist);
            bagFrame = cc.spriteFrameCache.getSpriteFrame("bag_mainpanel.png");
        }
        if (bagFrame) {
            var panel = new cc.Sprite(bagFrame);
            panel.setPosition(x,y);
            panel.setScaleX(panelW / panel.width);
            panel.setScaleY(panelH / panel.height);
            root.addChild(panel,1);
        } else {
            NumUnit.initScale9Sprite(x,y,panelW,panelH,root,4,1);
        }
        NumUnit.initLabelYellow(x,y+panelH/2-28,root,27,"Quà Online").setLocalZOrder(2);
        var timer = NumUnit.initLabelYellow(x,y+panelH/2-59,root,17,"Đang tải…");
        timer.setLocalZOrder(2);
        var menu = cc.Menu.create();
        menu.setPosition(0,0);
        root.addChild(menu,4);
        var dispatcher = EventDispatcher.shared(), pending = false;
        function button(px,py,text,action) {
            var btn = new cc.MenuItemImage(UiRes.button_middle_up,UiRes.button_middle_down,action,root);
            NumUnit.initLabelYellow(btn.width/2,btn.height/2,btn,23,text);
            btn.setPosition(px,py);
            btn.setScale(.62);
            menu.addChild(btn);
            return btn;
        }
        function close() {
            dispatcher.removeListenerByDelgate(root,"LocalOnlineGiftInfo");
            dispatcher.removeListenerByDelgate(root,"LocalOnlineGiftClaim");
            lobby._onlineGiftView = null;
            root.removeFromParent(true);
        }
        function refresh() {
            if (!pending) Netty.shared().sendPackage("LocalOnlineGiftInfo",[]);
        }
        function show(cmd,packet) {
            pending = false;
            if (pkgReader.getPkgError(packet)) return;
            var data = packet.data;
            timer.setString("Thời gian online hôm nay: " + Math.floor(data.seconds/60) + " phút" +
                (data.received ? "  ·  Đã nhận " + data.received + " chìa vàng" + (data.receivedTool ? " + " + data.receivedTool.amount + (data.receivedTool.id === 11021 ? " Tool 1" : " Tool") : "") : ""));
            menu.removeAllChildren(true);
            var itemLayer = root.getChildByTag(18415);
            if (itemLayer) itemLayer.removeFromParent(true);
            itemLayer = new cc.Node();
            root.addChild(itemLayer,2,18415);
            data.milestones.forEach(function (entry,index) {
                var tile = (panelW-32)/3, row = (panelH-86)/2;
                var px = x+(index%3-1)*tile;
                var py = y+panelH/2-77-row*(Math.floor(index/3)+.5);
                NumUnit.initScale9Sprite(px,py,tile-10,row-10,itemLayer,1);
                var detail = Math.max(22, Math.min(34,row*.26));
                NumUnit.initLabelYellow(px,py+detail,itemLayer,19,entry.minutes+" phút");
                function showReward(id, amount, cx, name) {
                    var icon = NumUnit.getIconImageByData(Config.item[id]);
                    if (icon) {
                        icon.setScale(27 / Math.max(1,icon.width,icon.height));
                        icon.setPosition(cx-17,py+2);
                        itemLayer.addChild(icon);
                    }
                    NumUnit.initLabelYellow(cx+9,py+2,itemLayer,14,"×"+amount+name);
                }
                showReward(10430,entry.amount,entry.tool ? px-tile*.22 : px,"");
                if (entry.tool) showReward(entry.tool.id,entry.tool.amount,px+tile*.14,
                    entry.tool.id === 11021 ? " Tool 1" : " Tool");
                var available = data.seconds >= entry.minutes*60 && !entry.claimed;
                var minutesLeft = Math.max(0, Math.ceil((entry.minutes*60-data.seconds)/60));
                if (!available) {
                    NumUnit.initLabelYellow(px,py-detail,itemLayer,15,entry.claimed ? "Đã nhận" : "Còn "+minutesLeft+" phút");
                    return;
                }
                button(px,py-detail,"Nhận quà",function () {
                    if (pending) return;
                    pending = true;
                    Netty.shared().sendPackage("LocalOnlineGiftClaim",[entry.minutes]);
                });
            });
        }
        NumUnit.initBtnClose(x+panelW/2-21,y+panelH/2-21,root,close,5);
        dispatcher.addListener("LocalOnlineGiftInfo",show,root);
        dispatcher.addListener("LocalOnlineGiftClaim",show,root);
        root.schedule(refresh,10);
        refresh();
    };
})();



;(function () {
    var assets = [[40401,"equip_40401.png"],[40402,"equip_40402.png"],[40403,"equip_40403.png"],[40404,"equip_40404.png"],[40405,"equip_40405.png"],[40406,"equip_40406.png"],[40407,"equip_40407.png"],[40408,"equip_40408.png"],[40409,"equip_40409.png"],[40410,"equip_40410.png"],[40501,"equip_40501.png"],[40502,"equip_40502.png"],[40503,"equip_40503.png"],[40504,"equip_40504.png"],[40505,"equip_40505.png"],[40506,"equip_40506.png"],[40507,"equip_40507.png"],[40508,"equip_40508.png"],[40509,"equip_40509.png"],[40510,"equip_40510.png"],[40601,"equip_40601.png"],[40602,"equip_40602.png"],[40603,"equip_40603.png"],[40604,"equip_40604.png"],[40605,"equip_40605.png"],[40606,"equip_40606.png"],[40607,"equip_40607.png"],[40608,"equip_40608.png"],[40609,"equip_40609.png"],[40610,"equip_40610.png"]];
    if (typeof cc === "undefined" || !cc.spriteFrameCache) return;
    var cache = cc.spriteFrameCache;
    var lookup = cache.getSpriteFrame;
    var paths = {};
    assets.forEach(function (entry) { paths["noel_gem_" + entry[0] + ".jpg"] = "res/gems_noel/" + entry[1]; });
    function registerGem(name) {
        var current = lookup.call(cache, name);
        if (current) return current;
        var texture = cc.textureCache.addImage(paths[name]);
        if (!texture) return null;
        var frame = cc.SpriteFrame.createWithTexture(texture, cc.rect(0,0,90,90));
        cache.addSpriteFrame(frame,name);
        return frame;
    }
    cache.getSpriteFrame = function(name) {
        var alias = typeof name === "string" && name.replace(/^equip_/, "noel_gem_");
        return paths[alias] ? registerGem(alias) : lookup.apply(this,arguments);
    };
    if (typeof Player !== "undefined" && Player.prototype.onReset) {
        var reset = Player.prototype.onReset;
        Player.prototype.onReset = function () {
            Object.keys(paths).forEach(registerGem);
            return reset.apply(this,arguments);
        };
    }

    if (typeof NumUnit !== "undefined" && NumUnit.getIconImageByData) {
        var originalIcon = NumUnit.getIconImageByData;
        NumUnit.getIconImageByData = function(data) {
            var name = data && "noel_gem_" + data.img_id + ".jpg";
            var frame = paths[name] && registerGem(name);
            return frame ? new cc.Sprite(frame) : originalIcon.apply(this,arguments);
        };
    }
})();
