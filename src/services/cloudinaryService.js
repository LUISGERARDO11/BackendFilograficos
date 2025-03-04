/* This JavaScript code defines a function `uploadToCloudinary` that takes a file buffer as input and
uploads it to the Cloudinary service. The function returns a Promise that resolves with the secure
URL of the uploaded file. The function uses the `cloudinary` object from the `cloudinaryConfig`
module to upload the file using the `upload_stream` method. If there is an error during the upload
process, the Promise is rejected with the error. Finally, the function is exported as part of a
module. */
const cloudinary = require('../config/cloudinaryConfig');

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

// Función para subir archivos a Cloudinary
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

module.exports = {
    uploadToCloudinary,
    uploadFilesToCloudinary,
    uploadProductImagesToCloudinary
};