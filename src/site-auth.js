const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;
const lastRegisterAt = new Map();
const REGISTER_COOLDOWN_MS = 10 * 60 * 1000;

const siteUserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 24, index: true },
    displayName: { type: String, trim: true, maxlength: 32 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'banned'], default: 'active' },
    forumBlocked: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    locale: { type: String, default: null },
    country: { type: String, default: null },
    timezone: { type: String, default: null },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
    lastLoginCountry: { type: String, default: null },
    lastUserAgent: { type: String, default: null },
    acceptedTermsAt: { type: Date, default: null },
    marketingOptIn: { type: Boolean, default: false },
    source: { type: String, default: 'website' },
    licenseKey: { type: String, default: null },
    playerId: { type: String, default: null },
    notes: { type: String, default: null },
    resetToken: { type: String, default: null },
    resetTokenExpiration: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

siteUserSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

const SiteUser = mongoose.models.SiteUser || mongoose.model('SiteUser', siteUserSchema);

function clientIp(req) {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
    return req.socket?.remoteAddress || req.ip || null;
}

function bearerToken(req) {
    const header = String(req.headers.authorization || '');
    if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
    return null;
}

function publicSiteUser(user, extra = {}) {
    return {
        id: String(user._id || user.id),
        username: user.username,
        displayName: user.displayName || user.username,
        email: user.email || '',
        isAdmin: !!user.isAdmin,
        forumBlocked: !!user.forumBlocked,
        ...extra,
    };
}

function signSiteToken(JWT_SECRET, payload) {
    return jwt.sign({ kind: 'site', ...payload }, JWT_SECRET, { expiresIn: '7d' });
}

function verifySiteToken(JWT_SECRET, token) {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.kind !== 'site') throw new Error('not a site token');
    return payload;
}

async function resolveSiteUser(req, JWT_SECRET) {
    const token = bearerToken(req);
    if (!token) return null;
    try {
        const payload = verifySiteToken(JWT_SECRET, token);
        if (payload.source === 'license-admin' && payload.isAdmin) {
            return {
                id: payload.id,
                username: payload.username,
                displayName: 'Gladius Bot',
                email: payload.email || '',
                isAdmin: true,
                forumBlocked: false,
                source: 'license-admin',
            };
        }
        const user = await SiteUser.findById(payload.id);
        if (!user || user.status === 'banned') return null;
        return publicSiteUser(user);
    } catch {
        return null;
    }
}

function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizeUsername(value) {
    return String(value || '').trim();
}

function registerSiteAuthRoutes(app, deps) {
    const {
        License,
        JWT_SECRET,
        sgMail,
        authenticateAdminToken,
        PURCHASE_FROM,
        PURCHASE_REPLY_TO,
        buildPasswordResetEmailHtml,
        buildPasswordResetEmailText,
        buildSiteWelcomeEmailHtml,
        buildSiteWelcomeEmailText,
        getPurchaseEmailAttachments,
        isValidEmail: emailOk,
        normalizeEmail,
    } = deps;

    const validEmail = emailOk || isValidEmail;
    const normEmail = normalizeEmail || ((e) => String(e || '').trim().toLowerCase());

    async function usernameTaken(username) {
        const key = username.toLowerCase();
        const site = await SiteUser.findOne({ username: key });
        if (site) return true;
        const lic = await License.findOne({ user: username });
        if (lic) return true;
        const licLower = await License.findOne({ user: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
        return !!licLower;
    }

    app.get('/api/site/me', async (req, res) => {
        const me = await resolveSiteUser(req, JWT_SECRET);
        if (!me) return res.status(401).json({ success: false, message: 'Not logged in.' });
        return res.json({ success: true, user: me });
    });

    app.post('/api/site/register', async (req, res) => {
        try {
            if (String(req.body?.website || '').trim()) {
                return res.json({ success: true, skipped: true });
            }
            const username = normalizeUsername(req.body?.username);
            const password = String(req.body?.password || '');
            const email = normEmail(req.body?.email);
            const displayName = String(req.body?.displayName || username).trim().slice(0, 32);
            const country = String(req.body?.country || '').trim().slice(0, 64) || null;
            const marketingOptIn = !!req.body?.marketingOptIn;

            if (!USERNAME_RE.test(username)) {
                return res.status(400).json({ success: false, message: 'Username must be 3–24 letters, numbers or underscore.' });
            }
            if (!validEmail(email)) {
                return res.status(400).json({ success: false, message: 'Enter a valid email.' });
            }
            if (password.length < 6 || password.length > 128) {
                return res.status(400).json({ success: false, message: 'Password must be 6–128 characters.' });
            }

            const ip = clientIp(req) || 'unknown';
            const last = lastRegisterAt.get(ip) || 0;
            if (Date.now() - last < REGISTER_COOLDOWN_MS) {
                return res.status(429).json({ success: false, message: 'Please wait a few minutes before creating another account.' });
            }

            if (await usernameTaken(username)) {
                return res.status(200).json({ success: false, message: 'Username already taken.' });
            }
            const emailUsed = await SiteUser.findOne({ email });
            if (emailUsed) {
                return res.status(200).json({ success: false, message: 'Email already registered.' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const user = await SiteUser.create({
                username: username.toLowerCase(),
                displayName: displayName || username,
                email,
                password: hashedPassword,
                isAdmin: false,
                status: 'active',
                emailVerified: false,
                locale: String(req.headers['accept-language'] || '').slice(0, 32) || null,
                country,
                timezone: String(req.body?.timezone || '').trim().slice(0, 64) || null,
                lastLoginAt: new Date(),
                lastLoginIp: ip,
                lastLoginCountry: String(req.headers['cf-ipcountry'] || '').slice(0, 8) || null,
                lastUserAgent: String(req.headers['user-agent'] || '').slice(0, 240) || null,
                acceptedTermsAt: new Date(),
                marketingOptIn,
                source: 'website',
            });
            lastRegisterAt.set(ip, Date.now());

            const token = signSiteToken(JWT_SECRET, {
                id: String(user._id),
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                isAdmin: false,
                source: 'site',
            });

            try {
                await sgMail.send({
                    to: email,
                    from: PURCHASE_FROM,
                    replyTo: PURCHASE_REPLY_TO,
                    subject: 'GladiusBot — Welcome',
                    text: buildSiteWelcomeEmailText({ userName: user.displayName || user.username }),
                    html: buildSiteWelcomeEmailHtml({ userName: user.displayName || user.username }),
                    attachments: getPurchaseEmailAttachments(),
                });
            } catch (mailErr) {
                console.error('site welcome email:', mailErr?.response?.body || mailErr);
            }

            return res.status(201).json({
                success: true,
                message: 'Account created. Check your email.',
                token,
                user: publicSiteUser(user),
            });
        } catch (error) {
            if (error && error.code === 11000) {
                return res.status(200).json({ success: false, message: 'Username or email already registered.' });
            }
            console.error('site register:', error);
            return res.status(500).json({ success: false, message: 'Could not create the account.' });
        }
    });

    app.post('/api/site/login', async (req, res) => {
        try {
            const lookup = normalizeUsername(req.body?.username || req.body?.user || req.body?.email);
            const password = String(req.body?.password || '');
            if (!lookup || !password) {
                return res.status(400).json({ success: false, message: 'Username or email and password are required.' });
            }

            const siteUser = lookup.includes('@')
                ? await SiteUser.findOne({ email: normEmail(lookup) })
                : await SiteUser.findOne({ username: lookup.toLowerCase() });
            if (siteUser) {
                if (siteUser.status === 'banned') {
                    return res.status(403).json({ success: false, message: 'This account is disabled.' });
                }
                const ok = await bcrypt.compare(password, siteUser.password);
                if (!ok) return res.status(400).json({ success: false, message: 'Invalid username, email or password.' });

                siteUser.lastLoginAt = new Date();
                siteUser.lastLoginIp = clientIp(req);
                siteUser.lastLoginCountry = String(req.headers['cf-ipcountry'] || '').slice(0, 8) || null;
                siteUser.lastUserAgent = String(req.headers['user-agent'] || '').slice(0, 240) || null;
                await siteUser.save();

                const token = signSiteToken(JWT_SECRET, {
                    id: String(siteUser._id),
                    username: siteUser.username,
                    displayName: siteUser.displayName,
                    email: siteUser.email,
                    isAdmin: !!siteUser.isAdmin,
                    source: 'site',
                });
                return res.json({ success: true, token, user: publicSiteUser(siteUser) });
            }

            const escapedUser = lookup.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            let adminUser = lookup.includes('@')
                ? await License.findOne({ email: normEmail(lookup), isAdmin: true })
                : await License.findOne({ user: lookup, isAdmin: true });
            if (!adminUser && !lookup.includes('@')) {
                adminUser = await License.findOne({ user: new RegExp(`^${escapedUser}$`, 'i'), isAdmin: true });
            }
            if (!adminUser || !adminUser.password) {
                return res.status(400).json({ success: false, message: 'Invalid username, email or password.' });
            }
            const adminOk = await bcrypt.compare(password, adminUser.password);
            if (!adminOk) {
                return res.status(400).json({ success: false, message: 'Invalid username, email or password.' });
            }

            const token = signSiteToken(JWT_SECRET, {
                id: String(adminUser._id),
                username: adminUser.user,
                displayName: 'Gladius Bot',
                email: adminUser.email || '',
                isAdmin: true,
                source: 'license-admin',
            });
            return res.json({
                success: true,
                token,
                user: {
                    id: String(adminUser._id),
                    username: adminUser.user,
                    displayName: 'Gladius Bot',
                    email: adminUser.email || '',
                    isAdmin: true,
                },
            });
        } catch (error) {
            console.error('site login:', error);
            return res.status(500).json({ success: false, message: 'Login failed.' });
        }
    });

    app.post('/api/site/forgot-password', async (req, res) => {
        const okPayload = {
            success: true,
            message: 'If that account exists, a reset link was sent to the registered email.',
        };
        try {
            const lookup = String(req.body?.username || req.body?.user || req.body?.email || '').trim();
            if (!lookup) return res.status(400).json({ success: false, message: 'Username or email is required.' });

            const query = lookup.includes('@')
                ? { email: normEmail(lookup) }
                : { username: lookup.toLowerCase() };
            const user = await SiteUser.findOne(query);
            if (!user || !user.email) return res.json(okPayload);

            const RESET_TTL_MS = 60 * 60 * 1000;
            user.resetToken = crypto.randomBytes(32).toString('hex');
            user.resetTokenExpiration = new Date(Date.now() + RESET_TTL_MS);
            await user.save();

            const resetLink = `https://gldbotserver.com/reset_password.html?token=${user.resetToken}&src=site`;
            await sgMail.send({
                to: user.email,
                from: PURCHASE_FROM,
                replyTo: PURCHASE_REPLY_TO,
                subject: 'GladiusBot — Password reset',
                text: buildPasswordResetEmailText({
                    userName: user.displayName || user.username,
                    resetLink,
                    expiresInMinutes: 60,
                    productLabel: 'website',
                }),
                html: buildPasswordResetEmailHtml({
                    userName: user.displayName || user.username,
                    resetLink,
                    expiresInMinutes: 60,
                    productLabel: 'website',
                }),
                attachments: getPurchaseEmailAttachments(),
            });
            return res.json(okPayload);
        } catch (error) {
            console.error('site forgot:', error);
            return res.status(500).json({ success: false, message: 'Could not process the request.' });
        }
    });

    app.get('/admin/site-users', authenticateAdminToken, async (req, res) => {
        try {
            const q = String(req.query.q || '').trim().toLowerCase();
            const filter = {};
            if (q) {
                filter.$or = [
                    { username: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                    { email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                    { displayName: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                ];
            }
            const users = await SiteUser.find(filter)
                .select('-password -resetToken -likeKeys')
                .sort({ createdAt: -1 })
                .limit(300)
                .lean();
            return res.json({
                success: true,
                total: users.length,
                users: users.map((u) => ({
                    id: String(u._id),
                    username: u.username,
                    displayName: u.displayName,
                    email: u.email,
                    status: u.status,
                    forumBlocked: !!u.forumBlocked,
                    emailVerified: !!u.emailVerified,
                    country: u.country,
                    locale: u.locale,
                    timezone: u.timezone,
                    lastLoginAt: u.lastLoginAt,
                    lastLoginIp: u.lastLoginIp,
                    lastLoginCountry: u.lastLoginCountry,
                    licenseKey: u.licenseKey,
                    playerId: u.playerId,
                    source: u.source,
                    marketingOptIn: !!u.marketingOptIn,
                    createdAt: u.createdAt,
                })),
            });
        } catch (error) {
            console.error('admin site-users:', error);
            return res.status(500).json({ success: false, message: 'Could not load site users.' });
        }
    });
}

module.exports = {
    SiteUser,
    registerSiteAuthRoutes,
    resolveSiteUser,
    bearerToken,
};
