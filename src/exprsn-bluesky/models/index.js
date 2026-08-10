const { Sequelize } = require('sequelize');
const { sequelize } = require('../config/database');

const db = {};

// Import models
db.Account = require('./account')(sequelize, Sequelize.DataTypes);
db.Repository = require('./repository')(sequelize, Sequelize.DataTypes);
db.Record = require('./record')(sequelize, Sequelize.DataTypes);
db.Blob = require('./blob')(sequelize, Sequelize.DataTypes);
db.Subscription = require('./subscription')(sequelize, Sequelize.DataTypes);
db.Event = require('./event')(sequelize, Sequelize.DataTypes);

// Set up associations
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
