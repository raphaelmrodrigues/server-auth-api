/**
 * Monitoramento em memória — zero impacto na extensão.
 * Atualizado pelos endpoints existentes (v-s, validate-key, validate-license).
 */

const ONLINE_TTL_MS = Number(process.env.BOT_ONLINE_TTL_MS) || 10 * 60 * 1000;
const MAX_EVENTS = 300;
const STATS_WINDOW_MS = 24 * 60 * 60 * 1000;

const onlinePlayers = new Map();
const events = [];
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

function recordSessionOk(source, playerId) {
    if (!playerId) return;
    pruneOnline();
    onlinePlayers.set(String(playerId), {
        lastSeen: Date.now(),
        source: source || 'unknown',
    });
    bumpStat(`${source}:ok`);
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
    rollStatsWindow();

    const now = Date.now();
    const online = [...onlinePlayers.entries()]
        .map(([playerId, data]) => ({
            playerId,
            lastSeen: new Date(data.lastSeen).toISOString(),
            source: data.source,
            agoSec: Math.round((now - data.lastSeen) / 1000),
        }))
        .sort((a, b) => a.agoSec - b.agoSec);

    const failuresLastHour = events.filter((e) => {
        if (e.type !== 'failure') return false;
        return now - new Date(e.ts).getTime() < 60 * 60 * 1000;
    }).length;

    const successesLastHour = events.filter((e) => {
        if (e.type !== 'success') return false;
        return now - new Date(e.ts).getTime() < 60 * 60 * 1000;
    }).length;

    return {
        onlineCount: online.length,
        onlinePlayers: online,
        recentEvents: events.slice(0, 100),
        stats24h: { ...stats.counts },
        failuresLastHour,
        successesLastHour,
        heartbeatTtlMinutes: Math.round(ONLINE_TTL_MS / 60000),
        serverTime: new Date().toISOString(),
    };
}

module.exports = {
    recordSessionOk,
    recordSessionFail,
    getDashboard,
};
