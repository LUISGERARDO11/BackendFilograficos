/* This JavaScript code defines functions to upload files to Cloudinary and delete them.
Each function returns a Promise that resolves with the secure URL or result of the operation.
If an error occurs, the Promise is rejected with a proper Error instance with a descriptive message. */
const cloudinary = require('../config/cloudinaryConfig');

// Función para subir archivos a Cloudinary sin carpeta
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream((error, result) => {
      if (error) {
        const errorMessage = error.message || 'Unknown error occurred during upload';
        return reject(new Error(`Error uploading to Cloudinary: ${errorMessage}`));
      }
      resolve(result.secure_url);
    }).end(fileBuffer);
  });
};

// Función para subir archivos de documentos regulatorios a Cloudinary sin carpeta
const uploadFilesToCloudinary = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { resource_type: 'raw', ...options },
        (error, result) => {
          if (error) {
            const errorMessage = error.message || 'Unknown error occurred during file upload';
            reject(new Error(`Error uploading file to Cloudinary: ${errorMessage}`));
          } else {
            resolve(result.secure_url);
          }
        }
      )
      .end(fileBuffer);
  });
};

// Función para subir imágenes de productos a la carpeta ProductImages
const uploadProductImagesToCloudinary = (fileBuffer, fileName = '') => {
  return new Promise((resolve, reject) => {
    const options = {
      folder: 'ProductImages',
      resource_type: 'auto',
      public_id: fileName.split('.')[0],
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    };

    cloudinary.uploader
      .upload_stream(options, (error, result) => {
        if (error) {
          const errorMessage = error.message || 'Unknown error occurred during product image upload';
          reject(new Error(`Error uploading product image to Cloudinary: ${errorMessage}`));
        } else {
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id
          });
        }
      })
      .end(fileBuffer);
  });
};

// Función para subir banners a la carpeta Banners
const uploadBannerToCloudinary = (fileBuffer, fileName = '') => {
  return new Promise((resolve, reject) => {
    const options = {
      folder: 'Banners',
      resource_type: 'image',
      public_id: fileName.split('.')[0] || `banner_${Date.now()}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { width: 1920, height: 1080, crop: 'fill' },
        { quality: 'auto', format: 'webp' }
      ]
    };

    cloudinary.uploader
      .upload_stream(options, (error, result) => {
        if (error) {
          const errorMessage = error.message || 'Unknown error occurred during banner upload';
          reject(new Error(`Error uploading banner to Cloudinary: ${errorMessage}`));
        } else {
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id
          });
        }
      })
      .end(fileBuffer);
  });
};

// Función para subir imágenes de categorías a la carpeta CategoryImages
const uploadCategoryImageToCloudinary = (fileBuffer, fileName = '') => {
  return new Promise((resolve, reject) => {
    const options = {
      folder: 'CategoryImages',
      resource_type: 'image',
      public_id: fileName.split('.')[0] || `category_${Date.now()}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { width: 800, height: 600, crop: 'fill' },
        { quality: 'auto', format: 'webp' }
      ]
    };

    cloudinary.uploader
      .upload_stream(options, (error, result) => {
        if (error) {
          const errorMessage = error.message || 'Unknown error occurred during category image upload';
          reject(new Error(`Error uploading category image to Cloudinary: ${errorMessage}`));
        } else {
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id
          });
        }
      })
      .end(fileBuffer);
  });
};

// Función para subir fotos de perfil a la carpeta ProfilePictures
const uploadProfilePictureToCloudinary = (fileBuffer, userId) => {
  return new Promise((resolve, reject) => {
    const options = {
      folder: 'ProfilePictures',
      resource_type: 'image',
      public_id: `user_${userId}_${Date.now()}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { width: 200, height: 200, crop: 'thumb', gravity: 'face' },
        { quality: 'auto', format: 'webp' }
      ]
    };

    cloudinary.uploader
      .upload_stream(options, (error, result) => {
        if (error) {
          const errorMessage = error.message || 'Unknown error occurred during profile picture upload';
          reject(new Error(`Error uploading profile picture to Cloudinary: ${errorMessage}`));
        } else {
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id
          });
        }
      })
      .end(fileBuffer);
  });
};

// Nueva función para subir medios de reseñas a la carpeta ReviewMedia
const uploadReviewMediaToCloudinary = (fileBuffer, reviewId, fileName = '') => {
  return new Promise((resolve, reject) => {
    const options = {
      folder: 'ReviewMedia',
      resource_type: 'auto', // Detecta automáticamente si es imagen o video
      public_id: fileName.split('.')[0] || `review_${reviewId}_${Date.now()}`, // ID único basado en reviewId y timestamp
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov'],
      transformation: [
        { width: 800, height: 600, crop: 'limit' }, // Limitar dimensiones para imágenes
        { quality: 'auto', fetch_format: 'auto' } // Optimización automática
      ]
    };

    cloudinary.uploader
      .upload_stream(options, (error, result) => {
        if (error) {
          const errorMessage = error.message || 'Unknown error occurred during review media upload';
          reject(new Error(`Error uploading review media to Cloudinary: ${errorMessage}`));
        } else {
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
            resource_type: result.resource_type // Para identificar si es imagen o video
          });
        }
      })
      .end(fileBuffer);
  });
};

// Función para eliminar archivos de Cloudinary
const deleteFromCloudinary = (publicId) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        const errorMessage = error.message || 'Unknown error occurred during deletion';
        reject(new Error(`Error deleting from Cloudinary: ${errorMessage}`));
      } else {
        resolve(result);
      }
    });
  });
};

module.exports = {
  uploadToCloudinary,
  uploadFilesToCloudinary,
  uploadProductImagesToCloudinary,
  uploadBannerToCloudinary,
  uploadCategoryImageToCloudinary,
  uploadProfilePictureToCloudinary,
  uploadReviewMediaToCloudinary,
  deleteFromCloudinary
};