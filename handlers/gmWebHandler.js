const fs = require('fs');
const path = require('path');
const { syncConfigFromUpstream } = require('../config/configLoader');
const hotfixMirrorService = require('../services/hotfixMirrorService');
const upstreamEventSyncService = require('../services/upstreamEventSyncService');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SPRITES_DIR = path.join(PUBLIC_DIR, 'sprites');

function sendJson(res, obj, statusCode = 200) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(obj));
}

function readJsonBody(req, callback) {
    let body = '';
    req.on('data', chunk => {
        body += chunk;
        if (body.length > 2 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
        try {
            callback(null, body ? JSON.parse(body) : {});
        } catch (e) {
            callback(e);
        }
    });
}

function buildCatalog() {
    const items = [];
    if (typeof Config !== 'undefined' && Config.item) {
        for (const k of Object.keys(Config.item)) {
            const it = Config.item[k];
            if (!it || !it.id) continue;
            items.push({
                id: Number(it.id),
                name: String(it.name || ('Item ' + it.id)),
                desc: String(it.desc || ''),
                icon_id: Number(it.icon_id || it.id),
                quality: Number(it.quality || 1),
                type: Number(it.type || 0)
            });
        }
    }
    items.sort((a, b) => a.id - b.id);

    const heroes = [];
    if (typeof Config !== 'undefined' && Config.hero) {
        for (const k of Object.keys(Config.hero)) {
            const h = Config.hero[k];
            if (!h || !h.id) continue;
            heroes.push({
                id: Number(h.id),
                name: String(h.name || ('Hero ' + h.id)),
                icon: Number(h.icon || h.id),
                quality: Number(h.quality || 1),
                star: Number(h.star || 1)
            });
        }
    }
    heroes.sort((a, b) => a.id - b.id);

    const frames = [
        { id: 0, name: 'Mặc định (Không khung)' },
        { id: 801, name: 'Khung 801' },
        { id: 802, name: 'Khung 802' },
        { id: 803, name: 'Khung 803' },
        { id: 804, name: 'Khung 804' },
        { id: 805, name: 'Khung 805' },
        { id: 806, name: 'Khung 806' },
        { id: 807, name: 'Khung 807' },
        { id: 808, name: 'Khung 808' },
        { id: 809, name: 'Khung 809' },
        { id: 810, name: 'Khung 810' },
        { id: 811, name: 'Khung 811' }
    ];

    return { items, heroes, frames };
}

function handleGmWebRequest(req, res, ctx) {
    const urlPath = (req.url || '/').split('?')[0];
    const { playerDb, markDirty, saveDb, connectedSockets, OfflineServer } = ctx;

    // 1. Serve GM Panel HTML
    if (urlPath === '/gm' || urlPath === '/gm/') {
        const htmlPath = path.join(PUBLIC_DIR, 'gm.html');
        if (!fs.existsSync(htmlPath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('gm.html not found');
            return true;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(htmlPath));
        return true;
    }

    // 2. Serve Sprites (item.png, hero_head.png, sprite_frames.json)
    if (urlPath.startsWith('/gm-sprites/')) {
        const file = path.basename(urlPath.slice('/gm-sprites/'.length));
        const allowed = ['item.png', 'hero_head.png', 'sprite_frames.json'];
        if (!allowed.includes(file)) {
            res.writeHead(404);
            res.end('Not found');
            return true;
        }
        const fpath = path.join(SPRITES_DIR, file);
        if (!fs.existsSync(fpath)) {
            res.writeHead(404);
            res.end('Missing sprite');
            return true;
        }
        const ctype = file.endsWith('.json') ? 'application/json; charset=utf-8' : 'image/png';
        res.writeHead(200, { 'Content-Type': ctype, 'Cache-Control': 'public, max-age=86400' });
        res.end(fs.readFileSync(fpath));
        return true;
    }

    // 3. GM Sync All (ConfigData + Upstream Events/Roulette + GitHub Hotfix Mirror)
    if (urlPath === '/api/gm/sync-all' && req.method === 'POST') {
        syncConfigFromUpstream({ force: true }, async (syncErr, syncRes) => {
            try {
                if (typeof OfflineServer.syncOnlineLuckyWithLatestHero === 'function') {
                    OfflineServer.syncOnlineLuckyWithLatestHero();
                }
                const [hotfixRes, eventSyncRes] = await Promise.all([
                    hotfixMirrorService.checkAndSyncIfNeeded('gm-panel', false).catch(e => ({ ok: false, error: e.message })),
                    upstreamEventSyncService.syncEventsFromUpstream(OfflineServer, { reason: 'gm-panel', force: true }).catch(e => ({ ok: false, error: e.message }))
                ]);
                return sendJson(res, {
                    ok: !syncErr,
                    config: syncRes || null,
                    configError: syncErr ? syncErr.message : null,
                    hotfixCheck: hotfixRes,
                    hotfixStatus: hotfixMirrorService.getHotfixStatus(),
                    eventSync: eventSyncRes,
                    eventSyncStatus: upstreamEventSyncService.getEventSyncStatus()
                });
            } catch (err) {
                return sendJson(res, { ok: false, error: err.message }, 500);
            }
        });
        return true;
    }

    // 4. GM Catalog (Items, Heroes, Frames)
    if (urlPath === '/api/gm/catalog') {
        sendJson(res, buildCatalog());
        return true;
    }

    // 5. GM State (Hotfix status + Player list + Online status)
    if (urlPath === '/api/gm/state') {
        const onlineSet = new Set();
        if (connectedSockets) {
            for (const sock of connectedSockets) {
                if (sock && sock._session && sock._session.data && sock._session.data.player_id) {
                    onlineSet.add(String(sock._session.data.player_id));
                }
            }
        }
        const players = Object.keys(playerDb).map(pid => {
            const p = playerDb[pid] || {};
            return {
                player_id: pid,
                uid: p.uid || 0,
                team_name: p.team_name || pid,
                lv: Number(p.team_lv || p.lv || 1),
                vip: Number(p.vip_lv || 0),
                gold: Number(p.gold || 0),
                stone: Number(p.stone || 0),
                online: onlineSet.has(pid)
            };
        });
        players.sort((a, b) => (b.online - a.online) || (Number(a.uid) - Number(b.uid)));
        sendJson(res, {
            onlineCount: onlineSet.size,
            hotfix: hotfixMirrorService.getHotfixStatus(),
            eventSync: upstreamEventSyncService.getEventSyncStatus(),
            heroCount: typeof Config !== 'undefined' && Config.hero ? Object.keys(Config.hero).length : 0,
            itemCount: typeof Config !== 'undefined' && Config.item ? Object.keys(Config.item).length : 0,
            players
        });
        return true;
    }

    // 6. GM Player Detail
    if (urlPath === '/api/gm/player') {
        const parsedUrl = new URL(req.url, 'http://localhost');
        const pid = String(parsedUrl.searchParams.get('id') || '');
        const p = playerDb[pid];
        if (!p) {
            sendJson(res, { ok: false, error: 'Không tìm thấy tài khoản' }, 404);
            return true;
        }
        const curIcon = Number(p.icon || 10010);
        sendJson(res, {
            ok: true,
            player: {
                player_id: pid,
                uid: p.uid || 0,
                team_name: p.team_name || pid,
                lv: Number(p.team_lv || p.lv || 1),
                vip: Number(p.vip_lv || 0),
                vip_exp: Number(p.vip_exp || 0),
                exp: Number(p.team_exp || p.exp || 0),
                gold: Number(p.gold || 0),
                stone: Number(p.stone || 0),
                sp: Number(p.sp || 0),
                arena_point: Number(p.arena_point || 0),
                ninja_point: Number(p.ninja_point || 0),
                group_point: Number(p.group_point || 0),
                dark_arena_point: Number(p.dark_arena_point || 0),
                icon: curIcon,
                frame_id: Math.floor(curIcon / 100000),
                items: p.items || {},
                hero_ids: Object.keys(p.heros || {}).map(Number)
            }
        });
        return true;
    }

    // 7. GM Give / Modify Action
    if (urlPath === '/api/gm/give' && req.method === 'POST') {
        readJsonBody(req, (err, body) => {
            if (err) return sendJson(res, { ok: false, error: err.message }, 400);
            const pid = String(body.player_id || '');
            const action = String(body.action || '');
            const pData = playerDb[pid];
            if (!pData) return sendJson(res, { ok: false, error: 'Không tìm thấy tài khoản: ' + pid }, 404);

            let liveSession = null;
            if (connectedSockets) {
                for (const sock of connectedSockets) {
                    if (sock && sock._session && sock._session.data && String(sock._session.data.player_id) === pid) {
                        liveSession = sock._session;
                        break;
                    }
                }
            }

            const worker = liveSession || Object.assign(Object.create(OfflineServer), {
                data: pData,
                playerId: pid,
                save: function () { markDirty(pid); }
            });
            const pushQueue = [];
            const queuePush = (cmd, payload) => {
                if (liveSession) pushQueue.push([cmd, payload]);
            };

            let msg = 'Đã cập nhật!';
            if (action === 'currency') {
                const field = String(body.field || '');
                const mode = String(body.mode || 'add');
                const val = Number(body.amount || 0);
                const allowedFields = ['gold', 'stone', 'sp', 'vip_exp', 'exp', 'arena_point', 'ninja_point', 'group_point', 'dark_arena_point'];
                if (!allowedFields.includes(field)) {
                    return sendJson(res, { ok: false, error: 'Trường không hợp lệ' }, 400);
                }
                if (field === 'vip_exp' && mode === 'add' && typeof worker.addVipExp === 'function') {
                    worker.addVipExp(val, queuePush);
                } else if (field === 'exp' && mode === 'add' && typeof worker.addTeamExp === 'function') {
                    worker.addTeamExp(val);
                    if (typeof worker.buildPlayerAttrPayload === 'function') {
                        queuePush(SVRCMD.PlayerAttr, worker.buildPlayerAttrPayload());
                    }
                } else {
                    const cur = Number(pData[field] || 0);
                    pData[field] = mode === 'set' ? Math.max(0, val) : Math.max(0, cur + val);
                    if (typeof worker.buildPlayerAttrPayload === 'function') {
                        queuePush(SVRCMD.PlayerAttr, worker.buildPlayerAttrPayload());
                    }
                }
                msg = `Đã ${mode === 'set' ? 'đặt' : 'cộng'} ${field}: ${pData[field]}`;
            } else if (action === 'set_vip') {
                const targetVip = Math.max(0, Math.min(20, Math.floor(Number(body.vip_lv || 0))));
                pData.vip_lv = targetVip;
                pData.vip_exp = 0;
                if (targetVip >= 5 && Number(pData.had_vip5_gift || 0) === 0) pData.had_vip5_gift = 1;
                if (targetVip >= 9 && Number(pData.had_vip9_gift || 0) === 0) pData.had_vip9_gift = 1;
                if (targetVip >= 11 && Number(pData.had_vip11_gift || 0) === 0) pData.had_vip11_gift = 1;
                if (targetVip >= 13 && Number(pData.had_vip13_gift || 0) === 0) pData.had_vip13_gift = 1;
                if (typeof worker.buildPlayerAttrPayload === 'function') {
                    queuePush(SVRCMD.PlayerAttr, worker.buildPlayerAttrPayload());
                }
                msg = targetVip >= 16 ? `Đã đặt SVIP ${targetVip - 15} (VIP ${targetVip})` : `Đã đặt VIP ${targetVip}`;
            } else if (action === 'item') {
                const itemId = Number(body.item_id || 0);
                const amount = Number(body.amount || 1);
                if (!itemId) return sendJson(res, { ok: false, error: 'Thiếu item_id' }, 400);
                if (typeof worker.changeItemAmount === 'function') {
                    worker.changeItemAmount(itemId, amount, queuePush);
                } else {
                    if (!pData.items) pData.items = {};
                    pData.items[itemId] = Math.max(0, Number(pData.items[itemId] || 0) + amount);
                }
                msg = `Đã thêm ${amount}x Item #${itemId}`;
            } else if (action === 'hero') {
                const heroId = Number(body.hero_id || 0);
                if (!heroId) return sendJson(res, { ok: false, error: 'Thiếu hero_id' }, 400);
                if (typeof worker.addOrConvertHero === 'function') {
                    worker.addOrConvertHero(heroId, queuePush);
                } else if (typeof worker.addHero === 'function') {
                    worker.addHero(heroId, queuePush);
                }
                msg = `Đã thêm Ninja #${heroId}`;
            } else if (action === 'frame') {
                const frameId = Number(body.frame_id || 0);
                const curIcon = Number(pData.icon || 10010);
                const baseHero = curIcon % 100000;
                pData.icon = frameId * 100000 + baseHero;
                if (typeof worker.buildPlayerAttrPayload === 'function') {
                    queuePush(SVRCMD.PlayerAttr, worker.buildPlayerAttrPayload());
                }
                msg = `Đã trang bị Khung #${frameId}`;
            } else {
                return sendJson(res, { ok: false, error: 'Action không hợp lệ' }, 400);
            }

            markDirty(pid);
            saveDb();

            if (liveSession && pushQueue.length > 0 && typeof liveSession.sendPacket === 'function') {
                for (const [cmd, payload] of pushQueue) {
                    liveSession.sendPacket(cmd, payload);
                }
            }

            return sendJson(res, { ok: true, msg, onlinePushed: Boolean(liveSession && pushQueue.length > 0) });
        });
        return true;
    }

    return false;
}

module.exports = { handleGmWebRequest };
