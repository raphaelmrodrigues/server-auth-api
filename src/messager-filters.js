/**
 * Resolução de filtros do Messager (server-side).
 * Campos do pool: p=position, n=name, c=country, g=guild(ally).
 * cfg: lo/hi=intervalo, a=skipAlly, i=useIgnoreList, ig=[], cl=countryLimit, cs={}
 */

function normalizeBool(v) {
    return v === true || v === 'true' || v === 1 || v === '1';
}

function resolveMessagerTargets(pool, cfg = {}) {
    const lo = Math.max(1, parseInt(cfg.lo, 10) || 1);
    const hi = Math.min(510, parseInt(cfg.hi, 10) || 510);
    const skipAlly = normalizeBool(cfg.a);
    const useIgnore = normalizeBool(cfg.i);
    const ignoreList = Array.isArray(cfg.ig)
        ? cfg.ig.map((x) => String(x)).filter(Boolean)
        : [];
    const countryLimit = normalizeBool(cfg.cl);
    const countrySettings = cfg.cs && typeof cfg.cs === 'object' ? cfg.cs : {};

    const recipients = [];
    const skips = [];
    const seen = new Set();

    if (!Array.isArray(pool)) {
        return { recipients, skips };
    }

    const capped = pool.slice(0, 600);

    for (const row of capped) {
        if (!row || typeof row !== 'object') continue;
        const position = parseInt(row.p, 10);
        const name = row.n != null ? String(row.n).trim() : '';
        const country = row.c != null ? String(row.c).trim() : '';
        const guild = !!row.g;

        if (!position || !name || !country) continue;
        if (position < lo || position > hi) continue;

        if (skipAlly && guild) {
            skips.push({ n: name, r: 'ally' });
            continue;
        }

        if (useIgnore && ignoreList.includes(name)) {
            skips.push({ n: name, r: 'ignore' });
            continue;
        }

        if (countryLimit) {
            const status = countrySettings[country] || 'send';
            if (status !== 'send') {
                skips.push({ n: name, r: 'country', c: country });
                continue;
            }
        }

        if (seen.has(name)) continue;
        seen.add(name);
        recipients.push(name);
        if (recipients.length >= 500) break;
    }

    return { recipients, skips };
}

module.exports = {
    resolveMessagerTargets,
};
