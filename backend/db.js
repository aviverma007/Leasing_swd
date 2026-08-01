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

let poolPromise;
function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .then(pool => {
        console.log('Connected to SQL Server:', config.server, '/', config.database);
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

module.exports = { sql, getPool };
