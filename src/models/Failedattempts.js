const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const FailedAttempt = sequelize.define('FailedAttempt', {
  attempt_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  attempt_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  ip: {
    type: DataTypes.STRING(45),
    allowNull: false
  },
  attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  is_resolved: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'failedattempts',
  timestamps: false
});

module.exports = FailedAttempt;