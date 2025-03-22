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

// Ruta para actualizar la cantidad de un ítem
router.put('/update', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, cartController.updateCartItem);

// Ruta para eliminar un ítem del carrito
router.delete('/remove/:cartDetailId', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, cartController.removeCartItem);

module.exports = router;