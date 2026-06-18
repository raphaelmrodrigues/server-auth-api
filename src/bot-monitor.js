/**
 * Monitoramento em memória — zero impacto na extensão.
 * Atualizado pelos endpoints existentes (v-s, validate-key, validate-license).
 */

const ONLINE_TTL_MS = Number(process.env.BOT_ONLINE_TTL_MS) || 10 * 60 * 1000;
const MAX_EVENTS = 300;
const STATS_WINDOW_MS = 24 * 60 * 60 * 1000;

const onlinePlayers = new Map();
const events = [];
const heartbeatTimestamps = [];
const stats = {
    windowStart: Date.now(),
    counts: {},
};

function pruneOnline() {
    const now = Date.now();
    for (const [pid, data] of onlinePlayers) {
        if (now - data.lastSeen > ONLINE_TTL_MS) {
            onlinePlayers.delete(pid);
        }
    }
}

function pruneHeartbeats() {
    const cutoff = Date.now() - STATS_WINDOW_MS;
    while (heartbeatTimestamps.length && heartbeatTimestamps[0] < cutoff) {
        heartbeatTimestamps.shift();
    }
}

function rollStatsWindow() {
    if (Date.now() - stats.windowStart > STATS_WINDOW_MS) {
        stats.windowStart = Date.now();
        stats.counts = {};
    }
}

function bumpStat(key) {
    rollStatsWindow();
    stats.counts[key] = (stats.counts[key] || 0) + 1;
}

function pushEvent(type, playerId, reason, source) {
    events.unshift({
        ts: new Date().toISOString(),
        type,
        playerId: playerId ? String(playerId) : null,
        reason: reason || 'unknown',
        source: source || 'unknown',
    });
    if (events.length > MAX_EVENTS) {
        events.length = MAX_EVENTS;
    }
}

function sanitizeMeta(meta = {}) {
    const out = {};
    if (meta.botVersion != null) {
        out.botVersion = String(meta.botVersion).slice(0, 32);
    }
    if (meta.serverId != null) {
        out.serverId = String(meta.serverId).slice(0, 16);
    }
    if (meta.country != null) {
        out.country = String(meta.country).slice(0, 8);
    }
    if (meta.botActive != null) {
        out.botActive = !!meta.botActive;
    }
    if (meta.trial != null) {
        out.trial = !!meta.trial;
    }
    return out;
}

function recordSessionOk(source, playerId, meta = {}) {
    if (!playerId) return;
    pruneOnline();
    const pid = String(playerId);
    const prev = onlinePlayers.get(pid) || {};
    const clean = sanitizeMeta(meta);
    onlinePlayers.set(pid, {
        lastSeen: Date.now(),
        source: source || prev.source || 'unknown',
        botVersion: clean.botVersion ?? prev.botVersion ?? null,
        serverId: clean.serverId ?? prev.serverId ?? null,
        country: clean.country ?? prev.country ?? null,
        botActive: clean.botActive ?? prev.botActive ?? null,
        trial: clean.trial ?? prev.trial ?? null,
    });
    bumpStat(`${source}:ok`);
    if (source === 'v-s') {
        heartbeatTimestamps.push(Date.now());
        pruneHeartbeats();
        while (heartbeatTimestamps.length > 10000) {
            heartbeatTimestamps.shift();
        }
    }
    if (source !== 'v-s') {
        pushEvent('success', playerId, 'ok', source);
    }
}

function recordSessionFail(source, playerId, reason) {
    bumpStat(`${source}:fail`);
    bumpStat(`fail:${reason}`);
    pushEvent('failure', playerId, reason, source);
}

function getDashboard() {
    pruneOnline();
    pruneHeartbeats();
    rollStatsWindow();

    const now = Date.now();
    const online = [...onlinePlayers.entries()]
        .map(([playerId, data]) => ({
            playerId,
            lastSeen: new Date(data.lastSeen).toISOString(),
            source: data.source,
            botVersion: data.botVersion || null,
            serverId: data.serverId || null,
            country: data.country || null,
            botActive: data.botActive,
            trial: data.trial,
            agoSec: Math.round((now - data.lastSeen) / 1000),
        }))
        .sort((a, b) => a.agoSec - b.agoSec);

    const versionCounts = {};
    for (const [, data] of onlinePlayers) {
        const version = data.botVersion || 'desconhecida';
        versionCounts[version] = (versionCounts[version] || 0) + 1;
    }

    const failuresLastHour = events.filter((e) => {
        if (e.type !== 'failure') return false;
        return now - new Date(e.ts).getTime() < 60 * 60 * 1000;
    }).length;

    const successesLastHour = events.filter((e) => {
        if (e.type !== 'success') return false;
        return now - new Date(e.ts).getTime() < 60 * 60 * 1000;
    }).length;

    const heartbeatsLastHour = heartbeatTimestamps.filter(
        (ts) => now - ts < 60 * 60 * 1000
    ).length;

    return {
        onlineCount: online.length,
        onlinePlayers: online,
        recentEvents: events.slice(0, 100),
        stats24h: { ...stats.counts },
        failuresLastHour,
        successesLastHour,
        heartbeatsLastHour,
        versionCounts,
        distinctVersionCount: Object.keys(versionCounts).length,
        heartbeatTtlMinutes: Math.round(ONLINE_TTL_MS / 60000),
        serverTime: new Date().toISOString(),
    };
}

module.exports = {
    recordSessionOk,
    recordSessionFail,
    getDashboard,
};
