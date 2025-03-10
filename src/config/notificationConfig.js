// config/notificationConfig.js
require('dotenv').config();

const webPushConfig = {
  vapidDetails: {
    subject: process.env.VAPID_SUBJECT,
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  },
};

module.exports =  webPushConfig;