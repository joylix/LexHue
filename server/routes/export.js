/**
 * Export/Import Routes
 * GET  /api/export/json     - Export all user data as JSON
 * POST /api/import/json     - Import user data from JSON
 * GET  /api/export/csv      - Export vocabulary as CSV
 * GET  /api/backup/db       - Download userdata.db backup
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const config = require('../config');
const { exportJson, exportCsv, importJson, backupDb } = require('../services/exportService');

const upload = multer({ storage: multer.memoryStorage() });

// GET /api/export/json
router.get('/json', async (req, res, next) => {
  try {
    const data = await exportJson();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=LexHue_export_${Date.now()}.json`);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

// POST /api/import/json
router.post('/json', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      const err = new Error('No file uploaded');
      err.type = 'validation';
      throw err;
    }

    const importData = JSON.parse(req.file.buffer.toString('utf-8'));
    const result = await importJson(importData);

    res.json({ success: true, data: result, error: null });
  } catch (e) {
    if (e instanceof SyntaxError) {
      const err = new Error('Invalid JSON file');
      err.type = 'validation';
      next(err);
    } else {
      next(e);
    }
  }
});

// GET /api/export/csv
router.get('/csv', async (req, res, next) => {
  try {
    const csv = await exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=LexHue_vocab_${Date.now()}.csv`);
    // BOM for Excel compatibility
    res.send('\uFEFF' + csv);
  } catch (e) {
    next(e);
  }
});

// GET /api/backup/db
router.get('/db', (req, res, next) => {
  try {
    const backupPath = backupDb();
    res.download(backupPath, path.basename(backupPath), (err) => {
      if (err) next(err);
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
