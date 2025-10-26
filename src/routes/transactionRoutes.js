const express = require('express');
const router = express.Router();

// Importar controladores
const transactionController = require('../controllers/transactionController');

// Ruta para exportar transacciones a CSV
router.get('/export', transactionController.exportTransactions);

// Ruta para generar órdenes automáticamente (random)
router.post('/generate-orders', transactionController.generateOrders);

// Ruta para generar órdenes específicas para pruebas de insignias
router.post('/generate-targeted-orders', transactionController.generateTargetedBadgesOrders); // <--- ¡NUEVA RUTA!

// Ruta para generar registros faltantes en órdenes
router.post('/fill-missing-records', transactionController.fillMissingRecords);

// ⚡ NUEVA RUTA: Asignación retroactiva de insignias 
router.post('/assign-badges-retroactive', transactionController.assignRetroactiveBadges);

module.exports = router;