/* This JavaScript code defines a function `uploadToCloudinary` that takes a file buffer as input and
uploads it to the Cloudinary service. The function returns a Promise that resolves with the secure
URL of the uploaded file. The function uses the `cloudinary` object from the `cloudinaryConfig`
module to upload the file using the `upload_stream` method. If there is an error during the upload
process, the Promise is rejected with the error. Finally, the function is exported as part of a
module. */
const cloudinary = require('../config/cloudinaryConfig');

// Función para subir archivos a cloduinary sin carpeta
const uploadToCloudinary = (fileBuffer) => {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream((error, result) => {
        if (error) {
          return reject(error);
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
            reject(error);
          } else {
            resolve(result.secure_url); // Devuelve la URL segura del archivo subido
          }
        }
      )
      .end(fileBuffer);
  });
};

// Función paa subir imagenes de productos a la carpeta ProductImages 
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
          reject(error);
        } else {
          resolve(result.secure_url); // Devuelve la URL segura de la imagen subida
        }
      })
      .end(fileBuffer);
  });
};

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
          reject(error);
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

const deleteFromCloudinary = (publicId) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        reject(error);
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
    deleteFromCloudinary
};