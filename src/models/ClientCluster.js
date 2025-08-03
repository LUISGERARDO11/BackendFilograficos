const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const ClientCluster = sequelize.define('ClientCluster', {
  user_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    },
    onDelete: 'CASCADE'
  },
  cluster: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'client_clusters',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['cluster'] 
    }
  ]
});

module.exports = ClientCluster;