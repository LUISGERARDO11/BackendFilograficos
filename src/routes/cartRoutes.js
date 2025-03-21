const express = require('express');
const router = express.Router();

// Importar controladores
const cartController = require('../controllers/cartController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');


// ** GESTIÓN DEL CARRITO **
// Ruta para añadir un producto al carrito
router.post('/add', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, cartController.addToCart);

// Ruta para obtener el estado del carrito
router.get('/', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, cartController.getCart);

module.exports = router;