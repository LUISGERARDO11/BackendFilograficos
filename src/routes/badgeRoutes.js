const express = require('express');
const router = express.Router();

const badgeController = require('../controllers/badgeController');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const uploadBadgeIcon = require('../config/multerBadgeConfig');

// GET /api/badges/ - Obtener todas las insignias (Paginado, Admin)
router.get(
    '/',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    badgeController.getAllBadges
);

// ⚠️ RUTAS ESTÁTICAS deben ir antes de las dinámicas

// GET /api/badges/categories - Obtener categorías con conteo de insignias (Admin)
router.get(
    '/categories',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    badgeController.getBadgeCategoriesWithCount
);

// GET /api/badges/history - Obtener historial de insignias otorgadas (Admin)
router.get(
    '/history',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    badgeController.getGrantedBadgesHistory
);

// RUTAS DINÁMICAS (con :id) van al final

// GET /api/badges/:id - Obtener insignia por ID (Admin)
router.get(
    '/:id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    badgeController.getBadgeById
);

// POST /api/badges/ - Crear nueva insignia (Admin)
router.post(
    '/',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    uploadBadgeIcon,
    badgeController.createBadge
);

// PUT /api/badges/:id - Actualizar insignia (Admin)
router.put(
    '/:id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    uploadBadgeIcon,
    badgeController.updateBadge
);

// DELETE /api/badges/:id - Desactivar insignia (Admin)
router.delete(
    '/:id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    badgeController.deleteBadge
);

module.exports = router;