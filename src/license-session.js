const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const SESSION_VERSION = 2;
const SESSION_TTL = process.env.LICENSE_SESSION_TTL || '6h';

function issueLicenseSession(jwtSecret, playerId, expireDate) {
    const lexp = new Date(expireDate).getTime();
    const pid = String(playerId);
    const token = jwt.sign(
        { pid, lexp, v: SESSION_VERSION },
        jwtSecret,
        { expiresIn: SESSION_TTL }
    );
    const qs = crypto.createHmac('sha256', jwtSecret)
        .update(`${pid}|${lexp}`)
        .digest('hex');
    return { token, qs, p: new Date(expireDate) };
}

function verifyLicenseSession(jwtSecret, token, playerId) {
    const decoded = jwt.verify(token, jwtSecret);
    if (String(decoded.pid) !== String(playerId)) {
        throw new Error('pid mismatch');
    }
    if (!decoded.lexp || decoded.v !== SESSION_VERSION) {
        throw new Error('invalid session version');
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
    const expected = crypto.createHmac('sha256', jwtSecret)
        .update(`${String(decoded.pid)}|${decoded.lexp}`)
        .digest('hex');
    return expected === qs;
}

module.exports = {
    issueLicenseSession,
    verifyLicenseSession,
    assertLicenseActive,
    verifySessionSignature,
    SESSION_VERSION,
};
