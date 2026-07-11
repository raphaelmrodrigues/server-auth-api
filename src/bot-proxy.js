/**
 * Proxy GladiusBOT -> simulador local (DinoDevs) + assets estaticos.
 * A extensao continua chamando gldbotserver.com/bot/simulate.
 */
const UPSTREAM_ASSETS = {
    'aud.mp3': 'https://raw.githubusercontent.com/fociisoftware/glbt/main/aud.mp3',
    'Smelt2.gif': 'https://raw.githubusercontent.com/fociisoftware/glbt/refs/heads/main/Smelt2.gif',
    'workbench.cur': 'https://www.fociisoftware.com/imageuploads/image-1684115313786-603426005.cur',
    'fire-smelt.cur': 'https://www.fociisoftware.com/imageuploads/image-1684179708160-785712220.cur',
    'char-item-bg.jpg': 'https://www.fociisoftware.com/imageuploads/image-1681843284713-410004197.jpg',
};

const ASSET_MIME = {
    'aud.mp3': 'audio/mpeg',
    'Smelt2.gif': 'image/gif',
    'workbench.cur': 'image/x-icon',
    'fire-smelt.cur': 'image/x-icon',
    'char-item-bg.jpg': 'image/jpeg',
};

const { isPlayerBlocked } = require('./player-guard');
const { simulateArena } = require('./arena-simulator');
const { fetchExpeditionAllEnemies, listExpeditionCountries } = require('./expedition-simulator');

function registerBotProxyRoutes(app, deps = {}) {
    const {
        jwtSecret,
        globalToken,
        License,
        verifyLicenseSession,
        assertLicenseActive,
        verifySessionSignature,
        verifySessionMark,
    } = deps;

    async function ensureLicensedSimulate(playerId, tkz_lcr, res, extras = {}) {
        if (!jwtSecret || !License || !verifyLicenseSession || !assertLicenseActive) {
            return true;
        }
        if (!playerId || !tkz_lcr) {
            res.status(403).json({ error: 'Unauthorized' });
            return false;
        }
        if (await isPlayerBlocked(playerId)) {
            res.status(403).json({ error: 'Unauthorized' });
            return false;
        }
        try {
            if (String(tkz_lcr).indexOf('.') < 0) {
                if (!globalToken || tkz_lcr !== globalToken) {
                    res.status(403).json({ error: 'Unauthorized' });
                    return false;
                }
            } else {
                verifyLicenseSession(jwtSecret, tkz_lcr, playerId);
                const qs = extras.q || extras.qs;
                const mark = extras.k || extras.mark;
                if (qs && verifySessionSignature && !verifySessionSignature(jwtSecret, tkz_lcr, qs)) {
                    res.status(403).json({ error: 'Unauthorized' });
                    return false;
                }
                if (mark && verifySessionMark && !verifySessionMark(jwtSecret, tkz_lcr, mark)) {
                    res.status(403).json({ error: 'Unauthorized' });
                    return false;
                }
            }
            const licenseData = await assertLicenseActive(License, playerId);
            if (!licenseData) {
                res.status(403).json({ error: 'License expired', licenseExpired: true });
                return false;
            }
            return true;
        } catch (err) {
            const expired = err && (err.name === 'TokenExpiredError' || /expired/i.test(String(err.message || '')));
            if (expired) {
                res.status(403).json({ error: 'License expired', licenseExpired: true });
                return false;
            }
            res.status(403).json({ error: 'Unauthorized' });
            return false;
        }
    }

    app.post('/bot/simulate', async (req, res) => {
        try {
            const { playerId, tkz_lcr, q, qs, k, mark, attacker, defender } = req.body || {};
            if (!await ensureLicensedSimulate(playerId, tkz_lcr, res, { q, qs, k, mark })) {
                return;
            }
            if (!attacker || !defender) {
                return res.status(400).json({ error: 'Missing attacker or defender stats.' });
            }

            const result = simulateArena(attacker, defender, {
                'life-mode': req.body['life-mode'] || req.body.lifeMode || 'current',
                simulates: req.body.simulates,
                rounds: req.body.rounds,
            });

            if (result.error) {
                return res.status(400).json({ error: result.error });
            }

            // Formato esperado pelo contentScript: winChance / loseChance / drawChance
            return res.json({
                winChance: result.winChance,
                loseChance: result.loseChance,
                drawChance: result.drawChance,
                details: result.details,
            });
        } catch (err) {
            console.error('[bot/simulate]', err);
            res.status(502).json({ error: 'Simulator unavailable' });
        }
    });

    app.get('/bot/expedition-countries', (req, res) => {
        return res.json({ success: true, countries: listExpeditionCountries() });
    });

    app.post('/bot/simulate-expedition', async (req, res) => {
        try {
            const { playerId, tkz_lcr, q, qs, k, mark, name, country, server } = req.body || {};
            if (!await ensureLicensedSimulate(playerId, tkz_lcr, res, { q, qs, k, mark })) {
                return;
            }
            const result = await fetchExpeditionAllEnemies({ name, country, server });
            if (result.error) {
                return res.status(400).json({ error: result.error });
            }
            return res.json({ success: true, ...result });
        } catch (err) {
            console.error('[bot/simulate-expedition]', err);
            res.status(502).json({ error: 'Expedition simulator unavailable' });
        }
    });

    app.get('/bot/assets/:filename', async (req, res) => {
        const name = req.params.filename;
        const upstreamUrl = UPSTREAM_ASSETS[name];
        if (!upstreamUrl) {
            return res.status(404).json({ error: 'Asset not found' });
        }
        try {
            const upstream = await fetch(upstreamUrl);
            if (!upstream.ok) {
                return res.status(502).json({ error: 'Upstream asset unavailable' });
            }
            res.set('Content-Type', ASSET_MIME[name] || upstream.headers.get('content-type') || 'application/octet-stream');
            res.set('Cache-Control', 'public, max-age=86400');
            res.send(Buffer.from(await upstream.arrayBuffer()));
        } catch (err) {
            console.error('[bot/assets]', name, err);
            res.status(502).json({ error: 'Asset proxy error' });
        }
    });
}

module.exports = { registerBotProxyRoutes };
