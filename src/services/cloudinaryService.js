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
        { resource_type: 'raw', ...options }, // Especifica que es un archivo binario
        (error, result) => {
          if (error) {
            const errorMessage = error.message || 'Unknown error occurred during file upload';
            reject(new Error(`Error uploading file to Cloudinary: ${errorMessage}`));
          } else {
            resolve(result.secure_url); // Devuelve la URL segura del archivo subido
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
      folder: 'ProductImages', // Especifica el folder en Cloudinary
      resource_type: 'auto', // Detecta automáticamente el tipo de recurso (imagen)
      public_id: fileName.split('.')[0], // Usa el nombre del archivo sin extensión como public_id
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'], // Formatos permitidos
    };

    cloudinary.uploader
      .upload_stream(options, (error, result) => {
        if (error) {
          const errorMessage = error.message || 'Unknown error occurred during product image upload';
          reject(new Error(`Error uploading product image to Cloudinary: ${errorMessage}`));
        } else {
          resolve({
            secure_url: result.secure_url, // URL segura de la imagen
            public_id: result.public_id // Identificador único en Cloudinary
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
            public_id: result.public_id // Devolvemos también el public_id
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
      folder: 'CategoryImages', // Carpeta específica para imágenes de categorías
      resource_type: 'image', // Especifica que es una imagen
      public_id: fileName.split('.')[0] || `category_${Date.now()}`, // Usa el nombre o un ID único
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'], // Formatos permitidos
      transformation: [
        { width: 800, height: 600, crop: 'fill' }, // Dimensiones optimizadas
        { quality: 'auto', format: 'webp' } // Optimización automática
      ]
    };

    cloudinary.uploader
      .upload_stream(options, (error, result) => {
        if (error) {
          const errorMessage = error.message || 'Unknown error occurred during category image upload';
          reject(new Error(`Error uploading category image to Cloudinary: ${errorMessage}`));
        } else {
          resolve({
            secure_url: result.secure_url, // URL segura de la imagen
            public_id: result.public_id // Identificador único en Cloudinary
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
        resolve(result); // Resultado de la eliminación (ej. { result: 'ok' })
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
  deleteFromCloudinary
};