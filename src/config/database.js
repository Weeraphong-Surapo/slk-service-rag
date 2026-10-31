const mysql = require('mysql2/promise');
const config = require('./index');

// Shared MySQL connection pool
const pool = mysql.createPool({
  host: config.mysql.host,
  port: config.mysql.port,
  database: config.mysql.database,
  user: config.mysql.user,
  password: config.mysql.password,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
