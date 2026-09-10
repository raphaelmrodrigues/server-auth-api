const crypto = require('crypto');
const mongoose = require('mongoose');

const NAME_MAX = 32;
const MESSAGE_MIN = 1;
const MESSAGE_MAX = 800;
const POST_COOLDOWN_MS = 45 * 1000;
const LIKE_COOLDOWN_MS = 1500;
const LIST_LIMIT = 80;
const ADMIN_DISPLAY_NAME = 'Gladius Bot';

const lastPostAt = new Map();
const lastLikeAt = new Map();

const forumCommentSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: NAME_MAX },
    message: { type: String, required: true, trim: true, maxlength: MESSAGE_MAX },
    userId: { type: String, default: null, index: true },
    username: { type: String, default: null },
    isAdmin: { type: Boolean, default: false },
    parentId: { type: String, default: null, index: true },
    likes: { type: Number, default: 0, min: 0 },
    likeKeys: { type: [String], default: [] },
    hidden: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

forumCommentSchema.index({ createdAt: -1, hidden: 1 });

const ForumComment = mongoose.models.ForumComment
    || mongoose.model('ForumComment', forumCommentSchema);

function clientIp(req) {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
    return req.socket?.remoteAddress || req.ip || '0.0.0.0';
}

function fingerprint(req) {
    const secret = process.env.JWT_SECRET || 'gldbot-forum';
    return crypto.createHash('sha256').update(`${clientIp(req)}|${secret}`).digest('hex').slice(0, 40);
}

function likeKeyFor(me) {
    if (!me || !me.id) return '';
    return `u:${me.id}`;
}

function pruneMap(map, maxAgeMs) {
    const now = Date.now();
    for (const [key, ts] of map) {
        if (now - ts > maxAgeMs) map.delete(key);
    }
}

function cleanMessage(value) {
    return String(value || '')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\r\n/g, '\n')
        .trim()
        .slice(0, MESSAGE_MAX);
}

function publicComment(doc, likeKey) {
    const likeKeys = Array.isArray(doc.likeKeys) ? doc.likeKeys : [];
    const isAdmin = !!doc.isAdmin;
    return {
        id: String(doc._id),
        name: isAdmin ? ADMIN_DISPLAY_NAME : doc.name,
        username: doc.username || null,
        userId: doc.userId || null,
        isAdmin,
        parentId: doc.parentId || null,
        message: doc.message,
        likes: likeKeys.length,
        liked: !!(likeKey && likeKeys.includes(likeKey)),
        createdAt: doc.createdAt,
    };
}

function registerForumRoutes(app, deps = {}) {
    const resolveSiteUser = deps.resolveSiteUser || (async () => null);
    const SiteUser = deps.SiteUser || null;

    async function assertCanPost(me) {
        if (!me) {
            return { ok: false, status: 401, body: { success: false, message: 'Log in to post a comment.', needLogin: true } };
        }
        if (me.forumBlocked && !me.isAdmin) {
            return { ok: false, status: 403, body: { success: false, message: 'Your account cannot comment on the forum.' } };
        }
        return { ok: true };
    }

    app.get('/api/forum/comments', async (req, res) => {
        try {
            const me = await resolveSiteUser(req);
            const likeKey = likeKeyFor(me);
            const parents = await ForumComment.find({
                hidden: { $ne: true },
                $or: [{ parentId: null }, { parentId: '' }],
            })
                .sort({ createdAt: -1 })
                .limit(LIST_LIMIT)
                .lean();

            const parentIds = parents.map((row) => String(row._id));
            const replies = parentIds.length
                ? await ForumComment.find({
                    hidden: { $ne: true },
                    parentId: { $in: parentIds },
                })
                    .sort({ createdAt: 1 })
                    .lean()
                : [];

            const byParent = {};
            replies.forEach((row) => {
                const key = String(row.parentId);
                if (!byParent[key]) byParent[key] = [];
                byParent[key].push(publicComment(row, likeKey));
            });

            return res.json({
                success: true,
                comments: parents.map((row) => ({
                    ...publicComment(row, likeKey),
                    replies: byParent[String(row._id)] || [],
                })),
            });
        } catch (error) {
            console.error('forum list:', error);
            return res.status(500).json({ success: false, message: 'Could not load comments.' });
        }
    });

    app.post('/api/forum/comments', async (req, res) => {
        try {
            if (String(req.body?.website || '').trim()) {
                return res.json({ success: true, skipped: true });
            }

            const me = await resolveSiteUser(req);
            const gate = await assertCanPost(me);
            if (!gate.ok) return res.status(gate.status).json(gate.body);

            const message = cleanMessage(req.body?.message);
            if (message.length < MESSAGE_MIN) {
                return res.status(400).json({ success: false, message: 'Write a comment before posting.' });
            }

            let parentId = String(req.body?.parentId || '').trim() || null;
            if (parentId) {
                if (!mongoose.Types.ObjectId.isValid(parentId)) {
                    return res.status(400).json({ success: false, message: 'Invalid comment.' });
                }
                const parent = await ForumComment.findOne({ _id: parentId, hidden: { $ne: true } });
                if (!parent) return res.status(404).json({ success: false, message: 'Comment not found.' });
                if (parent.parentId) parentId = String(parent.parentId);
            }

            const fp = fingerprint(req);
            pruneMap(lastPostAt, POST_COOLDOWN_MS * 4);
            const previous = lastPostAt.get(fp) || 0;
            const waitMs = POST_COOLDOWN_MS - (Date.now() - previous);
            if (waitMs > 0) {
                return res.status(429).json({
                    success: false,
                    message: `Please wait ${Math.ceil(waitMs / 1000)}s before posting again.`,
                });
            }

            const name = String(
                me.isAdmin ? ADMIN_DISPLAY_NAME : (me.displayName || me.username || 'Player')
            ).slice(0, NAME_MAX);
            const doc = await ForumComment.create({
                name,
                message,
                userId: String(me.id),
                username: me.username || null,
                isAdmin: !!me.isAdmin,
                parentId,
            });
            lastPostAt.set(fp, Date.now());
            return res.status(201).json({ success: true, comment: publicComment(doc, likeKeyFor(me)) });
        } catch (error) {
            console.error('forum post:', error);
            return res.status(500).json({ success: false, message: 'Could not publish your comment.' });
        }
    });

    app.post('/api/forum/comments/:id/like', async (req, res) => {
        try {
            const me = await resolveSiteUser(req);
            if (!me) {
                return res.status(401).json({
                    success: false,
                    message: 'Log in to like a comment.',
                    needLogin: true,
                });
            }

            const id = String(req.params.id || '');
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({ success: false, message: 'Invalid comment.' });
            }

            const likeKey = likeKeyFor(me);
            pruneMap(lastLikeAt, 60 * 1000);
            const previous = lastLikeAt.get(`${likeKey}:${id}`) || 0;
            if (Date.now() - previous < LIKE_COOLDOWN_MS) {
                return res.status(429).json({ success: false, message: 'Slow down a little.' });
            }
            lastLikeAt.set(`${likeKey}:${id}`, Date.now());

            const current = await ForumComment.findOne({ _id: id, hidden: { $ne: true } }).select('likeKeys').lean();
            if (!current) return res.status(404).json({ success: false, message: 'Comment not found.' });

            const already = (current.likeKeys || []).includes(likeKey);
            const doc = already
                ? await ForumComment.findOneAndUpdate(
                    { _id: id, hidden: { $ne: true }, likeKeys: likeKey },
                    { $pull: { likeKeys: likeKey } },
                    { new: true }
                )
                : await ForumComment.findOneAndUpdate(
                    { _id: id, hidden: { $ne: true }, likeKeys: { $ne: likeKey } },
                    { $addToSet: { likeKeys: likeKey } },
                    { new: true }
                );

            if (!doc) {
                const fallback = await ForumComment.findOne({ _id: id, hidden: { $ne: true } });
                if (!fallback) return res.status(404).json({ success: false, message: 'Comment not found.' });
                return res.json({ success: true, comment: publicComment(fallback, likeKey) });
            }

            const likes = Array.isArray(doc.likeKeys) ? doc.likeKeys.length : 0;
            if (doc.likes !== likes) {
                doc.likes = likes;
                await doc.save();
            }
            return res.json({ success: true, comment: publicComment(doc, likeKey) });
        } catch (error) {
            console.error('forum like:', error);
            return res.status(500).json({ success: false, message: 'Could not update the like.' });
        }
    });

    app.post('/api/forum/comments/:id/delete', async (req, res) => {
        try {
            const me = await resolveSiteUser(req);
            if (!me) {
                return res.status(401).json({ success: false, message: 'Log in to delete a comment.', needLogin: true });
            }
            const id = String(req.params.id || '');
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({ success: false, message: 'Invalid comment.' });
            }
            const doc = await ForumComment.findById(id);
            if (!doc || doc.hidden) return res.status(404).json({ success: false, message: 'Comment not found.' });

            const isOwner = doc.userId && String(doc.userId) === String(me.id);
            if (!me.isAdmin && !isOwner) {
                return res.status(403).json({ success: false, message: 'You can only delete your own comments.' });
            }

            doc.hidden = true;
            await doc.save();
            if (!doc.parentId) {
                await ForumComment.updateMany({ parentId: String(doc._id) }, { $set: { hidden: true } });
            }
            return res.json({ success: true });
        } catch (error) {
            console.error('forum delete:', error);
            return res.status(500).json({ success: false, message: 'Could not delete the comment.' });
        }
    });

    app.post('/api/forum/users/:userId/block', async (req, res) => {
        try {
            const me = await resolveSiteUser(req);
            if (!me || !me.isAdmin) {
                return res.status(403).json({ success: false, message: 'Admin only.' });
            }
            if (!SiteUser) {
                return res.status(500).json({ success: false, message: 'Could not block the user.' });
            }
            const userId = String(req.params.userId || '');
            if (!mongoose.Types.ObjectId.isValid(userId)) {
                return res.status(400).json({ success: false, message: 'Invalid user.' });
            }
            if (String(userId) === String(me.id)) {
                return res.status(400).json({ success: false, message: 'You cannot block yourself.' });
            }
            const user = await SiteUser.findById(userId);
            if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
            if (user.isAdmin) {
                return res.status(400).json({ success: false, message: 'That account cannot be blocked.' });
            }
            user.forumBlocked = true;
            await user.save();
            return res.json({ success: true, message: `${user.username} can no longer comment.` });
        } catch (error) {
            console.error('forum block:', error);
            return res.status(500).json({ success: false, message: 'Could not block the user.' });
        }
    });
}

module.exports = {
    ForumComment,
    registerForumRoutes,
};
