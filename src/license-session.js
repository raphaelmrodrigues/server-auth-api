const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/** Versão atual para clientes novos (extensão >= LICENSE_V3_MIN_BOT_VERSION). */
const SESSION_VERSION = 3;
const LEGACY_SESSION_VERSION = 2;
const MIN_ACCEPTED_SESSION_VERSION = 2;

/** Sessão JWT curta (v3) — licença real continua em lexp. */
const SESSION_TTL = process.env.LICENSE_SESSION_TTL || '4h';
/** TTL legado (v2) — compatível com extensões antigas na Chrome Store. */
const SESSION_TTL_LEGACY = process.env.LICENSE_SESSION_TTL_LEGACY || '2d';
const V3_MIN_BOT_VERSION = process.env.LICENSE_V3_MIN_BOT_VERSION || '3.0.5';

function parseSemver(version) {
    if (!version || typeof version !== 'string') return null;
    const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function semverGte(version, minimum) {
    const current = parseSemver(version);
    const floor = parseSemver(minimum);
    if (!current) return false;
    if (!floor) return true;
    for (let i = 0; i < 3; i += 1) {
        if (current[i] > floor[i]) return true;
        if (current[i] < floor[i]) return false;
    }
    return true;
}

function decodeSessionVersion(token) {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.pid || !decoded.lexp) return null;
    const version = Number(decoded.v) || LEGACY_SESSION_VERSION;
    return version >= MIN_ACCEPTED_SESSION_VERSION && version <= SESSION_VERSION ? version : null;
}

/**
 * Decide qual versão de sessão emitir durante o rollout da extensão 3.0.5.
 * - Clientes antigos (sem botVersion ou < 3.0.5): v2
 * - Clientes 3.0.5+ ou que já usam token v3: v3
 */
function resolveIssueSessionVersion(options = {}) {
    const { botVersion, existingToken, hasMark } = options;

    if (botVersion && semverGte(botVersion, V3_MIN_BOT_VERSION)) {
        return SESSION_VERSION;
    }
    if (hasMark) {
        return SESSION_VERSION;
    }
    if (existingToken) {
        const existingVersion = decodeSessionVersion(existingToken);
        if (existingVersion >= SESSION_VERSION) {
            return SESSION_VERSION;
        }
    }
    return LEGACY_SESSION_VERSION;
}

function issueLicenseSessionV2(jwtSecret, playerId, expireDate) {
    const lexp = new Date(expireDate).getTime();
    const pid = String(playerId);
    const token = jwt.sign(
        { pid, lexp, v: LEGACY_SESSION_VERSION },
        jwtSecret,
        { expiresIn: SESSION_TTL_LEGACY }
    );
    const qs = crypto.createHmac('sha256', jwtSecret)
        .update(`${pid}|${lexp}`)
        .digest('hex');
    return { token, qs, k: null, p: new Date(expireDate), sessionVersion: LEGACY_SESSION_VERSION };
}

function issueLicenseSessionV3(jwtSecret, playerId, expireDate) {
    const lexp = new Date(expireDate).getTime();
    const pid = String(playerId);
    const j = crypto.randomBytes(12).toString('hex');
    const token = jwt.sign(
        { pid, lexp, v: SESSION_VERSION, j },
        jwtSecret,
        { expiresIn: SESSION_TTL }
    );
    const qs = crypto.createHmac('sha256', jwtSecret)
        .update(`${pid}|${lexp}|${SESSION_VERSION}`)
        .digest('hex');
    const k = crypto.createHmac('sha256', jwtSecret)
        .update(`${j}|${pid}|${lexp}`)
        .digest('hex')
        .slice(0, 20);
    return { token, qs, k, p: new Date(expireDate), sessionVersion: SESSION_VERSION };
}

function issueLicenseSession(jwtSecret, playerId, expireDate, options = {}) {
    const version = resolveIssueSessionVersion(options);
    if (version >= SESSION_VERSION) {
        return issueLicenseSessionV3(jwtSecret, playerId, expireDate);
    }
    return issueLicenseSessionV2(jwtSecret, playerId, expireDate);
}

function verifyLicenseSession(jwtSecret, token, playerId) {
    const decoded = jwt.verify(token, jwtSecret);
    if (String(decoded.pid) !== String(playerId)) {
        throw new Error('pid mismatch');
    }
    if (!decoded.lexp) {
        throw new Error('invalid session version');
    }

    const version = Number(decoded.v) || LEGACY_SESSION_VERSION;
    if (version < MIN_ACCEPTED_SESSION_VERSION || version > SESSION_VERSION) {
        throw new Error('invalid session version');
    }
    if (version >= SESSION_VERSION) {
        if (!decoded.j || String(decoded.j).length < 16) {
            throw new Error('invalid session mark');
        }
    }
    return decoded;
}

async function assertLicenseActive(License, playerId) {
    const licenseData = await License.findOne({ playerid: String(playerId) });
    if (!licenseData) return null;
    if (new Date() > new Date(licenseData.expireDate)) return null;
    return licenseData;
}

function verifySessionSignature(jwtSecret, token, qs) {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.pid || !decoded.lexp) return false;
    const ver = Number(decoded.v) || LEGACY_SESSION_VERSION;
    const payload = ver >= SESSION_VERSION
        ? `${String(decoded.pid)}|${decoded.lexp}|${ver}`
        : `${String(decoded.pid)}|${decoded.lexp}`;
    const expected = crypto.createHmac('sha256', jwtSecret)
        .update(payload)
        .digest('hex');
    return expected === qs;
}

function verifySessionMark(jwtSecret, token, mark) {
    const decoded = jwt.decode(token);
    const ver = Number(decoded?.v) || LEGACY_SESSION_VERSION;
    if (!decoded || ver < SESSION_VERSION || !decoded.j || !mark) return false;
    const expected = crypto.createHmac('sha256', jwtSecret)
        .update(`${decoded.j}|${String(decoded.pid)}|${decoded.lexp}`)
        .digest('hex')
        .slice(0, 20);
    return expected === String(mark);
}

function buildSessionIssueOptions(body = {}) {
    return {
        botVersion: body.botVersion,
        existingToken: body.tk || body.tkz_lcr,
        hasMark: !!(body.k || body.mark),
    };
}

module.exports = {
    issueLicenseSession,
    verifyLicenseSession,
    assertLicenseActive,
    verifySessionSignature,
    verifySessionMark,
    buildSessionIssueOptions,
    resolveIssueSessionVersion,
    SESSION_VERSION,
    LEGACY_SESSION_VERSION,
    MIN_ACCEPTED_SESSION_VERSION,
    SESSION_TTL,
    SESSION_TTL_LEGACY,
    V3_MIN_BOT_VERSION,
};
