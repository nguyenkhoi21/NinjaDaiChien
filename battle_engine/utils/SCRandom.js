// 伪随机数
var SCRandom = cc.Class.extend
({
    a : 1847,
    b : 5437,
    c : 41513,
    curSeed : 100,
    count : 0,
    // 随机状态栈：用于探测等场景暂存后恢复，避免污染战斗随机流
    _stateStack : null,

    // 重设种子
    reset: function(seed)
    {
        this.curSeed = seed
        this.count = 0
        this._stateStack = null
    },

    // 暂存当前随机状态（支持嵌套 push/pop）
    pushState: function()
    {
        if (!this._stateStack)
        {
            this._stateStack = []
        }
        this._stateStack.push({
            curSeed: this.curSeed,
            count: this.count
        })
    },

    // 恢复最近一次暂存的随机状态
    popState: function()
    {
        if (!this._stateStack || this._stateStack.length === 0)
        {
            return
        }
        var st = this._stateStack.pop()
        this.curSeed = st.curSeed
        this.count = st.count
    },

    // 随机
    random: function(low, high)
    {
        this.count++
        var m = Math.min(low, high)
        var n = Math.max(low, high)
        var l = n - m + 1

        if(l <= 0)
        {
            return m
        }

        var seed = this.seed()
        var ret = seed % l + m
        return ret
    },

    // 获得下一个种子
    seed: function()
    {
        var n = this.curSeed
        var n1 = this.a * n + this.b
        n1 = n1 % this.c
        this.curSeed = n1
        return n1
    }
});
