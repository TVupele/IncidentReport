const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Responder = sequelize.define('Responder', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    organization: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    type: {
      type: DataTypes.ENUM('security_team', 'community_focal', 'agency_liaison'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      defaultValue: 'active',
    },
    state: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lga: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  }, {
    tableName: 'responders',
    timestamps: true,
  });

  return Responder;
};
