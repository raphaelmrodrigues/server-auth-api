/**
 * Proxy GladiusBOT -> servicos upstream (simulador + assets estaticos).
 * URLs upstream ficam apenas no servidor; a extensao usa gldbotserver.com.
 */
const FOCII_SIMU_URL = process.env.FOCII_SIMU_URL || 'https://simu.fociisoftware.com/simulate';
const FOCII_SIMU_API_KEY = process.env.FOCII_SIMU_API_KEY || 'GladBot99948365X';

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

function registerBotProxyRoutes(app) {
    app.post('/bot/simulate', async (req, res) => {
        try {
            const upstream = await fetch(FOCII_SIMU_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': FOCII_SIMU_API_KEY,
                },
                body: JSON.stringify(req.body),
            });
            const bodyText = await upstream.text();
            const contentType = upstream.headers.get('content-type');
            if (contentType) res.set('Content-Type', contentType);
            res.status(upstream.status);
            try {
                res.json(JSON.parse(bodyText));
            } catch {
                res.send(bodyText);
            }
        } catch (err) {
            console.error('[bot/simulate]', err);
            res.status(502).json({ error: 'Simulator unavailable' });
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
