/**
 * Proteção de sessão: bloqueio por playerId, rate limit e auditoria de abuso.
 * Rate limit aplica-se APENAS a playerIds sem nenhum registro de licença no banco.
 */
const mongoose = require('mongoose');
const { sendAbuseAlertEmail } = require('./abuse-alert-email');

const GLD_GUARD_MARK = 7;

const blockedPlayerSchema = new mongoose.Schema({
    playerId: { type: String, required: true, unique: true, index: true },
    reason: { type: String, default: '' },
    blockedAt: { type: Date, default: Date.now },
    blockedBy: { type: String, default: 'admin' },
    meta: { type: Object, default: {} },
});

const abuseEventSchema = new mongoose.Schema({
    ts: { type: Date, default: Date.now, index: true },
    playerId: { type: String, required: true, index: true },
    source: { type: String, default: 'unknown' },
    reason: { type: String, default: 'unknown' },
    ip: { type: String, default: null },
    serverId: { type: String, default: null },
    country: { type: String, default: null },
    charName: { type: String, default: null },
    botVersion: { type: String, default: null },
    botActive: { type: Boolean, default: null },
    userAgent: { type: String, default: null },
    suspicious: { type: Boolean, default: false },
});

const abuseAlertSentSchema = new mongoose.Schema({
    playerId: { type: String, required: true, unique: true, index: true },
    sentAt: { type: Date, default: Date.now },
    attemptCount: { type: Number, default: 0 },
});

const BlockedPlayer = mongoose.models.BlockedPlayer
    || mongoose.model('BlockedPlayer', blockedPlayerSchema);
const AbuseEvent = mongoose.models.AbuseEvent
    || mongoose.model('AbuseEvent', abuseEventSchema);
const AbuseAlertSent = mongoose.models.AbuseAlertSent
    || mongoose.model('AbuseAlertSent', abuseAlertSentSchema);

/** Rate limit só para quem nunca teve licença — proteção anti-flood, não anti-cliente. */
const RATE_WINDOW_MS = Number(process.env.GLD_RATE_WINDOW_MS) || 15 * 60 * 1000;
const RATE_MAX_UNKNOWN = Number(process.env.GLD_RATE_MAX_UNKNOWN) || 120;

const ALERT_WINDOW_MS = Number(process.env.GLD_ALERT_WINDOW_MS) || 60 * 60 * 1000;
const ALERT_THRESHOLD = Number(process.env.GLD_ALERT_THRESHOLD) || 8;
const ALERT_COOLDOWN_MS = Number(process.env.GLD_ALERT_COOLDOWN_MS) || 6 * 60 * 60 * 1000;

const rateBuckets = new Map();
const suspiciousTrack = new Map();
const licenseRecordCache = new Map();
const LICENSE_CACHE_MS = 2 * 60 * 1000;

let blockedCache = new Set();
let blockedCacheAt = 0;
const BLOCKED_CACHE_MS = 30 * 1000;

let guardMailDeps = null;

function configurePlayerGuard(deps = {}) {
    guardMailDeps = deps.sgMail ? deps : null;
}

function invalidateBlockedCache() {
    blockedCacheAt = 0;
    blockedCache = new Set();
}

function getClientIp(req) {
    const xf = req.headers['x-forwarded-for'];
    if (xf) return String(xf).split(',')[0].trim();
    return req.socket?.remoteAddress || req.ip || null;
}

function buildClientContext(req) {
    const b = req.body || {};
    const charName = b.un || b.charName || b.username || null;
    return {
        ip: getClientIp(req),
        serverId: b.serverId != null ? String(b.serverId).slice(0, 16) : null,
        country: b.country != null ? String(b.country).slice(0, 8) : null,
        charName: charName != null ? String(charName).slice(0, 64) : null,
        botVersion: b.botVersion != null ? String(b.botVersion).slice(0, 32) : null,
        botActive: b.botActive != null ? !!b.botActive : null,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 220),
    };
}

async function playerHasLicenseRecord(License, playerId) {
    if (!playerId || !License) return false;
    const pid = String(playerId);
    const cached = licenseRecordCache.get(pid);
    if (cached && Date.now() - cached.at < LICENSE_CACHE_MS) {
        return cached.exists;
    }
    const exists = !!(await License.findOne({ playerid: pid }).select('_id').lean());
    licenseRecordCache.set(pid, { exists, at: Date.now() });
    if (licenseRecordCache.size > 15000) {
        const cutoff = Date.now() - LICENSE_CACHE_MS;
        for (const [k, v] of licenseRecordCache) {
            if (v.at < cutoff) licenseRecordCache.delete(k);
        }
    }
    return exists;
}

function checkRateLimitUnknown(playerId) {
    const pid = String(playerId);
    const now = Date.now();
    let bucket = rateBuckets.get(pid);
    if (!bucket || now - bucket.start > RATE_WINDOW_MS) {
        bucket = { start: now, count: 0 };
        rateBuckets.set(pid, bucket);
    }
    bucket.count += 1;
    if (rateBuckets.size > 10000) {
        for (const [k, v] of rateBuckets) {
            if (now - v.start > RATE_WINDOW_MS) rateBuckets.delete(k);
        }
    }
    return {
        allowed: bucket.count <= RATE_MAX_UNKNOWN,
        count: bucket.count,
        limit: RATE_MAX_UNKNOWN,
    };
}

async function isPlayerBlocked(playerId) {
    if (!playerId) return false;
    const pid = String(playerId);
    if (Date.now() - blockedCacheAt > BLOCKED_CACHE_MS) {
        const rows = await BlockedPlayer.find({}).select('playerId').lean();
        blockedCache = new Set(rows.map((r) => String(r.playerId)));
        blockedCacheAt = Date.now();
    }
    return blockedCache.has(pid);
}

function withGuardDeny(base = {}) {
    return {
        ...base,
        valid: false,
        ok: false,
        r: GLD_GUARD_MARK,
        message: base.message || 'Invalid license Key or player without access',
        p: '1970-01-01T00:00:00.001Z',
    };
}

function withGuardDenyMinimal() {
    return { ok: false, s: 0, r: GLD_GUARD_MARK, t: Date.now() };
}

async function logAbuseEvent(data) {
    try {
        await AbuseEvent.create({
            playerId: String(data.playerId),
            source: data.source || 'unknown',
            reason: data.reason || 'unknown',
            ip: data.ip || null,
            serverId: data.serverId || null,
            country: data.country || null,
            charName: data.charName || null,
            botVersion: data.botVersion || null,
            botActive: data.botActive,
            userAgent: data.userAgent || null,
            suspicious: !!data.suspicious,
        });
    } catch (e) {
        console.error('[player-guard] logAbuseEvent:', e.message);
    }
}

function trackSuspiciousAttempt(playerId, source, reason, ctx) {
    const pid = String(playerId);
    const now = Date.now();
    let row = suspiciousTrack.get(pid);
    if (!row || now - row.windowStart > ALERT_WINDOW_MS) {
        row = { windowStart: now, count: 0, reasons: {}, lastCtx: {}, lastSource: source };
        suspiciousTrack.set(pid, row);
    }
    row.count += 1;
    row.reasons[reason] = (row.reasons[reason] || 0) + 1;
    row.lastSource = source;
    row.lastCtx = { ...row.lastCtx, ...ctx };
    if (suspiciousTrack.size > 10000) {
        for (const [k, v] of suspiciousTrack) {
            if (now - v.windowStart > ALERT_WINDOW_MS) suspiciousTrack.delete(k);
        }
    }
    return row;
}

async function maybeSendSuspiciousAlert(playerId, source, reason, ctx) {
    if (!guardMailDeps?.sgMail) return;

    const row = trackSuspiciousAttempt(playerId, source, reason, ctx);
    if (row.count < ALERT_THRESHOLD) return;

    try {
        const prior = await AbuseAlertSent.findOne({ playerId: String(playerId) }).lean();
        if (prior && Date.now() - new Date(prior.sentAt).getTime() < ALERT_COOLDOWN_MS) {
            return;
        }

        await sendAbuseAlertEmail(guardMailDeps.sgMail, {
            playerId: String(playerId),
            charName: row.lastCtx.charName,
            serverId: row.lastCtx.serverId,
            country: row.lastCtx.country,
            ip: row.lastCtx.ip,
            botVersion: row.lastCtx.botVersion,
            attemptCount: row.count,
            reasons: { ...row.reasons },
            lastSource: source,
        });

        await AbuseAlertSent.findOneAndUpdate(
            { playerId: String(playerId) },
            { sentAt: new Date(), attemptCount: row.count },
            { upsert: true }
        );
        console.log(`[player-guard] Alerta de abuso enviado para player ${playerId} (${row.count} tentativas)`);
    } catch (e) {
        console.error('[player-guard] maybeSendSuspiciousAlert:', e.message);
    }
}

/**
 * Retorna true se a requisição foi encerrada (bloqueio manual / flood desconhecido).
 */
async function guardPrecheck(req, res, playerId, source, recordFail, License) {
    if (!playerId) return false;
    const ctx = buildClientContext(req);

    if (await isPlayerBlocked(playerId)) {
        if (recordFail) recordFail(source, playerId, 'blocked', ctx);
        await logAbuseEvent({
            ...ctx,
            playerId,
            source,
            reason: 'blocked',
            suspicious: true,
        });
        if (source === 'rs') {
            res.json(withGuardDenyMinimal());
        } else {
            res.json(withGuardDeny());
        }
        return true;
    }

    const hasLicenseRecord = License
        ? await playerHasLicenseRecord(License, playerId)
        : false;

    if (!hasLicenseRecord) {
        const rl = checkRateLimitUnknown(playerId);
        if (!rl.allowed) {
            if (recordFail) recordFail(source, playerId, 'rate_limited', ctx);
            await logAbuseEvent({
                ...ctx,
                playerId,
                source,
                reason: 'rate_limited',
                suspicious: true,
            });
            if (source === 'rs') {
                res.json(withGuardDenyMinimal());
            } else {
                res.json(withGuardDeny());
            }
            return true;
        }
    }

    return false;
}

async function logSuspiciousNoLicense(License, playerId, source, ctx) {
    if (!playerId) return;
    try {
        const exists = await playerHasLicenseRecord(License, playerId);
        if (!exists) {
            const reason = source === 'v-s' ? 'no_license_jwt' : 'no_license_record';
            await logAbuseEvent({
                ...ctx,
                playerId,
                source,
                reason,
                suspicious: true,
            });
            await maybeSendSuspiciousAlert(playerId, source, reason, ctx);
        }
    } catch (e) {
        console.error('[player-guard] logSuspiciousNoLicense:', e.message);
    }
}

async function listBlockedPlayers() {
    return BlockedPlayer.find({}).sort({ blockedAt: -1 }).lean();
}

async function blockPlayer(playerId, reason, blockedBy) {
    const doc = await BlockedPlayer.findOneAndUpdate(
        { playerId: String(playerId) },
        {
            playerId: String(playerId),
            reason: String(reason || '').slice(0, 500),
            blockedBy: blockedBy || 'admin',
            blockedAt: new Date(),
        },
        { upsert: true, new: true }
    );
    invalidateBlockedCache();
    return doc;
}

async function unblockPlayer(playerId) {
    const result = await BlockedPlayer.deleteOne({ playerId: String(playerId) });
    invalidateBlockedCache();
    return result.deletedCount > 0;
}

async function getAbuseSummary(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const events = await AbuseEvent.find({ ts: { $gte: since } })
        .sort({ ts: -1 })
        .limit(500)
        .lean();

    const byPlayer = {};
    for (const ev of events) {
        const pid = ev.playerId;
        if (!byPlayer[pid]) {
            byPlayer[pid] = {
                playerId: pid,
                hits: 0,
                lastSeen: ev.ts,
                reasons: {},
                charName: ev.charName,
                serverId: ev.serverId,
                country: ev.country,
                ip: ev.ip,
                botVersion: ev.botVersion,
            };
        }
        const row = byPlayer[pid];
        row.hits += 1;
        if (new Date(ev.ts) > new Date(row.lastSeen)) {
            row.lastSeen = ev.ts;
            if (ev.charName) row.charName = ev.charName;
            if (ev.serverId) row.serverId = ev.serverId;
            if (ev.country) row.country = ev.country;
            if (ev.ip) row.ip = ev.ip;
            if (ev.botVersion) row.botVersion = ev.botVersion;
        }
        row.reasons[ev.reason] = (row.reasons[ev.reason] || 0) + 1;
    }

    const suspicious = Object.values(byPlayer)
        .filter((r) => r.hits >= 3)
        .sort((a, b) => b.hits - a.hits);

    return { events, suspicious, hours };
}

module.exports = {
    GLD_GUARD_MARK,
    BlockedPlayer,
    AbuseEvent,
    AbuseAlertSent,
    buildClientContext,
    configurePlayerGuard,
    guardPrecheck,
    withGuardDeny,
    withGuardDenyMinimal,
    logAbuseEvent,
    logSuspiciousNoLicense,
    isPlayerBlocked,
    playerHasLicenseRecord,
    listBlockedPlayers,
    blockPlayer,
    unblockPlayer,
    getAbuseSummary,
    invalidateBlockedCache,
};
