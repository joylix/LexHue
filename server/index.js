const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { init } = require('./database/init');
const errorHandler = require('./middleware/errorHandler');
const { ensureLevelTextPrecomputed } = require('./services/levelTextPrecompute');
const { authRequired } = require('./middleware/auth');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Static audio files
app.use('/api/audio', express.static(config.audioDir));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api', authRequired);
app.use('/api/config', require('./routes/config'));
app.use('/api/articles', require('./routes/articles'));
app.use('/api/vocab', require('./routes/vocab'));
app.use('/api/tags', require('./routes/tags'));
app.use('/api/dictionary', require('./routes/dictionary'));
app.use('/api/export', require('./routes/export'));
app.use('/api/level-test', require('./routes/levelTest'));
app.use('/api', require('./routes/annotations'));

// Serve client build in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handler
app.use(errorHandler);

init()
  .then(() => {
    return ensureLevelTextPrecomputed();
  })
  .then(() => {
    app.listen(config.port, () => {
      console.log(`[SERVER] LexHue running at http://localhost:${config.port}`);
    });
  })
  .catch((error) => {
    console.error('[SERVER] Failed to start:', error);
    process.exit(1);
  });
