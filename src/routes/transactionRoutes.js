const express = require('express');
const router = express.Router();

// Importar controladores
const transactionController = require('../controllers/transactionController');

// Ruta para exportar transacciones a CSV
router.get('/export', transactionController.exportTransactions);

// Ruta para generar órdenes automáticamente
router.post('/generate-orders', transactionController.generateOrders);

// Ruta para generar registros faltantes en órdenes
router.post('/fill-missing-records', transactionController.fillMissingRecords);

module.exports = router;