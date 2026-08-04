/**
 * Resolução de filtros do Messager (server-side).
 * Campos do pool: p=position, n=name, c=country, g=guild(ally).
 * cfg: lo/hi=intervalo, a=skipAlly, i=useIgnoreList, ig=[], cl=countryLimit, cs={}
 */

function normalizeBool(v) {
    return v === true || v === 'true' || v === 1 || v === '1';
}

/** Extrai código de país de 2 letras a partir de classes tipo "br", "flag-br", "fi-br". */
function normalizeCountryCode(raw) {
    if (raw == null) return '';
    const s = String(raw).trim().toLowerCase();
    if (!s) return '';
    if (/^[a-z]{2}$/.test(s)) return s;
    const m = s.match(/(?:^|[^a-z])([a-z]{2})$/);
    return m ? m[1] : s;
}

function resolveMessagerTargets(pool, cfg = {}) {
    const lo = Math.max(1, parseInt(cfg.lo, 10) || 1);
    const hi = Math.min(2000, parseInt(cfg.hi, 10) || 510);
    const skipAlly = normalizeBool(cfg.a);
    const useIgnore = normalizeBool(cfg.i);
    const ignoreList = Array.isArray(cfg.ig)
        ? cfg.ig.map((x) => String(x).trim()).filter(Boolean)
        : [];
    const ignoreSet = new Set(ignoreList.map((x) => x.toLowerCase()));
    const countryLimit = normalizeBool(cfg.cl);
    const countrySettingsRaw = cfg.cs && typeof cfg.cs === 'object' ? cfg.cs : {};
    const countrySettings = {};
    for (const [k, v] of Object.entries(countrySettingsRaw)) {
        countrySettings[normalizeCountryCode(k)] = v;
    }

    const recipients = [];
    const skips = [];
    const seen = new Set();
    let droppedInvalid = 0;
    let droppedRank = 0;

    if (!Array.isArray(pool)) {
        return {
            recipients,
            skips,
            stats: { pool: 0, kept: 0, droppedInvalid: 0, droppedRank: 0, skipAlly: 0, skipIgnore: 0, skipCountry: 0 },
        };
    }

    const capped = pool.slice(0, 600);
    let skipAllyN = 0;
    let skipIgnoreN = 0;
    let skipCountryN = 0;

    for (const row of capped) {
        if (!row || typeof row !== 'object') {
            droppedInvalid += 1;
            continue;
        }
        const position = parseInt(row.p, 10);
        const name = row.n != null ? String(row.n).trim() : '';
        const country = normalizeCountryCode(row.c);
        const guild = normalizeBool(row.g);

        // País só é obrigatório quando o filtro de país está ativo
        if (!position || !name || (countryLimit && !country)) {
            droppedInvalid += 1;
            continue;
        }
        if (position < lo || position > hi) {
            droppedRank += 1;
            continue;
        }

        if (skipAlly && guild) {
            skips.push({ n: name, r: 'ally' });
            skipAllyN += 1;
            continue;
        }

        if (useIgnore && ignoreSet.has(name.toLowerCase())) {
            skips.push({ n: name, r: 'ignore' });
            skipIgnoreN += 1;
            continue;
        }

        if (countryLimit) {
            const status = countrySettings[country] || 'send';
            if (status !== 'send') {
                skips.push({ n: name, r: 'country', c: country });
                skipCountryN += 1;
                continue;
            }
        }

        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        recipients.push(name);
        if (recipients.length >= 500) break;
    }

    return {
        recipients,
        skips,
        stats: {
            pool: capped.length,
            kept: recipients.length,
            droppedInvalid,
            droppedRank,
            skipAlly: skipAllyN,
            skipIgnore: skipIgnoreN,
            skipCountry: skipCountryN,
            lo,
            hi,
            filters: { skipAlly, useIgnore, countryLimit },
        },
    };
}

module.exports = {
    resolveMessagerTargets,
    normalizeCountryCode,
};
