const crypto = require('crypto');

const ITCH_LICENSE_PREFIX = 'ITCH';

const ITCH_PLANS = {
    '15DAYS': { duration: 15, title: 'GLDbot - 15 dias' },
    '30DAYS': { duration: 30, title: 'GLDbot - 30 dias' },
    '60DAYS': { duration: 60, title: 'GLDbot - 60 dias' },
};

function randomSegment(length) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i += 1) {
        out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
}

function generateItchLicenseKey() {
    return [
        ITCH_LICENSE_PREFIX,
        randomSegment(7),
        randomSegment(5),
        randomSegment(8),
        randomSegment(9),
    ].join('-');
}

function isItchLicenseKey(licenseKey) {
    return typeof licenseKey === 'string'
        && licenseKey.toUpperCase().startsWith(`${ITCH_LICENSE_PREFIX}-`);
}

function isItchLicenseRecord(license) {
    if (!license) return false;
    return license.payment_method === 'itch' || isItchLicenseKey(license.licenseKey);
}

function getItchPlanByCode(planCode) {
    return ITCH_PLANS[planCode] || null;
}

function getItchDurationFromPlan(planTitle) {
    if (!planTitle) return null;
    const normalized = String(planTitle).toLowerCase();
    if (normalized.includes('60')) return 60;
    if (normalized.includes('30')) return 30;
    if (normalized.includes('15')) return 15;
    return null;
}

function itchLicenseNeedsActivation(license) {
    if (!isItchLicenseRecord(license)) return false;
    if (!license.expireDate) return true;
    const parsed = new Date(license.expireDate);
    return Number.isNaN(parsed.getTime());
}

function applyItchActivationDates(license) {
    if (!isItchLicenseRecord(license)) return license;
    if (!itchLicenseNeedsActivation(license)) return license;

    const duration = getItchDurationFromPlan(license.plan);
    if (!duration) {
        throw new Error(`Plano itch inválido: ${license.plan}`);
    }

    const expireDate = new Date();
    expireDate.setDate(expireDate.getDate() + duration);
    license.expireDate = expireDate;
    return license;
}

function buildItchLicenseDocument(planCode) {
    const plan = getItchPlanByCode(planCode);
    if (!plan) {
        throw new Error(`Plano itch inválido: ${planCode}`);
    }

    return {
        playerid: '',
        licenseKey: generateItchLicenseKey(),
        plan: plan.title,
        expireDate: null,
        trial: false,
        email: '',
        country: '',
        payment_method: 'itch',
    };
}

function licensesToItchCsv(licenses) {
    return licenses.map((lic) => lic.licenseKey).join('\n');
}

module.exports = {
    ITCH_LICENSE_PREFIX,
    ITCH_PLANS,
    generateItchLicenseKey,
    isItchLicenseKey,
    isItchLicenseRecord,
    getItchPlanByCode,
    getItchDurationFromPlan,
    itchLicenseNeedsActivation,
    applyItchActivationDates,
    buildItchLicenseDocument,
    licensesToItchCsv,
};
