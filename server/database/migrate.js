const { init } = require('./init');

async function migrate() {
  await init();
}

module.exports = { migrate };
