const express = require('express');
const { getAll, run } = require('../database/connection');
const { STRANGENESS_LEVELS } = require('../constants/strangeness');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const rows = await getAll('SELECT key, value FROM user_config WHERE user_id = $1', [req.user.user_id]);
    const config = {};
    for (const row of rows) config[row.key] = row.value;
    res.json({ success: true, data: config, error: null });
  } catch (e) {
    next(e);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      const err = new Error('Request body must be an object');
      err.type = 'validation';
      throw err;
    }

    const allowedKeys = [
      'user_level', 'init_mode', 'color_blind_mode',
      'density_threshold', 'onboarding_completed',
      'oov_default_strangeness', 'color_scheme'
    ];
    const userWritableKeys = ['color_scheme', 'color_blind_mode'];

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedKeys.includes(key)) {
        const err = new Error(`Invalid config key: ${key}`);
        err.type = 'validation';
        throw err;
      }
      if (req.user?.role !== 'admin' && !userWritableKeys.includes(key)) {
        const err = new Error(`需要管理员权限修改配置项: ${key}`);
        err.type = 'forbidden';
        throw err;
      }
      if (key === 'oov_default_strangeness' && !STRANGENESS_LEVELS.includes(parseInt(value, 10))) {
        const err = new Error('oov_default_strangeness must be 1, 3, 5, or 7');
        err.type = 'validation';
        throw err;
      }
      await run(
        `INSERT INTO user_config (user_id, key, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
        [req.user.user_id, key, String(value)]
      );
    }

    const rows = await getAll('SELECT key, value FROM user_config WHERE user_id = $1', [req.user.user_id]);
    const config = {};
    for (const row of rows) config[row.key] = row.value;
    res.json({ success: true, data: config, error: null });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
