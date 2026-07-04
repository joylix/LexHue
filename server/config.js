const path = require('path');

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  clientPort: parseInt(process.env.CLIENT_PORT, 10) || 5173,
  dataDir: path.join(__dirname, 'data'),
  databaseUrl: process.env.DATABASE_URL || null,
  pgHost: process.env.PGHOST || '/tmp/lexhue-pg',
  pgPort: parseInt(process.env.PGPORT, 10) || 5432,
  pgDatabase: process.env.PGDATABASE || 'lexhue',
  pgUser: process.env.PGUSER || 'lexhue',
  pgPassword: process.env.PGPASSWORD || 'lexhue',
  legacyDictionaryDbPath: path.join(__dirname, 'data', 'dictionary.db'),
  legacyUserdataDbPath: path.join(__dirname, 'data', 'userdata.db'),
  audioDir: path.join(__dirname, 'data', 'audio'),
  levelTextPrecomputedPath: path.join(__dirname, 'data', 'level_texts_precomputed.json'),
  articleMaxChars: parseInt(process.env.ARTICLE_MAX_CHARS, 10) || 10000,
  latestSchema: 1,
};
