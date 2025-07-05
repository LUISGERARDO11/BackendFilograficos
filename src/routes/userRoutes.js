/* This JavaScript code is setting up a router using Express.js for handling various routes related to
user management in a web application. Here's a breakdown of what the code is doing: */
const express = require('express');
const router = express.Router();

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const roleMiddleware = require('../middlewares/roleMiddleware');

// Importar middleware de Multer para fotos de perfil
const uploadProfilePicture = require('../config/multerUploadProfilePicture');

// Importar controladores
const userController = require('../controllers/userController');

// ** GESTIÓN DE PERFIL DE USUARIOS **
// Ruta para obtener el perfil del usuario autenticado
router.get('/profile', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, userController.getProfile);

// Ruta para actualizar el perfil del usuario (nombre, dirección, teléfono)
router.put('/profile', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, userController.updateProfile);

// Ruta para agregar o actualizar la dirección del usuario
router.post('/add-address', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, userController.addAddress);

// Ruta para actualizar solo la dirección del usuario
router.put('/change-address', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, userController.updateUserProfile);

// Ruta para subir la foto de perfil del usuario
router.post('/upload-profile-picture', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, uploadProfilePicture, userController.uploadProfilePicture);

// Ruta para eliminar la foto de perfil del usuario
router.delete('/profile-picture', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, userController.deleteProfilePicture);

// ** ELIMINACIÓN DE CUENTAS **
// Ruta para que el cliente autenticado elimine su cuenta
router.delete('/delete-account', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, userController.deleteMyAccount);

// Ruta para que un administrador pueda eliminar un cliente y todo lo relacionado con él
router.delete('/delete-customer/:id', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), userController.deleteCustomerAccount);

// ** ADMINISTRACIÓN DE USUARIOS (SOLO PARA ADMINISTRADORES) **
// Ruta para obtener todos los usuarios con la sesión más reciente
router.get('/all-users', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), userController.getAllUsersWithSessions);

// Ruta para desactivar o bloquear una cuenta de usuario
router.put('/deactivate-account/:user_id', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), userController.deactivateAccount);

module.exports = router;