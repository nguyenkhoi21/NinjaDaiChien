/**
 * Created with JetBrains WebStorm.
 * User: A2XM
 * Date: 14-5-19
 * Time: 下午5:45
 *
 * 英雄基本对象
 */


var womanHero = [10040, 10080, 10130, 10250, 10260, 10350, 10360, 10390, 10190, 15231, 15232, 15233, 10450, 10490, 10590, 10640, 10650, 10670, 10720, 10730, 10950, 10900, 10790, 10870];
//var mikey = "XMCHANGEITAPASSWORDKEY";
var micol = [
    "hp", "maxhp", "physicDmg", "physicDef", "magicDmg", "magicDef", "attackSpeed", "physicCirt", "magicCirt", "exp"
];

var Hero = cc.Class.extend({
    id: 0,
    config: null,    //ConfigHero
    quality: null,   //ConfigHeroQuality
    beasts: null,    // 尾兽信息
    beast: 0,        // 现有几尾兽（PK敌方用）
    status: 0,       // 是否获得 0 无， 1 有
    soul: 0,         // 当前魂魄数
    level: 1,
    exp: 0,
    maxExp: 0,
    maxhp: 0,
    physicDmg: 0,
    physicDef: 0,
    maxPower: 100,
    magicDmg: 0,
    magicDef: 0,
    attackSpeed: 0,
    powerSpeed: 0,
    attackRange: 0,
    physicCirt: 0,
    magicCirt: 0,
    _skills: [], //带入 战斗技能
    _equips: null,
    isboss: false,
    has_awake: 0,  // 0未觉醒，1已觉醒

    ischoosed: false,

    link: null,
    _tacticSkills: null,

    idle: 0, // 0闲置，1守营，2采矿
    bagate_level:0, // 八门等级

    female: -1,
    // 秘籍技能ID
    secret_1_id: null,
    secret_2_id: null,
    secret_3_id: null,
    secret_4_id: null,
    secret_5_id: null,
    secret_6_id: null,
    secret_1_lv: null,
    secret_2_lv: null,
    secret_3_lv: null,
    secret_4_lv: null,
    secret_5_lv: null,
    secret_6_lv: null,
    _severSkills: [], // 容错有些技能（比如没有技能6，现在是技能1是0，技能6是有数据） 六道+1时候
    _tfSkill:[],

    ctor: function(cfg) {
        this.config = cfg;
        this.id = cfg.id;
        this.attackSpeed = cfg.speed;
        this.quality = Config.heroQuality[1][this.id];
        this._skills = [];
        this.beasts = [];
        this._equips = [];
        this._tacticSkills = [];
        this.secret_1_id = 0;
        this.secret_2_id = 0;
        this.secret_3_id = 0;
        this.secret_4_id = 0;
        this.secret_5_id = 0;
        this.secret_6_id = 0;
        this.secret_1_lv = 0;
        this.secret_2_lv = 0;
        this.secret_3_lv = 0;
        this.secret_4_lv = 0;
        this.secret_5_lv = 0;
        this.secret_6_lv = 0;
        this._severSkills = [];
        this.bagate_level = 0;
        this._ninjatools = [];
    },

    clone: function(newid) {
        if (newid == undefined)
        {
            newid = this.id;
        }
        var rtn = new Hero(this.config);
        rtn.id = newid;
        rtn.maxhp = this.maxhp;
        rtn.exp = this.exp;
        rtn.level = this.level;
        rtn.physicDmg = this.physicDmg;
        rtn.physicDef = this.physicDef;
        rtn.maxExp = this.maxExp;
        rtn.maxPower = this.maxPower;
        rtn.magicDmg = this.magicDmg;
        rtn.magicDef = this.magicDef;
        rtn.attackSpeed = this.attackSpeed;
        rtn.powerSpeed = this.powerSpeed;
        rtn.attackRange = this.attackRange;
        rtn.physicCirt = this.physicCirt;
        rtn.magicCirt = this.magicCirt;
        rtn._skills = this._skills.slice(0);
        rtn.quality = this.quality;
        rtn.has_awake = this.has_awake ? 1 : 0;
        rtn._tacticSkills = this._tacticSkills.slice(0);

        return rtn;
    },

    // 已存在时更新
    update: function(data) {
        this.updateQuality(data);
        if (data.quality)
        {
            this.updateSkill(data);
            this.addEquip(data);
        }

        this.updateNinjaTool(data)
    },

    // 初始创建时
    initUpdate: function(data) {
        // Phải gán has_awake TRƯỚC initSkill → installAwakenSkill, nếu không replay arena mất skill thức tỉnh
        if (data && data.hasOwnProperty("has_awake")) {
            this.has_awake = data.has_awake ? 1 : 0;
        }
        this.updateQuality(data);
        this.initSkill(data);
        this.addEquip(data);
        this.updateNinjaTool(data)
        this.initTactics(data);
    },

    /**
     * 初始化秘籍技能
     * @param data
     */
    initTactics: function(data) {
        for (var i = 1; i < 7; i++)
        {
            var skill_id = data["secret_" + i + "_id"];
            if (skill_id > 0)
            {
                var skill = { cfg: Hero.resolveTacticSkillConfig(skill_id), level: data["secret_" + i + "_lv"] };
                this._tacticSkills.push(skill);
            }
        }

        this.updateNinjaToolTactics()
    },


    // 忍者道具更新秘籍
    updateNinjaToolTactics: function()
    {
        // 忍者道具
        for (var i = 1; i <= 6; i++)
        {
            var tool = this._ninjatools[i];
            if (tool)
            {
                var skill_id = tool.equipData.skill
                var skill = { cfg: Config.skill[skill_id], level: 1, isNinjaTool: true};
                this._tacticSkills.push(skill);
            }
        }
    },

    addSkill: function(skill) {
        this._skills.push(skill);
        this._skills.sort(function(a, b) {
            return a.config.getValByKey("priority") - b.config.getValByKey("priority");
        });
    },

    addSkillNoSort: function(skill)
    {
        this._skills.push(skill);
    },

    sortSkill: function()
    {
        this._skills.sort(function(a, b) {
            return a.config.getValByKey("priority") - b.config.getValByKey("priority");
        });
    },

    getSkills: function() {
        return this._skills;
    },

    getTacticSkills: function() {
        return this._tacticSkills;
    },

    initMaxSkills : function(data)
    {
        this.saveSeverSkill(data)

        for (var i = 1; i <= 5; i++)
        {
             if (data && data["skill_" + i + "_lv"] != null)
             {
                var oldlevel = data["skill_" + i + "_lv"]
                var newlevel = data["skill_" + (i+5) + "_lv"]
                var maxLevel = newlevel > oldlevel ? newlevel : oldlevel;

                data["skill_" + i + "_lv"] = maxLevel
                data["skill_" + (i + 5) + "_lv"] = maxLevel
             }
        }
    },

    saveSeverSkill: function(data)
    {
        for (var i = 1; i <= 10; i++)
        {
             if (data && data["skill_" + i + "_lv"] != null)
             {
                this._severSkills[i] = data["skill_" + i + "_lv"]
             }
         }

    },

    initSkill: function(data) {
        this.initMaxSkills(data)
        var skill0 = new Skill(Config.skill[this.config.id]); // 普攻
        skill0.setLevel(1);
        this._skills[0] = skill0;

        for (var i = 1; i <= 5; i++)
        {
            if (!Config.skill[this.config["skill_id_" + i]])
            {
                continue;
            }


            var skill = new Skill(Config.skill[this.config["skill_id_" + i]]);
            if (data && data["skill_" + i + "_lv"] > 0)
            {    // 服务器返回技能等级为0是未解锁
                skill.setLevel(data["skill_" + i + "_lv"]);
                skill.status = 0;
            } else
            {
                skill.setLevel(1);
                skill.status = Hero.RANK_LEVEL[i - 1];      // 解锁条件
            }
            this._skills[i] = skill;
        }

        this.installAwakenSkill();
        this.initReplaceSkill(data);
        this.initTFSkill(data);
    },

    installAwakenSkill: function() {
        //觉醒的特殊处理
        if (this.has_awake)
        {
            if (this.config.id == 10020)
            {
                //鸣人
                for (var i = 0; i < this.getSkills().length; i++)
                {
                    if (this.getSkills()[i].config.id == 10020)
                    {
                        this._skills[i].config = Config.skill[10021];
                    }
                    if (this.getSkills()[i].config.id == 20021)
                    {
                        this._skills[i].config = Config.skill[20026];
                    }
                    if (this.getSkills()[i].config.id == 20022)
                    {
                        this._skills[i].config = Config.skill[20027];
                    }
                    if (this.getSkills()[i].config.id == 20023)
                    {
                        this._skills[i].config = Config.skill[20028];
                    }
                }
            }

            if (this.config.id == 10030)
            {
                //佐助
                var nlv = 1;
                var sk = null;
                for (var i = 0; i < this.getSkills().length; i++)
                {
                    if (this.getSkills()[i].config.id == 10030)
                    {
                        sk = this._skills[i];
                        sk.config = Config.skill[10031];
                    }
                    if (this.getSkills()[i].config.id == 20036)
                    {
                        nlv = Math.max(1, this.getSkills()[i].getLevel());
                    }
                }
                sk.setLevel(nlv);
            }

            if (this.config.id == 10250)
            {
                //天天
                for (var i = 0; i < this.getSkills().length; i++)
                {
                    if (this.getSkills()[i].config.id == 10250)
                    {
                        this._skills[i].config = Config.skill[10251];
                    }
                    if (this.getSkills()[i].config.id == 20251)
                    {
                        this._skills[i].config = Config.skill[20256];
                    }
                    if (this.getSkills()[i].config.id == 20252)
                    {
                        this._skills[i].config = Config.skill[20257];
                    }
                    if (this.getSkills()[i].config.id == 20253)
                    {
                        this._skills[i].config = Config.skill[20258];
                    }
                }
            }


            if (this.config.id == 10190)
            {
                //白
                for (var i = 0; i < this.getSkills().length; i++)
                {
                    if (this.getSkills()[i].config.id == 20193)
                    {
                        this._skills[i].config = Config.skill[20196];
                    }
                }
            }


            if (this.config.id == 10050)
            {
                //卡卡西
                for (var i = 0; i < this.getSkills().length; i++)
                {
                    if (this.getSkills()[i].config.id == 20051)
                    {
                        this._skills[i].config = Config.skill[20056];
                    }
                }
            }

            if (this.config.id == 10260)
            {
                //手鞠
                for (var i = 0; i < this.getSkills().length; i++)
                {
                    if (this.getSkills()[i].config.id == 20263)
                    {
                        this._skills[i].config = Config.skill[20266];
                    }
                }
            }

            if (this.config.id == 10100)
            {
                //自来也
                for (var i = 0; i < this.getSkills().length; i++)
                {
                    if (this.getSkills()[i].config.id == 20101)
                    {
                        this._skills[i].config = Config.skill[20105];
                    }
                }
            }

            if (this.config.id == 10610)
            {
                //止水
                for (var i = 0; i < this.getSkills().length; i++)
                {
                    if (this.getSkills()[i].config.id == 20612)
                    {
                        this._skills[i].config = Config.skill[20616];
                    }
                }
            }

            if (this.config.id == 10160)
            {
                // 啊飞
                for (var i = 0; i < this.getSkills().length; i++)
                {
                    if (this.getSkills()[i].config.id == 20161)
                    {
                        this._skills[i].config = Config.skill[20166];
                    }
                }
            }

            if (this.config.id == 10640)
            {
                //红
                for (var i = 0; i < this.getSkills().length; i++)
                {
                    if (this.getSkills()[i].config.id == 20643)
                    {
                        this._skills[i].config = Config.skill[20647];
                    }
                }
            }

            if (this.config.id == 10620)
            {
                //大和
                for (var i = 0; i < this.getSkills().length; i++)
                {
                    if (this.getSkills()[i].config.id == 20624)
                    {
                        this._skills[i].config = Config.skill[20626];
                    }
                }
            }
        }

    },

    initReplaceSkill: function(heroData)
    {
        for (var k in Config.hero_quality_up)
        {
            var quilityData = Config.hero_quality_up[k]
            if(quilityData.is_open == 1 &&  quilityData.del_skill > 0 && k < this.quality.quality)
            {
                var level = heroData["skill_" + quilityData.new_skill + "_lv"] || 0

                if (level == 0 ||this.config["skill_id_" + quilityData.new_skill] == 0 || !Config.skill[this.config["skill_id_" + quilityData.new_skill]])
                {
                    continue;
                }
                var orgSkill = this._skills[quilityData.del_skill]
                var skill = new Skill(Config.skill[this.config["skill_id_" + quilityData.new_skill]]);
                skill.setLevel(level);
                skill.status = 0;      // 解锁条件
                skill.orgSkillId = orgSkill.id
                this._skills[quilityData.del_skill] = skill;
            }

        }

    },

    initTFSkill: function(heroData) {
        if(!this.config["skill_id_11"] || this.config["skill_id_11"] == 0)
        {
            return;
        }

        this._tfSkill = [];

        var skill_11 = new Skill(Config.skill[this.config["skill_id_11"]]);
        skill_11.setLevel(heroData.skill_11_lv);
        skill_11.status = 0;      // 解锁条件
        this._tfSkill.push(skill_11);

        var skill_12 = new Skill(Config.skill[this.config["skill_id_12"]]);
        skill_12.setLevel(heroData.skill_12_lv);
        skill_12.status = 0;      // 解锁条件
        this._tfSkill.push(skill_12);

        // BattleUnit appends auxiliary skills after the five regular skills.
        // Remove talents by identity; slot 6 may contain an auxiliary skill.
        for (var i = this._skills.length - 1; i >= 6; i--) {
            var current = this._skills[i];
            if (!current || current.config.id == this.config.skill_id_11 || current.config.id == this.config.skill_id_12) {
                this._skills.splice(i, 1);
            }
        }
        var tfSel = Hero.decodeTfSel(heroData.sel_tf_skill);
        var selTf = tfSel.skill;
        this._selTfSkill = null;
        this._tfDual = tfSel.dual && Hero.canUseDualTalent(this);
        if (this._tfDual) {
            // Quality +4 with "both" chosen: both talents are active together.
            this._skills.push(skill_11);
            this._skills.push(skill_12);
            this._selTfSkill = selTf == this.config.skill_id_12 ? skill_12 : skill_11;
            return;
        }
        if (selTf != this.config.skill_id_11 && selTf != this.config.skill_id_12) {
            return;
        }
        var tfSkill = this.config.skill_id_11 == selTf ? skill_11 : skill_12;
        this._skills.push(tfSkill);
        this._selTfSkill = tfSkill;
    },

    getTFSkill: function(){
        return this._tfSkill;
    },

    setSelTfSkill : function(skillIdRaw){
        var tfSel = Hero.decodeTfSel(skillIdRaw);
        var skillId = tfSel.skill;
        var selected = null;
        for (var i = 0; i < (this._tfSkill || []).length; i++) {
            if (this._tfSkill[i].config.id == skillId) {
                selected = this._tfSkill[i];
                break;
            }
        }
        // A talent switch must update the actual battle skill list as well as its marker.
        for (var j = this._skills.length - 1; j >= 0; j--) {
            var skill = this._skills[j];
            if (skill && (skill.config.id == this.config.skill_id_11 || skill.config.id == this.config.skill_id_12)) {
                this._skills.splice(j, 1);
            }
        }
        this._selTfSkill = selected;
        this._tfDual = tfSel.dual && Hero.canUseDualTalent(this) && !!this._tfSkill;
        if (this._tfDual) {
            // "Both" chosen at quality +4: both talents stay active, selected is only the marker.
            for (var k = 0; k < this._tfSkill.length; k++) this._skills.push(this._tfSkill[k]);
            return;
        }
        if (selected) this._skills.push(selected);
    },
    getSelTfSkill: function(){
        return this._selTfSkill;
    },
    // True when both talents are active (quality +4 and "both" chosen).
    isTfDual: function(){
        return !!this._tfDual;
    },
    // Is this talent currently active in battle?
    isTfActive: function(skillId){
        if (this._tfDual) return skillId == this.config.skill_id_11 || skillId == this.config.skill_id_12;
        return !!this._selTfSkill && this._selTfSkill.config.id == skillId;
    },

    initMaxSeverSkills : function(data)
    {
        for (var i = 1; i <= 5; i++)
        {
             if (data && data["skill_" + i] != null)
             {
                var oldlevel = data["skill_" + i]
                var newlevel = data["skill_" + (i+5)]
                var maxLevel = newlevel > oldlevel ? newlevel : oldlevel;

                data["skill_" + i] = maxLevel
                data["skill_" + (i + 5)] = maxLevel
             }
        }
    },

    initReplaceSeverSkill: function(data)
    {
        for (var k in Config.hero_quality_up)
        {
            var quilityData = Config.hero_quality_up[k]
            if(quilityData.is_open == 1 &&  quilityData.del_skill > 0 && k < this.quality.quality)
            {
                var level = data["skill_" + quilityData.new_skill] || 0

                if (level == 0 || this.config["skill_id_" + quilityData.new_skill] == 0 || !Config.skill[this.config["skill_id_" + quilityData.new_skill]])
                {
                    continue;
                }
                var orgSkillId = this.config["skill_id_"+ quilityData.del_skill]
                var skill = new Skill(Config.skill[this.config["skill_id_" + quilityData.new_skill]]);
                skill.setLevel(level);
                skill.status = 0;      // 解锁条件
                skill.orgSkillId = orgSkillId
                this._skills[quilityData.del_skill] = skill;
            }

        }
    },

    initServerTFSkill: function(heroData) {
        var tfSel = Hero.decodeTfSel(heroData.sel_tf_skill);
        this._tfDual = tfSel.dual && Hero.canUseDualTalent(this, heroData);
        if (this._tfDual) {
            // Quality +4 with "both" chosen: both talents are active together.
            var dualSel = tfSel.skill;
            var dual11 = new Skill(Config.skill[this.config.skill_id_11]);
            dual11.setLevel(Math.max(1, Number(heroData["skill_11"] || heroData["skill_11_lv"] || 1)));
            dual11.status = 0;
            var dual12 = new Skill(Config.skill[this.config.skill_id_12]);
            dual12.setLevel(Math.max(1, Number(heroData["skill_12"] || heroData["skill_12_lv"] || 1)));
            dual12.status = 0;
            this._skills.push(dual11);
            this._skills.push(dual12);
            this._selTfSkill = dualSel == this.config.skill_id_12 ? dual12 : dual11;
            return;
        }
        if(!tfSel.skill || tfSel.skill == 0)
        {
            return;
        }

        var selTf = tfSel.skill;
        if (selTf != this.config.skill_id_11 && selTf != this.config.skill_id_12) return;
        var tfSkillLv = this.config["skill_id_11"] == selTf ? heroData["skill_11"] : heroData["skill_12"];
        var tfSkill = new Skill(Config.skill[selTf]);
        tfSkill.setLevel(tfSkillLv);
        tfSkill.status = 0;      // 解锁条件

        this._skills.push(tfSkill);
        this._selTfSkill = tfSkill;
    },


    updateSkill: function(data) {
        this.initMaxSkills(data)
        for (var i in this._skills)
        {
            var index = this._skills[i].config.quality;
            if (index == 0 || index == 6)
                continue;
            if (data["skill_" + index + "_lv"] > 0)
            {        // >0 技能解锁
                this._skills[i].setLevel(data["skill_" + index + "_lv"]);
                this._skills[i].status = 0;
            } else
            {
                this._skills[i].setLevel(1);
                this._skills[i].status = Hero.RANK_LEVEL[index - 1];      // 解锁条件
            }
        }

        this.initReplaceSkill(data)
        this.initTFSkill(data);
    },

    updateNinjaTool: function(data) {

        if(data.ninja_tool_1 != undefined)
        {
            this._ninjatools = [];
            this._ninjatools[1] = data.ninja_tool_1 > 0 ? new NinjaTool(Config.ninja_tool[data.ninja_tool_1]) : null;
            this._ninjatools[2] = data.ninja_tool_2 > 0 ? new NinjaTool(Config.ninja_tool[data.ninja_tool_2]) : null;
            this._ninjatools[3] = data.ninja_tool_3 > 0 ? new NinjaTool(Config.ninja_tool[data.ninja_tool_3]) : null;
            this._ninjatools[4] = data.ninja_tool_4 > 0 ? new NinjaTool(Config.ninja_tool[data.ninja_tool_4]) : null;
            this._ninjatools[5] = data.ninja_tool_5 > 0 ? new NinjaTool(Config.ninja_tool[data.ninja_tool_5]) : null;
            this._ninjatools[6] = data.ninja_tool_6 > 0 ? new NinjaTool(Config.ninja_tool[data.ninja_tool_6]) : null;
        }

    },

    getNinjaTool : function(){
        return this._ninjatools || []
    },


    addEquip: function(data) {
        if(this.quality.quality >= Hero.QUALITY_MAX_QUALITY)
        {
            this._equips = null
            return
        }
        else
        {
            this._equips = [];
            this._equips[1] = new Equip(Config.equip[this.quality.equip_1]);
            this._equips[2] = new Equip(Config.equip[this.quality.equip_2]);
            this._equips[3] = new Equip(Config.equip[this.quality.equip_3]);
            this._equips[4] = new Equip(Config.equip[this.quality.equip_4]);
            this._equips[5] = new Equip(Config.equip[this.quality.equip_5]);
            this._equips[6] = new Equip(Config.equip[this.quality.equip_6]);
        }


        this.updateStatus(data);
    },

    updateStatus: function(data) {
        this._equips[1].status = data.equip_1;
        this._equips[2].status = data.equip_2;
        this._equips[3].status = data.equip_3;
        this._equips[4].status = data.equip_4;
        this._equips[5].status = data.equip_5;
        this._equips[6].status = data.equip_6;
    },

    getEquip: function() {
        return this._equips;
    },

    // 计算战斗力  // 血*0.1+攻*0.6+防*0.3+查克拉*0.6+查克拉防*0.3+暴击*25+法术暴击*25+技能总等级*4

    getPower: function() {
        var unzipobj = null;

        if (this.link)
        {
            unzipobj = this;
        } else
        {
            unzipobj = this.getUnzipObj();
        }

        var power = unzipobj.maxhp * 0.1 + unzipobj.physicDmg * 0.6 + unzipobj.physicDef * 0.3 + unzipobj.magicDmg * 0.6 + unzipobj.magicDef * 0.3 + unzipobj.physicCirt * 25 + unzipobj.magicCirt * 25 + this.getAllSKillLevel() * 4;

        // 秘籍附加战斗力
        for (var i = 0; i < unzipobj._tacticSkills.length; i++)
        {
            if(!unzipobj._tacticSkills[i].isNinjaTool)
            {
                var level = unzipobj._tacticSkills[i].level;
                var quality = unzipobj._tacticSkills[i].cfg.quality;
                var tactic = Config.equip_level[level][quality];

                if(tactic)
                {
                    power += tactic.fight_value;
                }
            }

        }


        // 忍者道具战力
        for(var i = 1; i <= 6; i++)
        {
            if(this._ninjatools[i])
            {
                var tool = this._ninjatools[i];
                power += tool.equipData.fight_value;
            }

        }

        // Display/ranking only: combat applies these buffs separately at battle start.
        power += Hero.getGemStatPower(unzipobj);
        return parseInt(power);
    },

    // 获得所有技能等级之和
    getAllSKillLevel: function() {
        var num = 0;
        for (var i in this._skills)
        {
            var index = this._skills[i].config.quality;
            if (index == 0)
                continue;
            if (this._skills[i].status == 0)
                num += this._skills[i].getLevel();
        }

        return num;
    },

    getSkillLevelBySkillConfigId: function(id) {
        var rtn = 0;
        for (var i in this._skills)
        {
            if (this._skills[i].config.id == id)
            {
                rtn = this._skills[i].getLevel();
                break;
            }
        }
        return rtn;
    },

    getSkillBySkillConfigId: function(id) {
        var rtn = null;
        for (var i in this._skills)
        {
            if (this._skills[i].config.id == id)
            {
                rtn = this._skills[i];
                break;
            }
        }
        return rtn;
    },

    updateQuality: function(data) {
        if (data.beast)
        {
            this.beast = data.beast;
            for (var i = 0; i < micol.length; i++)
            {
                if ("beast" == micol[i])
                {
                    this["beast"] = zip_deflate(this["beast"]);
                }
            }
        }
        if (data.lv)
        {
            this.level = data.lv;
            for (var i = 0; i < micol.length; i++)
            {
                if ("level" == micol[i])
                {
                    this["level"] = zip_deflate(this["level"]);
                }
            }
        }

        this.maxExp = Config.heroLevel[this.level].upg_exp;

        if (data.hasOwnProperty("exp"))
        {
            this.exp = data.exp > this.maxExp ? this.maxExp : data.exp;
            for (var i = 0; i < micol.length; i++)
            {
                if ("exp" == micol[i])
                {
                    this["exp"] = zip_deflate(this["exp"]);
                }
            }
        }

        if (data.atk !== undefined)
        {
            this.physicDmg = data.atk;
            for (var i = 0; i < micol.length; i++)
            {
                if ("physicDmg" == micol[i])
                {
                    this["physicDmg"] = zip_deflate(this["physicDmg"]);
                }
            }
        }
        if (data.def !== undefined)
        {
            this.physicDef = data.def;
            for (var i = 0; i < micol.length; i++)
            {
                if ("physicDef" == micol[i])
                {
                    this["physicDef"] = zip_deflate(this["physicDef"]);
                }
            }
        }
        if (data.hp !== undefined)
        {
            this.maxhp = data.hp;
            for (var i = 0; i < micol.length; i++)
            {
                if ("maxhp" == micol[i])
                {
                    this["maxhp"] = zip_deflate(this["maxhp"]);
                }
            }
        }
        if (data.mp !== undefined)
        {
            this.magicDmg = data.mp;
            for (var i = 0; i < micol.length; i++)
            {
                if ("magicDmg" == micol[i])
                {
                    this["magicDmg"] = zip_deflate(this["magicDmg"]);
                }
            }
        }
        if (data.mp_def !== undefined)
        {
            this.magicDef = data.mp_def;
            for (var i = 0; i < micol.length; i++)
            {
                if ("magicDef" == micol[i])
                {
                    this["magicDef"] = zip_deflate(this["magicDef"]);
                }
            }
        }

        if (data.cri !== undefined)
        {
            this.physicCirt = parseFloat(data.cri.toFixed(2));
            for (var i = 0; i < micol.length; i++)
            {
                if ("physicCirt" == micol[i])
                {
                    this["physicCirt"] = zip_deflate(this["physicCirt"]);
                }
            }
        }
        if (data.mp_cri !== undefined)
        {
            this.magicCirt = parseFloat(data.mp_cri.toFixed(2));
            for (var i = 0; i < micol.length; i++)
            {
                if ("magicCirt" == micol[i])
                {
                    this["magicCirt"] = zip_deflate(this["magicCirt"]);
                }
            }
        }

        if (typeof (this.attackSpeed) == "number" && this.attackSpeed > 0)
        {
            for (var i = 0; i < micol.length; i++)
            {
                if ("attackSpeed" == micol[i])
                {
                    this["attackSpeed"] = zip_deflate(this["attackSpeed"]);
                }
            }
        }

        if (data.quality)
        {
            this.quality = Config.heroQuality[data.quality][data.hero_id];
        }

        if (data.bagate_level)
        {
            this.bagate_level = data.bagate_level;
            for (var i = 0; i < micol.length; i++)
            {
                if ("bagate_level" == micol[i])
                {
                    this["bagate_level"] = zip_deflate(this["bagate_level"]);
                }
            }
        }
    },

    getUnzipObj: function() {
        //未拥有
        if (this.status == Hero.HERO_NONE)
        {
            return this;
        }
        var rtn = new Hero(this.config);
        for (var n in this)
        {
            if (n == "__instanceId")
            {
                continue;
            }
            for (var i = 0; i < micol.length; i++)
            {
                if (n == micol[i])
                {
                    rtn[n] = zip_inflate(this[n]);
                    break;
                } else
                {
                    rtn[n] = this[n];
                }
            }
        }
        rtn.link = this;
        return rtn;
    },

    isFemale: function() {
        if (this.female >= 0)
        {
            return this.female == 1;
        }
        this.female = 0;
        for (var i = 0; i < womanHero.length; i++)
        {
            if (this.config.id == womanHero[i])
            {
                this.female = 1;
                break;
            }
        }
        return this.female == 1;
    },

    dataClone: function(obj) {
        this.id = obj.id;
        this.maxhp = obj.maxhp;
        this.level = obj.level;
        this.physicDmg = obj.physicDmg;
        this.physicDef = obj.physicDef;
        this.maxPower = obj.maxPower ? obj.maxPower : 100;
        this.magicDmg = obj.magicDmg;
        this.magicDef = obj.magicDef;
        this.attackSpeed = obj.attackSpeed;
        this.powerSpeed = obj.powerSpeed;
        this.attackRange = obj.attackRange;
        this.physicCirt = obj.physicCirt;
        this.magicCirt = obj.magicCirt;
        this.has_awake = obj.has_awake;
        this.quality = Config.heroQuality[obj.quality.split("_")[0]][obj.quality.split("_")[1]];
        this._skills = new Array();
        for (var i = 0; i < obj._skills.length; i++)
        {
            var nsk = new Skill(Config.skill[obj._skills[i].config]);
            nsk.dataClone(obj._skills[i]);
            this._skills.push(nsk);
        }
    }
});

// 获取英雄觉醒icon_id(传hero)
Hero.getHeroAwakenIconId = function(hero) {
    var icon_id = hero.config.icon;
    if (hero.quality.quality >= Hero.QUALITY_JUEXING)
    {
        icon_id = (parseInt(hero.config.icon) + 1).toString();
    }
    return icon_id;
};

Hero.getIconByHeroIdNQuality = function(heroId, quality) {
    var heroConfig = Config.hero[parseInt(heroId)];
    if (!heroConfig) return null;
    var icon_id = heroConfig.icon;
    if (quality >= Hero.QUALITY_JUEXING)
    {
        icon_id = (parseInt(icon_id) + 1).toString();
    }
    return icon_id;
};

Hero.createMercenaryHero = function(obj) {
    var hero = MonsterUnitGenerater.gen(obj.hero_id, obj.quality, obj.lv, 0);
    hero.hero.ischoosed = false;
    hero.hero.status = Hero.HERO_HAD;
    hero.hero.idle = Hero.CAMP_STATUS;
    hero.hero.id = obj.player_id * Hero.Hire_ID_BASE + obj.hero_id;
    hero.hero.attackSpeed = zip_deflate(hero.hero.attackSpeed);
    hero.hero.magicCirt = zip_deflate(obj.mp_cri);
    hero.hero.magicDef = zip_deflate(obj.mp_def);
    hero.hero.magicDmg = zip_deflate(obj.mp);
    hero.hero.physicCirt = zip_deflate(obj.cri);
    hero.hero.physicDef = zip_deflate(obj.def);
    hero.hero.physicDmg = zip_deflate(obj.atk);

    hero.hero.has_awake = obj.has_awake;

    hero.hero.maxhp = zip_deflate(obj.hp);
    hero.setMaxHp(obj.hp);

    hero.hero.hp = zip_deflate(obj.hp);
    hero.setHp(obj.hp);

    //            hero.hero.maxhp = zip_deflate(obj.maxhp);
    hero.hero.exp = zip_deflate(obj.exp);
    hero.hero.maxExp = Config.level[obj.lv].upg_exp;
    //var skill_lv = 0;
    //for(var j = 1; j < 5; j++)
    //{
    //    for(var u = 0; u < hero.hero._skills.length; u++)
    //    {
    //        skill_lv = 0;
    //        if(hero.hero._skills[u].config.quality == j) {
    //            if(j == 1)
    //                skill_lv = obj.skill_1_lv;
    //            else if(j == 2)
    //                skill_lv = obj.skill_2_lv;
    //            else if(j == 3)
    //                skill_lv = obj.skill_3_lv;
    //            else
    //                skill_lv = obj.skill_4_lv;
    //        }
    //        if(skill_lv == undefined)
    //            skill_lv = 0;
    //
    //        if(skill_lv>0){
    //            hero.hero._skills[u].setLevel(skill_lv);
    //            hero.hero._skills[u].status = 0;
    //        }
    //    }
    //}

    hero.hero.initSkill(obj);

    return hero.hero;
};

Hero.TYPE_EARTH = 1;  //土
Hero.TYPE_WIND = 2;   //风
Hero.TYPE_FIRE = 3;   //火
Hero.TYPE_WATER = 4;  //水
Hero.TYPE_BODY = 5;   //体

Hero.EQUIP_WOOD = 1;        //木
Hero.EQUIP_FIRE = 2;        //火
Hero.EQUIP_WATER = 3;       //水
Hero.EQUIP_EARTH = 4;       //土
Hero.EQUIP_WIND = 5;        //风
Hero.EQUIP_THUNDER = 6;     //雷

Hero.TROOP_ALL = 0;         //所有排
Hero.TROOP_FRONT = 1;       //前排
Hero.TROOP_MIDDLE = 2;      //中排
Hero.TROOP_LAST = 3;        //后排
Hero.TROOP_HIRE = 4;        //佣兵
Hero.TROOP_TAIL = 5;        //尾兽

Hero.RANK_LOW = 1;          //下忍
Hero.RANK_MIDDLE = 2;       //中忍
Hero.RANK_HIGHT = 4;        //上忍
Hero.RANK_MAX = 7;          //影
//Hero.QUALITY_MAX = 11;
Hero.QUALITY_LIUDAO = 11;   // 六道
Hero.QUALITY_JUEXING = 12;  // 六道 + 1
Hero.QUALITY_AWAKENONE = 13;// 觉醒 + 1
Hero.QUALITY_AWAKENTWO = 14;// 觉醒 + 2
Hero.QUALITY_SUPER_AWAKENONE = 15;// 超觉醒 + 1
Hero.QUALITY_SUPER_AWAKETWO = 16;// 超觉醒 + 2
Hero.QUALITY_SUPER_AWAKETHERR = 17;// 超觉醒 + 3
Hero.QUALITY_TRANSCEND_FOUR = 18;
Hero.QUALITY_MAX_QUALITY = 18;
// Talent selection: sel_tf_skill holds the chosen talent id; "both" is stored as id + TF_DUAL_OFFSET.
// Both talents can be active only from quality TF_DUAL_DEFAULT_QUALITY (18 = "+4").
// Override the quality with global var TF_DUAL_SKILL_NEED_QUALITY in ConfigData; 0 disables.
Hero.TF_DUAL_OFFSET = 1000000;
Hero.TF_DUAL_DEFAULT_QUALITY = 18;
Hero.decodeTfSel = function(raw) {
    var n = Number(raw) || 0;
    if (n >= Hero.TF_DUAL_OFFSET) return { skill: n % Hero.TF_DUAL_OFFSET, dual: true };
    return { skill: n, dual: false };
};
Hero.encodeTfSel = function(skillId, dual) {
    return (Number(skillId) || 0) + (dual ? Hero.TF_DUAL_OFFSET : 0);
};
Hero.tfDualNeedQuality = function() {
    var raw = (typeof ConfigGlobalVar !== "undefined" && ConfigGlobalVar) ? ConfigGlobalVar.TF_DUAL_SKILL_NEED_QUALITY : undefined;
    var n = parseInt(raw, 10);
    return isNaN(n) ? Hero.TF_DUAL_DEFAULT_QUALITY : n;
};
// The hero is allowed to activate both talents (quality high enough or talent level > 4, with two valid talents).
Hero.canUseDualTalent = function(hero, heroData) {
    var need = Hero.tfDualNeedQuality();
    if (!hero || !hero.config || !hero.quality) return false;
    if (!hero.config.skill_id_11 || !hero.config.skill_id_12) return false;
    if (!Config.skill[hero.config.skill_id_11] || !Config.skill[hero.config.skill_id_12]) return false;
    if (need && Number(hero.quality.quality) >= need) return true;
    var tfSkills = hero._tfSkill || [];
    for (var i = 0; i < tfSkills.length; i++) {
        if (tfSkills[i] && typeof tfSkills[i].getLevel === "function" && Number(tfSkills[i].getLevel()) > 4) {
            return true;
        }
    }
    if (heroData) {
        if (Number(heroData.skill_11 || heroData.skill_11_lv || 0) > 4) return true;
        if (Number(heroData.skill_12 || heroData.skill_12_lv || 0) > 4) return true;
    }
    return false;
};

// 忍者等级
Hero.RANK_LEVEL = [Hero.RANK_LOW, Hero.RANK_MIDDLE, Hero.RANK_HIGHT, Hero.RANK_MAX, Hero.QUALITY_JUEXING];
Hero.QUALITY_NAME = ["", LANSTR.ninja_low, LANSTR.ninja_middle, LANSTR.ninja_middle + "+1", LANSTR.ninja_hight, LANSTR.ninja_hight + "+1", LANSTR.ninja_hight + "+2", LANSTR.ninja_ying, LANSTR.ninja_ying + "+1", LANSTR.ninja_ying + "+2", LANSTR.ninja_ying + "+3", LANSTR.ninja_liudao, LANSTR.ninja_liudao + "+1"];


Hero.ACTION_NAME = ["win", "attack1", "attack2", "attack3", "attack4"];

Hero.HERO_NONE = 0;         //未获得
Hero.HERO_HAD = 1;          //已获得

Hero.TF_SKILL_INDEX = 6;    // 天赋技能位置

Hero.IDLE_STATUS = 0;       // 闲置
Hero.CAMP_STATUS = 1;       // 公会  派遣中
Hero.MINING_STATUS = 2;     // 据点  防守中
Hero.Hire_ID_BASE = 100000; // 佣兵id基数（用于判定英雄是否为佣兵）
Hero.heroLimit1 = [10010,10020,10030,10040,10050,10070,10080,10100,10130,10180,10200,
10210,10220,10230,10250,10270,10300,10390,10400,10410,10420,10460,10470,10540,10550,10610,10620,10640,10650,10740,10750,10760,10790,10810] //仅限木叶
Hero.heroLimit2 = [10060,10090,10170,10190,10240,10260,10430,10440,10450,10480,10490,10500,10510,10530,10600,10630,10670,10680,10690,10770,10820,10830] //仅限其他忍村
Hero.heroLimit3 = [10110,10120,10140,10150,10160,10280,10290,10310,10320,10330,10340,10350,10360,10370,10380,10520,10560,10570,10590,10660,10700,10710,10720,10730,10780,10800] // 仅限晓和其他组织

/** Resolve database equipment IDs and legacy replay skill IDs to the same secret buff. */
Hero.resolveTacticSkillConfig = function(id) {
    var equipment = Config.equip[id];
    // Secret equipment IDs can collide with unrelated combat skill IDs.
    var config = equipment && (equipment.type == 2 || equipment.type == 3) ? Config.skill[equipment.skill] : Config.skill[id];
    if (!config) throw new Error("Invalid secret skill configuration: " + id);
    return config;
};

/** Value only the gem bonuses on the unbuffed hero sheet; never mutate combat stats. */
Hero.getGemStatPower = function(hero) {
    if (Hero._gemEquipSource !== Config.equip) {
        Hero._gemEquipSource = Config.equip;
        Hero._gemSkillIds = {};
        for (var id in Config.equip) {
            var equip = Config.equip[id];
            if (equip && equip.type == 3) Hero._gemSkillIds[equip.skill] = true;
        }
    }
    var fields = {3: 'maxhp', 4: 'magicDmg', 7: 'physicDmg', 8: 'physicDef', 9: 'magicDef'};
    var weights = {maxhp: 0.1, magicDmg: 0.6, physicDmg: 0.6, physicDef: 0.3, magicDef: 0.3};
    var values = {}, key;
    for (key in weights) values[key] = hero[key];
    var tactics = hero._tacticSkills || [];
    for (var i = 0; i < tactics.length; i++) {
        var tactic = tactics[i], cfg = tactic.cfg;
        if (tactic.isNinjaTool || !cfg || !Hero._gemSkillIds[cfg.id]) continue;
        for (var j = 1; j <= 3; j++) {
            var prefix = 'var_' + j + '_';
            var field = fields[cfg.getValByKey(prefix + 'effect')];
            if (!field || (field == 'maxhp' && hero.config && hero.config.id == 15281)) continue;
            // Match BattleUnit.addPassiveActionByList, including linear level growth.
            var amount = cfg.getValByKey(prefix + 'base') + (tactic.level - 1) * cfg.getValByKey(prefix + 'inc');
            if (cfg.getValByKey(prefix + 'type') == 0) values[field] += amount;
            else values[field] *= 1 + amount;
        }
    }
    var power = 0;
    for (key in weights) power += (values[key] - hero[key]) * weights[key];
    return power;
};

/** Tier 18 uses the existing portrait border and a native localized quality title. */
Hero.initQualityTitle = function(x, y, quality, parent, z) {
    if (quality == Hero.QUALITY_TRANSCEND_FOUR)
        return NumUnit.initLabel(x, y, parent, 22, "Transcend +4", gameColor.gold);
    return NumUnit.initImage(x, y, "#ninja_level_" + quality + ".png", parent, z);
};
