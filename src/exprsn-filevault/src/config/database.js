/**
 * ═══════════════════════════════════════════════════════════════════════
 * FileVault Database Configuration
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  host: process.env.FILEVAULT_PG_HOST || 'localhost',
  port: parseInt(process.env.FILEVAULT_PG_PORT || '5432', 10),
  database: process.env.FILEVAULT_PG_DATABASE || 'exprsn_filevault',
  username: process.env.FILEVAULT_PG_USER || 'filevault_service',
  password: process.env.FILEVAULT_PG_PASSWORD || '',

  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,

  pool: {
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    acquire: 30000,
    idle: 10000
  },

  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true
  }
};
