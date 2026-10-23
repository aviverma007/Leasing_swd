require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER || '192.168.66.33',
  database: process.env.DB_DATABASE || 'LeasingBillingDB',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 1433,
  options: {
    encrypt: false,               // older SQL Server instances on the internal network
    trustServerCertificate: true
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

// Schema all app tables live under. Default 'dbo'. Set DB_SCHEMA=leasing in .env
// to isolate these tables from your existing dbo.* tables in a shared database.
const SCHEMA = process.env.DB_SCHEMA || 'dbo';
// tbl('Invoices') -> 'dbo.Invoices' or 'leasing.Invoices'
function tbl(name) { return `${SCHEMA}.${name}`; }

let poolPromise;
function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .then(async pool => {
        console.log('Connected to SQL Server:', config.server, '/', config.database);
        // Ensure every column the code expects exists (idempotent, logged).
        try {
          const { autoMigrate } = require('./lib/autoMigrate');
          await autoMigrate(pool, sql, SCHEMA);
        } catch (e) {
          console.error('[autoMigrate] skipped:', e.message);
        }
        try {
          const { loadRoleProfiles } = require('./lib/permissions');
          await loadRoleProfiles(pool, SCHEMA);
        } catch (e) {
          console.error('[roles] load skipped:', e.message);
        }
        return pool;
      })
      .catch(err => {
        console.error('DB connection failed:', err.message);
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

module.exports = { sql, getPool, SCHEMA, tbl };
