const ITCH_API_BASE = 'https://api.itch.io';

function getItchGameIdForPlan(planCode) {
    const map = {
        '15DAYS': process.env.ITCH_GAME_ID_15D,
        '30DAYS': process.env.ITCH_GAME_ID_30D,
        '60DAYS': process.env.ITCH_GAME_ID_60D,
    };
    return map[planCode] || null;
}

function getItchGameIdFromPlanTitle(planTitle) {
    const normalized = String(planTitle || '').toLowerCase();
    if (normalized.includes('60')) return process.env.ITCH_GAME_ID_60D;
    if (normalized.includes('30')) return process.env.ITCH_GAME_ID_30D;
    if (normalized.includes('15')) return process.env.ITCH_GAME_ID_15D;
    return null;
}

async function itchApiRequest(path, params = {}) {
    const apiKey = process.env.ITCH_API_KEY;
    if (!apiKey) {
        throw new Error('ITCH_API_KEY não configurada no servidor.');
    }

    const url = new URL(`${ITCH_API_BASE}${path}`);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
        },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || (data.errors && data.errors.length)) {
        const message = (data.errors && data.errors[0]) || `itch API HTTP ${response.status}`;
        throw new Error(message);
    }
    return data;
}

async function fetchProfileGames() {
    const data = await itchApiRequest('/profile/games');
    return data.games || [];
}

async function lookupDownloadKey(gameId, downloadKey) {
    const data = await itchApiRequest(`/games/${gameId}/download_keys`, { download_key: downloadKey });
    return data.download_key || null;
}

async function lookupPurchasesByUserId(gameId, userId) {
    const data = await itchApiRequest(`/games/${gameId}/purchases`, { user_id: userId });
    return data.purchases || [];
}

async function enrichLicenseFromDownloadKey({ planCode, planTitle, downloadKey }) {
    const gameId = getItchGameIdForPlan(planCode) || getItchGameIdFromPlanTitle(planTitle);
    if (!gameId) {
        throw new Error('ID do jogo itch não configurado para este plano.');
    }

    const download = await lookupDownloadKey(gameId, downloadKey);
    if (!download || !download.owner) {
        throw new Error('Download key inválida ou não encontrada no itch.');
    }

    const purchases = await lookupPurchasesByUserId(gameId, download.owner.id);
    const latestPurchase = purchases[0] || null;

    return {
        gameId,
        downloadKey: download.key,
        itchUserId: download.owner.id,
        itchUsername: download.owner.username,
        email: latestPurchase?.email || '',
        purchaseId: latestPurchase?.id || null,
        purchaseCreatedAt: latestPurchase?.created_at || null,
    };
}

module.exports = {
    getItchGameIdForPlan,
    getItchGameIdFromPlanTitle,
    fetchProfileGames,
    lookupDownloadKey,
    lookupPurchasesByUserId,
    enrichLicenseFromDownloadKey,
};
