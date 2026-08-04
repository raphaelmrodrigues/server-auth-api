const axios = require('axios');
const mongoose = require('mongoose');
const { getClientIp } = require('./player-guard');

const MESSAGER_TRIAL_CREDITS = Number(process.env.MESSAGER_TRIAL_CREDITS) || 30;
const GEO_CACHE_MS = 6 * 60 * 60 * 1000;
const geoCache = new Map();

const messagerSendLogSchema = new mongoose.Schema({
    user: { type: String, required: true, index: true },
    playerId: { type: String, default: '', index: true },
    count: { type: Number, required: true },
    remainingAfter: { type: Number, default: 0 },
    ip: { type: String, default: null, index: true },
    country: { type: String, default: null },
    city: { type: String, default: null },
    userAgent: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
});

const messagerTrialClaimSchema = new mongoose.Schema({
    playerId: { type: String, required: true, unique: true, index: true },
    user: { type: String, required: true, index: true },
    credits: { type: Number, default: MESSAGER_TRIAL_CREDITS },
    ip: { type: String, default: null },
    country: { type: String, default: null },
    city: { type: String, default: null },
    claimedAt: { type: Date, default: Date.now },
});

const MessagerSendLog = mongoose.model('MessagerSendLog', messagerSendLogSchema);
const MessagerTrialClaim = mongoose.model('MessagerTrialClaim', messagerTrialClaimSchema);

function normalizePlayerId(pid) {
    if (pid == null || pid === '') return '';
    const s = String(pid).trim();
    if (!/^\d{1,16}$/.test(s)) return '';
    return s;
}

async function lookupGeo(ip) {
    if (!ip) return { country: null, city: null };
    const clean = String(ip).replace(/^::ffff:/, '');
    if (
        clean === '127.0.0.1'
        || clean === '::1'
        || clean.startsWith('10.')
        || clean.startsWith('192.168.')
        || clean.startsWith('172.')
    ) {
        return { country: null, city: null };
    }

    const cached = geoCache.get(clean);
    if (cached && Date.now() - cached.at < GEO_CACHE_MS) {
        return { country: cached.country, city: cached.city };
    }

    try {
        const { data } = await axios.get(`https://ipwho.is/${encodeURIComponent(clean)}`, {
            timeout: 2500,
        });
        if (!data || data.success === false) {
            return { country: null, city: null };
        }
        const result = {
            country: data.country_code || data.country || null,
            city: data.city || null,
        };
        geoCache.set(clean, { ...result, at: Date.now() });
        if (geoCache.size > 5000) {
            const cutoff = Date.now() - GEO_CACHE_MS;
            for (const [k, v] of geoCache) {
                if (v.at < cutoff) geoCache.delete(k);
            }
        }
        return result;
    } catch (e) {
        return { country: null, city: null };
    }
}

async function buildMessagerClientMeta(req) {
    const ip = getClientIp(req);
    const geo = await lookupGeo(ip);
    return {
        ip,
        country: geo.country,
        city: geo.city,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 220),
    };
}

/**
 * Concede trial uma vez por playerId (e uma vez por conta Messager).
 * Retorna { granted, credits, reason }.
 */
async function tryClaimMessagerTrial(userDoc, playerId, meta = {}) {
    if (!userDoc || userDoc.msgTrialClaimed) {
        return { granted: false, reason: 'already_claimed', credits: 0 };
    }

    const pid = normalizePlayerId(playerId);
    if (!pid) {
        return { granted: false, reason: 'missing_playerid', credits: 0 };
    }

    const existing = await MessagerTrialClaim.findOne({ playerId: pid }).lean();
    if (existing) {
        userDoc.msgTrialDenied = true;
        userDoc.msgLastPlayerId = pid;
        await userDoc.save();
        return {
            granted: false,
            reason: 'playerid_already_used',
            credits: 0,
            claimedBy: existing.user,
        };
    }

    try {
        await MessagerTrialClaim.create({
            playerId: pid,
            user: userDoc.user,
            credits: MESSAGER_TRIAL_CREDITS,
            ip: meta.ip || null,
            country: meta.country || null,
            city: meta.city || null,
        });
    } catch (err) {
        // corrida: outro request gravou o mesmo playerId
        return { granted: false, reason: 'playerid_already_used', credits: 0 };
    }

    userDoc.messages = (Number(userDoc.messages) || 0) + MESSAGER_TRIAL_CREDITS;
    userDoc.msgTrialClaimed = true;
    userDoc.msgTrialPlayerId = pid;
    userDoc.msgLastPlayerId = pid;
    userDoc.msgTrialDenied = false;
    await userDoc.save();

    return { granted: true, reason: 'ok', credits: MESSAGER_TRIAL_CREDITS };
}

async function recordMessagerSend(payload) {
    try {
        await MessagerSendLog.create({
            user: String(payload.user || ''),
            playerId: normalizePlayerId(payload.playerId) || '',
            count: Math.max(0, Number(payload.count) || 0),
            remainingAfter: Number(payload.remainingAfter) || 0,
            ip: payload.ip || null,
            country: payload.country || null,
            city: payload.city || null,
            userAgent: payload.userAgent || null,
        });
    } catch (e) {
        console.error('Messager send log error:', e.message);
    }
}

async function getMessagerAdminSummary(days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - Math.max(1, Math.min(90, Number(days) || 7)));

    const [sends, trials, sendAgg, topUsers] = await Promise.all([
        MessagerSendLog.find({ createdAt: { $gte: since } })
            .sort({ createdAt: -1 })
            .limit(200)
            .lean(),
        MessagerTrialClaim.find({})
            .sort({ claimedAt: -1 })
            .limit(100)
            .lean(),
        MessagerSendLog.aggregate([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: null,
                    totalSends: { $sum: '$count' },
                    batches: { $sum: 1 },
                    users: { $addToSet: '$user' },
                    players: { $addToSet: '$playerId' },
                },
            },
        ]),
        MessagerSendLog.aggregate([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: '$user',
                    total: { $sum: '$count' },
                    batches: { $sum: 1 },
                    lastAt: { $max: '$createdAt' },
                    lastPlayerId: { $last: '$playerId' },
                    lastIp: { $last: '$ip' },
                    lastCountry: { $last: '$country' },
                    lastCity: { $last: '$city' },
                },
            },
            { $sort: { total: -1 } },
            { $limit: 50 },
        ]),
    ]);

    const agg = sendAgg[0] || { totalSends: 0, batches: 0, users: [], players: [] };

    return {
        since,
        stats: {
            totalSends: agg.totalSends || 0,
            batches: agg.batches || 0,
            uniqueUsers: (agg.users || []).filter(Boolean).length,
            uniquePlayers: (agg.players || []).filter(Boolean).length,
            trialClaims: await MessagerTrialClaim.countDocuments({}),
        },
        recentSends: sends,
        topUsers,
        trials,
        trialCredits: MESSAGER_TRIAL_CREDITS,
    };
}

module.exports = {
    MESSAGER_TRIAL_CREDITS,
    MessagerSendLog,
    MessagerTrialClaim,
    normalizePlayerId,
    lookupGeo,
    buildMessagerClientMeta,
    tryClaimMessagerTrial,
    recordMessagerSend,
    getMessagerAdminSummary,
};
