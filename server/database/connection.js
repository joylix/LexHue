const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const config = require('../config');

let pool = null;
const userContext = new AsyncLocalStorage();

const DEFAULT_USER = {
  user_id: 'local',
  username: 'local',
  display_name: '本地用户',
};

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      host: config.pgHost,
      port: config.pgPort,
      database: config.pgDatabase,
      user: config.pgUser,
      password: config.pgPassword,
      max: 10,
    });
  }
  return pool;
}

async function query(text, params = []) {
  const result = await getPool().query(text, params);
  return result;
}

async function getOne(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

async function getAll(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

async function run(text, params = []) {
  await query(text, params);
}

async function transaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const tx = {
      query: (text, params = []) => client.query(text, params),
      getOne: async (text, params = []) => {
        const result = await client.query(text, params);
        return result.rows[0] || null;
      },
      getAll: async (text, params = []) => {
        const result = await client.query(text, params);
        return result.rows;
      },
      run: async (text, params = []) => {
        await client.query(text, params);
      },
    };
    const value = await callback(tx);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function getCurrentUser() {
  return userContext.getStore() || DEFAULT_USER;
}

function setCurrentUser(user) {
  userContext.enterWith(user || null);
}

function runWithUser(user, callback) {
  return userContext.run(user || null, callback);
}

function seedFile(name) {
  return path.join(__dirname, 'seed', name);
}

function readSeed(name, fallback = []) {
  const file = seedFile(name);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

module.exports = {
  DEFAULT_USER,
  getPool,
  query,
  getOne,
  getAll,
  run,
  transaction,
  getCurrentUser,
  setCurrentUser,
  runWithUser,
  readSeed,
};
