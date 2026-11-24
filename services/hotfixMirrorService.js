/**
 * Hotfix Mirror Service:
 * - Proxies /static/hotfix/android/{version,project}.manifest
 * - Serves GitHub hotfix-mirror when synced, or upstream immediately while triggering GitHub Actions in background
 * - Automatically falls back to GitHub hotfix-mirror when upstream is unreachable/down
 */

const http = require('http');
const https = require('https');

const UPSTREAM_HOTFIX_BASE = process.env.UPSTREAM_HOTFIX_BASE || 'http://103.90.227.124:8080/static/hotfix/android/';
const GITHUB_REPO = process.env.GITHUB_REPO || 'nguyenkhoi21/NinjaDaiChien';
const GITHUB_MIRROR_BRANCH = process.env.GITHUB_MIRROR_BRANCH || 'hotfix-mirror';
const GITHUB_WORKFLOW_FILE = process.env.GITHUB_WORKFLOW_FILE || 'sync-hotfix.yml';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const HOTFIX_MIRROR_BASE =
    process.env.HOTFIX_MIRROR_BASE ||
    `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_MIRROR_BRANCH}/hotfix/android/`;

const MIRROR_VERSION_TTL_MS = 60 * 1000;
const TRIGGER_COOLDOWN_MS = 10 * 60 * 1000;

// Strip client-patched scripts so hotfix never overwrites custom server/QoL patches in APK
const PROTECTED_ASSET_PREFIXES = [
    'src/SdkManager.',
    'src/InitScene.',
    'src/AssetsManager.',
    'src/netWork/Netty.',
    'src/modules/login/LogoScene.',
    'src/modules/login/ServerListView.',
    'src/modules/pk/PkView.',
    'src/modules/pk/PkRankView.',
    'src/modules/pk/PkTeamSet.',
    'src/modules/battle/BattleAI.',
    'src/modules/battle/BattleManager.',
    'src/modules/battle/FightScene.',
    'src/modules/battle/ReplayScene.',
    'src/modules/map/EmbattlePanel.',
    'src/modules/mineral/MineralTeamSet.',
    'src/modules/map/FightGoView.',
    'src/modules/expedition/ExpeditionMain.',
    'src/modules/ninjas/SkillView.',
    'src/modules/tails/TailsUpgrade.',
    'src/modules/ninjas/PartnerMain.',
    'src/modules/ninjas/AttributeView.'
];

const state = {
    upstreamVersion: null,
    mirrorVersion: null,
    mirrorCheckedAt: 0,
    lastSource: null,
    lastTriggerAt: 0,
    lastTriggerStatus: 'never',
    lastError: null
};

function requestText(urlStr, options = {}, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 4) {
            return reject(new Error('Too many redirects'));
        }
        let parsed;
        try {
            parsed = new URL(urlStr);
        } catch (err) {
            return reject(err);
        }
        const transport = parsed.protocol === 'https:' ? https : http;
        const timeoutMs = options.timeoutMs || 5000;
        const reqOpts = {
            method: options.method || 'GET',
            headers: Object.assign({ 'User-Agent': 'NinjaDaiChien-Server/1.0' }, options.headers || {}),
            timeout: timeoutMs
        };

        const req = transport.request(parsed, reqOpts, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                res.resume();
                const nextUrl = new URL(res.headers.location, parsed).toString();
                return requestText(nextUrl, options, redirectCount + 1).then(resolve, reject);
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                resolve({ statusCode: res.statusCode, body });
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error(`Request timed out after ${timeoutMs}ms: ${urlStr}`));
        });
        req.on('error', reject);
        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

async function fetchJson(urlStr, timeoutMs = 5000) {
    const res = await requestText(urlStr, { timeoutMs });
    if (res.statusCode !== 200) {
        throw new Error(`HTTP ${res.statusCode} from ${urlStr}`);
    }
    return JSON.parse(res.body);
}

async function getMirrorVersionCached(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && state.mirrorCheckedAt > 0 && (now - state.mirrorCheckedAt) < MIRROR_VERSION_TTL_MS) {
        return state.mirrorVersion;
    }
    try {
        const verJson = await fetchJson(HOTFIX_MIRROR_BASE + 'version.manifest', 4500);
        state.mirrorVersion = verJson && verJson.version ? String(verJson.version) : null;
    } catch (_) {
        // Keep null if branch isn't seeded yet or unreachable
        state.mirrorVersion = null;
    }
    state.mirrorCheckedAt = Date.now();
    return state.mirrorVersion;
}

async function triggerGithubMirrorSync(reason = 'auto', force = false) {
    const now = Date.now();
    if (!force && state.lastTriggerAt > 0 && (now - state.lastTriggerAt) < TRIGGER_COOLDOWN_MS) {
        return { triggered: false, status: 'cooldown', reason };
    }
    if (!GITHUB_TOKEN) {
        state.lastTriggerStatus = 'skipped (GITHUB_TOKEN not set)';
        return { triggered: false, status: state.lastTriggerStatus, reason };
    }

    state.lastTriggerAt = now;
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`;
    const payload = JSON.stringify({
        ref: 'main',
        inputs: { force: Boolean(force) }
    });

    try {
        const res = await requestText(apiUrl, {
            method: 'POST',
            timeoutMs: 8000,
            headers: {
                Authorization: `Bearer ${GITHUB_TOKEN}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'X-GitHub-Api-Version': '2022-11-28'
            },
            body: payload
        });
        if (res.statusCode === 204 || res.statusCode === 200) {
            state.lastTriggerStatus = `dispatched (${reason})`;
            console.log(`[+] Dispatched GitHub hotfix sync (${reason})`);
            return { triggered: true, status: state.lastTriggerStatus, reason };
        }
        state.lastTriggerStatus = `failed HTTP ${res.statusCode}`;
        console.warn(`[-] GitHub dispatch failed HTTP ${res.statusCode}: ${res.body.slice(0, 200)}`);
        return { triggered: false, status: state.lastTriggerStatus, reason };
    } catch (err) {
        state.lastTriggerStatus = `error: ${err.message}`;
        console.warn(`[-] GitHub dispatch error: ${err.message}`);
        return { triggered: false, status: state.lastTriggerStatus, reason };
    }
}

async function checkAndSyncIfNeeded(reason = 'periodic', force = false) {
    const [upRes, mirrorVer] = await Promise.allSettled([
        fetchJson(UPSTREAM_HOTFIX_BASE + 'version.manifest', 5000),
        getMirrorVersionCached(true)
    ]);
    if (upRes.status !== 'fulfilled' || !upRes.value || !upRes.value.version) {
        return { ok: false, reason, error: upRes.reason ? upRes.reason.message : 'upstream unavailable' };
    }
    const upVer = String(upRes.value.version);
    const mVer = mirrorVer.status === 'fulfilled' ? mirrorVer.value : null;
    state.upstreamVersion = upVer;
    if (force || mVer !== upVer) {
        const trig = await triggerGithubMirrorSync(reason, force);
        return { ok: true, upstreamVersion: upVer, mirrorVersion: mVer, trigger: trig };
    }
    return { ok: true, upstreamVersion: upVer, mirrorVersion: mVer, trigger: { triggered: false, status: 'up-to-date' } };
}

function finalizeManifest(json, { isProject, packageUrl, baseSelf }) {
    const out = Object.assign({}, json);
    out.packageUrl = packageUrl;
    out.remoteManifestUrl = baseSelf + 'project.manifest';
    out.remoteVersionUrl = baseSelf + 'version.manifest';
    if (isProject && out.assets && typeof out.assets === 'object') {
        const filtered = {};
        for (const key of Object.keys(out.assets)) {
            if (!PROTECTED_ASSET_PREFIXES.some((p) => key.startsWith(p))) {
                filtered[key] = out.assets[key];
            }
        }
        out.assets = filtered;
    }
    return out;
}

async function handleHotfixManifestRequest(req, res, { isProject, syncConfigFromUpstream, onConfigUpdated }) {
    if (isProject && typeof syncConfigFromUpstream === 'function') {
        syncConfigFromUpstream({ reason: 'manifest-proxy' }, (syncErr, syncRes) => {
            if (!syncErr && syncRes && syncRes.updated && typeof onConfigUpdated === 'function') {
                onConfigUpdated();
            }
        });
    }

    const fileName = isProject ? 'project.manifest' : 'version.manifest';
    const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
    const host = req.headers.host || '127.0.0.1:8088';
    const baseSelf = `${proto}://${host}/static/hotfix/android/`;

    const [upRes, mirrorVerRes] = await Promise.allSettled([
        fetchJson(UPSTREAM_HOTFIX_BASE + fileName, 4500),
        getMirrorVersionCached(false)
    ]);

    if (upRes.status === 'fulfilled' && upRes.value && upRes.value.version) {
        const upJson = upRes.value;
        const upVer = String(upJson.version);
        const mirrorVer = mirrorVerRes.status === 'fulfilled' ? mirrorVerRes.value : null;
        state.upstreamVersion = upVer;
        state.lastError = null;

        let packageUrl = UPSTREAM_HOTFIX_BASE;
        if (mirrorVer && mirrorVer === upVer) {
            packageUrl = HOTFIX_MIRROR_BASE;
            state.lastSource = 'github-mirror (synced)';
        } else {
            state.lastSource = 'upstream (triggering-mirror)';
            // Fire and forget so client never waits for GitHub Actions
            triggerGithubMirrorSync('manifest-version-mismatch', false).catch(() => {});
        }

        const payload = finalizeManifest(upJson, { isProject, packageUrl, baseSelf });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
        return;
    }

    // Upstream failed or timed out -> serve from GitHub hotfix-mirror
    try {
        const mirrorJson = await fetchJson(HOTFIX_MIRROR_BASE + fileName, 8000);
        if (mirrorJson && mirrorJson.version) {
            state.mirrorVersion = String(mirrorJson.version);
            state.mirrorCheckedAt = Date.now();
            state.lastSource = 'github-mirror (fallback)';
            state.lastError = upRes.reason ? upRes.reason.message : 'upstream failed';

            const payload = finalizeManifest(mirrorJson, {
                isProject,
                packageUrl: HOTFIX_MIRROR_BASE,
                baseSelf
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(payload));
            return;
        }
    } catch (mirrorErr) {
        state.lastError = `upstream=${upRes.reason ? upRes.reason.message : 'err'}; mirror=${mirrorErr.message}`;
    }

    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        error: 'Failed to fetch hotfix manifest from both upstream and GitHub mirror',
        detail: state.lastError
    }));
}

function getHotfixStatus() {
    return Object.assign({}, state, {
        repo: GITHUB_REPO,
        branch: GITHUB_MIRROR_BRANCH,
        mirrorBaseUrl: HOTFIX_MIRROR_BASE,
        hasGithubToken: Boolean(GITHUB_TOKEN)
    });
}

module.exports = {
    UPSTREAM_HOTFIX_BASE,
    HOTFIX_MIRROR_BASE,
    handleHotfixManifestRequest,
    checkAndSyncIfNeeded,
    triggerGithubMirrorSync,
    getHotfixStatus
};
