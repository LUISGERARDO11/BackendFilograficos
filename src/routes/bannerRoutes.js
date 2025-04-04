const express = require('express');
const router = express.Router();

// Importar controladores
const bannerController = require('../controllers/bannerController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const uploadBannerImages = require('../config/multerBannerConfig');

// Cambiar visibilidad de los banners para los usuarios (ESTÁTICA, DEFINIR PRIMERO)
router.put(
  '/visibility',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  bannerController.toggleBannersVisibility
);

// Obtener la configuración de visibilidad de banners (ESTÁTICA)
router.get(
  '/visibility',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  bannerController.getBannersVisibility
);

// Ruta para crear banners (solo administradores)
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  uploadBannerImages,
  bannerController.createBanners
);

// Ruta para obtener todos los banners (solo administradores)
router.get(
  '/all',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  bannerController.getAllBanners
);

// Ruta para obtener banners activos (pública, no requiere autenticación)
router.get(
  '/active',
  bannerController.getActiveBanners
);

// Ruta para actualizar un banner (solo administradores)
router.put(
  '/:bannerId',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  uploadBannerImages,
  bannerController.updateBanner
);

// Ruta para eliminar un banner (solo administradores)
router.delete(
  '/:bannerId',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  bannerController.deleteBanner
);

module.exports = router;