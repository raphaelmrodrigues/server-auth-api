/**
 * Telemetria do app Android — anônima, sem senha Gameforge, IMEI ou Advertising ID.
 * Heartbeat conta instalações ativas; erros nativos/WebView ajudam a diagnosticar crashes.
 */

const mongoose = require('mongoose');

const HEARTBEAT_MIN_MS = 15 * 1000;
const ERROR_WINDOW_MS = 60 * 60 * 1000;
const ERROR_MAX_PER_WINDOW = 12;
const ONLINE_MS = 15 * 60 * 1000;
const INSTALL_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

const lastHeartbeatAt = new Map();
const errorHits = new Map();

const AppDevice = mongoose.model('AppDevice', new mongoose.Schema({
    installId: { type: String, unique: true, index: true },
    firstSeen: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now, index: true },
    appVersion: String,
    androidSdk: Number,
    androidRelease: String,
    manufacturer: String,
    model: String,
    webViewVersion: String,
    botRunning: Boolean,
}, { versionKey: false }));

const AppError = mongoose.model('AppError', new mongoose.Schema({
    installId: { type: String, index: true },
    ts: { type: Date, default: Date.now, index: true, expires: 14 * 24 * 60 * 60 },
    kind: { type: String, enum: ['crash', 'webview', 'app'] },
    message: String,
    stack: String,
    appVersion: String,
    androidSdk: Number,
    androidRelease: String,
}, { versionKey: false }));

function clip(value, max) {
    if (value == null) return null;
    const text = String(value).trim();
    if (!text) return null;
    return text.slice(0, max);
}

function parseInstallId(body) {
    const id = clip(body?.installId, 64);
    if (!id || !INSTALL_ID_RE.test(id)) return null;
    return id;
}

function deviceFields(body) {
    const sdk = Number(body?.androidSdk);
    return {
        appVersion: clip(body?.appVersion, 32),
        androidSdk: Number.isFinite(sdk) && sdk > 0 ? Math.floor(sdk) : null,
        androidRelease: clip(body?.androidRelease, 16),
        manufacturer: clip(body?.manufacturer, 32),
        model: clip(body?.model, 64),
        webViewVersion: clip(body?.webViewVersion, 32),
        botRunning: body?.botRunning == null ? null : !!body.botRunning,
    };
}

function tooSoon(map, key, minMs) {
    const now = Date.now();
    const prev = map.get(key) || 0;
    if (now - prev < minMs) return true;
    map.set(key, now);
    if (map.size > 20000) {
        const cutoff = now - 24 * 60 * 60 * 1000;
        for (const [k, ts] of map) {
            if (ts < cutoff) map.delete(k);
        }
    }
    return false;
}

function errorLimited(installId) {
    const now = Date.now();
    const list = (errorHits.get(installId) || []).filter((ts) => now - ts < ERROR_WINDOW_MS);
    if (list.length >= ERROR_MAX_PER_WINDOW) {
        errorHits.set(installId, list);
        return true;
    }
    list.push(now);
    errorHits.set(installId, list);
    return false;
}

function countBy(rows, key, fallback) {
    const out = {};
    for (const row of rows) {
        const label = row[key] || fallback;
        out[label] = (out[label] || 0) + 1;
    }
    return out;
}

async function getAndroidDashboard() {
    const now = Date.now();
    const onlineSince = new Date(now - ONLINE_MS);
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [onlineCount, unique24h, unique7d, errors24h, devices, errors] = await Promise.all([
        AppDevice.countDocuments({ lastSeen: { $gte: onlineSince } }),
        AppDevice.countDocuments({ lastSeen: { $gte: dayAgo } }),
        AppDevice.countDocuments({ lastSeen: { $gte: weekAgo } }),
        AppError.countDocuments({ ts: { $gte: dayAgo } }),
        AppDevice.find({ lastSeen: { $gte: weekAgo } }).sort({ lastSeen: -1 }).limit(120).lean(),
        AppError.find({}).sort({ ts: -1 }).limit(40).lean(),
    ]);

    const onlineDevices = devices.filter((d) => d.lastSeen && d.lastSeen.getTime() >= onlineSince.getTime());

    return {
        onlineCount,
        unique24h,
        unique7d,
        errors24h,
        onlineTtlMinutes: Math.round(ONLINE_MS / 60000),
        androidReleaseCounts: countBy(onlineDevices.length ? onlineDevices : devices, 'androidRelease', 'desconhecida'),
        appVersionCounts: countBy(onlineDevices.length ? onlineDevices : devices, 'appVersion', 'desconhecida'),
        devices: devices.slice(0, 80).map((d) => ({
            installId: d.installId,
            lastSeen: d.lastSeen,
            agoSec: d.lastSeen ? Math.round((now - d.lastSeen.getTime()) / 1000) : null,
            appVersion: d.appVersion || null,
            androidRelease: d.androidRelease || null,
            androidSdk: d.androidSdk || null,
            manufacturer: d.manufacturer || null,
            model: d.model || null,
            webViewVersion: d.webViewVersion || null,
            botRunning: d.botRunning,
        })),
        errors: errors.map((e) => ({
            ts: e.ts,
            kind: e.kind,
            message: e.message || null,
            stack: e.stack || null,
            appVersion: e.appVersion || null,
            androidRelease: e.androidRelease || null,
            androidSdk: e.androidSdk || null,
            installId: e.installId,
        })),
    };
}

function registerAppTelemetryRoutes(app) {
    app.post('/app/heartbeat', async (req, res) => {
        const installId = parseInstallId(req.body);
        if (!installId) {
            return res.status(400).json({ ok: false });
        }
        if (tooSoon(lastHeartbeatAt, installId, HEARTBEAT_MIN_MS)) {
            return res.json({ ok: true, throttled: true });
        }
        const fields = deviceFields(req.body);
        try {
            await AppDevice.findOneAndUpdate(
                { installId },
                {
                    $set: { lastSeen: new Date(), ...fields },
                    $setOnInsert: { firstSeen: new Date(), installId },
                },
                { upsert: true }
            );
            return res.json({ ok: true });
        } catch (error) {
            console.error('app heartbeat:', error.message);
            return res.status(500).json({ ok: false });
        }
    });

    app.post('/app/error', async (req, res) => {
        const installId = parseInstallId(req.body);
        if (!installId) {
            return res.status(400).json({ ok: false });
        }
        if (errorLimited(installId)) {
            return res.json({ ok: true, throttled: true });
        }
        const kind = ['crash', 'webview', 'app'].includes(req.body?.kind) ? req.body.kind : 'app';
        const fields = deviceFields(req.body);
        try {
            await AppError.create({
                installId,
                ts: new Date(),
                kind,
                message: clip(req.body?.message, 300),
                stack: clip(req.body?.stack, 2000),
                appVersion: fields.appVersion,
                androidSdk: fields.androidSdk,
                androidRelease: fields.androidRelease,
            });
            return res.json({ ok: true });
        } catch (error) {
            console.error('app error:', error.message);
            return res.status(500).json({ ok: false });
        }
    });
}

module.exports = {
    registerAppTelemetryRoutes,
    getAndroidDashboard,
};
