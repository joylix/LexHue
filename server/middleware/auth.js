const crypto = require('crypto');
const { getOne, run, runWithUser } = require('../database/connection');

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: hashPassword(password, salt) };
}

async function authRequired(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      const err = new Error('请先登录');
      err.type = 'unauthorized';
      throw err;
    }

    const session = await getOne(
      `SELECT s.token, s.expires_at, u.user_id, u.username, u.display_name, u.role
       FROM sessions s
       JOIN users u ON u.user_id = s.user_id
       WHERE s.token = $1 AND s.expires_at > now()`,
      [token]
    );

    if (!session) {
      const err = new Error('登录已过期，请重新登录');
      err.type = 'unauthorized';
      throw err;
    }

    req.user = {
      user_id: session.user_id,
      username: session.username,
      display_name: session.display_name,
      role: session.role || 'user',
    };
    runWithUser(req.user, next);
  } catch (e) {
    next(e);
  }
}

async function optionalAuth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next();
    const session = await getOne(
      `SELECT u.user_id, u.username, u.display_name, u.role
       FROM sessions s
       JOIN users u ON u.user_id = s.user_id
       WHERE s.token = $1 AND s.expires_at > now()`,
      [token]
    );
    if (session) {
      req.user = session;
      return runWithUser(session, next);
    }
    next();
  } catch (e) {
    next(e);
  }
}

function adminRequired(req, res, next) {
  if (req.user?.role === 'admin') return next();
  const err = new Error('需要管理员权限');
  err.type = 'forbidden';
  next(err);
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await run(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES ($1, $2, now() + interval '30 days')`,
    [token, userId]
  );
  await run('UPDATE users SET last_login_at = now() WHERE user_id = $1', [userId]);
  return token;
}

module.exports = {
  authRequired,
  adminRequired,
  optionalAuth,
  createSession,
  createPasswordHash,
  hashPassword,
};
