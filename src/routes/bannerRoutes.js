const express = require('express');
const router = express.Router();

// Importar controladores
const bannerController = require('../controllers/bannerController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const uploadBannerImages = require('../config/multerBannerConfig');

// Ruta para crear banners (solo administradores)
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  uploadBannerImages, // Configuración de Multer para 1-5 imágenes
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
  uploadBannerImages, // Configuración de Multer para 1 imagen (opcional en actualización)
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