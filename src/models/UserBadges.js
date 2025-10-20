const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const UserBadge = sequelize.define('UserBadge', {
  user_badge_id: {
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
    },
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  },
  badge_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'badges',
      key: 'badge_id'
    },
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE'
  },
  category_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'categories',
      key: 'category_id'
    },
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE'
  },
  obtained_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'user_badges',
  timestamps: false,
    indexes: [
    { fields: ['user_id', 'badge_id', 'category_id'], unique: true, name: 'idx_user_badge_unique' },
    { fields: ['user_id'], name: 'idx_user_badge_user_id' },
    { fields: ['badge_id'], name: 'idx_user_badge_badge_id' },
    { fields: ['category_id'], name: 'idx_user_badge_category_id' },
    { fields: ['obtained_at'], name: 'idx_user_badge_obtained_at' }
  ],
  validate: {
    async checkReferences() {
      console.log("entró a validación")
      const user = await sequelize.models.User.findByPk(this.user_id);
      const badge = await sequelize.models.Badge.findByPk(this.badge_id);
      if (!user) throw new Error('Usuario no existe');
      if (!badge) throw new Error('Insignia no existe');
      console.log("primeras validaciones pasadas")
      if (this.category_id) {
        console.log("hay id de categoria")
        const category = await sequelize.models.Category.findOne({
          where: { category_id: this.category_id, active: true }
        });
        console.log("pasó")
        if (!category) throw new Error('Categoría no existe o está inactiva');
      }
    }
  }
});

module.exports = UserBadge;