const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getOne, run, transaction } = require('../database/connection');
const { createSession, createPasswordHash, hashPassword, authRequired } = require('../middleware/auth');
const { DEFAULT_CONFIG } = require('../database/init');

const router = express.Router();

router.post('/register', async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      const err = new Error('用户名和密码不能为空');
      err.type = 'validation';
      throw err;
    }
    if (password.length < 6) {
      const err = new Error('密码至少需要 6 位');
      err.type = 'validation';
      throw err;
    }

    const existing = await getOne('SELECT user_id FROM users WHERE username = $1', [username]);
    if (existing) {
      const err = new Error('用户名已存在');
      err.type = 'conflict';
      throw err;
    }

    const userId = uuidv4();
    const { salt, hash } = createPasswordHash(password);
    await transaction(async (tx) => {
      await tx.run(
        `INSERT INTO users (user_id, username, password_hash, salt, role, display_name)
         VALUES ($1, $2, $3, $4, 'user', $5)`,
        [userId, username, hash, salt, username]
      );
      for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
        await tx.run(
          `INSERT INTO user_config (user_id, key, value) VALUES ($1, $2, $3)`,
          [userId, key, value]
        );
      }
    });

    const token = await createSession(userId);
    res.json({ success: true, data: { token, user: { user_id: userId, username, role: 'user', display_name: username } }, error: null });
  } catch (e) {
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const user = await getOne('SELECT * FROM users WHERE username = $1', [username]);
    if (!user || !user.password_hash || hashPassword(password, user.salt) !== user.password_hash) {
      const err = new Error('用户名或密码错误');
      err.type = 'unauthorized';
      throw err;
    }
    const token = await createSession(user.user_id);
    res.json({
      success: true,
      data: {
        token,
        user: { user_id: user.user_id, username: user.username, role: user.role || 'user', display_name: user.display_name },
      },
      error: null,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/me', authRequired, (req, res) => {
  res.json({ success: true, data: { user: req.user }, error: null });
});

router.post('/logout', authRequired, async (req, res, next) => {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) await run('DELETE FROM sessions WHERE token = $1', [token]);
    res.json({ success: true, data: { loggedOut: true }, error: null });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
