const { body, validationResult } = require('express-validator');
const { ClientCluster, User } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');

// Asignar o actualizar el cluster de un cliente
exports.setClientCluster = [
  body('user_id').isInt({ min: 1 }).withMessage('El user_id debe ser un entero válido.'),
  body('cluster').isInt({ min: 0 }).withMessage('El cluster debe ser un entero (0 o superior).'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { user_id, cluster } = req.body;

    try {
      // Verificar si el usuario existe
      const user = await User.findByPk(user_id);
      if (!user) {
        return res.status(404).json({ message: 'Usuario no encontrado.' });
      }

      const [entry, created] = await ClientCluster.upsert({ user_id, cluster });
      loggerUtils.logUserActivity(req.user?.user_id, created ? 'create' : 'update', `Cluster ${cluster} asignado a user ${user_id}`);
      res.status(200).json({ message: created ? 'Cluster asignado exitosamente.' : 'Cluster actualizado.', data: entry });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al guardar el cluster', error: error.message });
    }
  }
];

// Obtener todos los registros de clústeres
exports.getAllClientClusters = async (req, res) => {
  try {
    // Obtener todos los registros de clústeres con sus detalles
    const clientClusters = await ClientCluster.findAll({
      attributes: ['user_id', 'cluster', 'created_at', 'updated_at'],
      order: [['cluster', 'ASC'], ['user_id', 'ASC']],
      raw: true
    });

    // Agrupar los clústeres manualmente
    const groupedClusters = clientClusters.reduce((acc, client) => {
      const { cluster } = client;
      if (!acc[cluster]) {
        acc[cluster] = {
          clusterId: cluster,
          count: 0,
          clients: []
        };
      }
      acc[cluster].count += 1;
      acc[cluster].clients.push(client);
      return acc;
    }, {});

    // Convertir el objeto agrupado en un array para una respuesta más limpia
    const response = Object.values(groupedClusters);

    res.status(200).json(response);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener clústeres', error: error.message });
  }
};

// Obtener un clúster por user_id
exports.getClusterByUserId = async (req, res) => {
  try {
    const { user_id } = req.params;
    const cluster = await ClientCluster.findByPk(user_id);
    if (!cluster) {
      return res.status(404).json({ message: 'Clúster no encontrado para este usuario.' });
    }
    res.status(200).json(cluster);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al buscar el clúster', error: error.message });
  }
};