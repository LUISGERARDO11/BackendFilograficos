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

module.exports = {
    uploadToCloudinary
};