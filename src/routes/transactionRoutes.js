const express = require('express');
const router = express.Router();

// Importar controladores
const transactionController = require('../controllers/transactionController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Ruta para exportar transacciones a CSV
router.get('/export',  transactionController.exportTransactions);

module.exports = router;