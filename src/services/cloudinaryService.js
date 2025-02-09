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

module.exports = {
    uploadToCloudinary
};