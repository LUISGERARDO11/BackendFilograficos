// config/notificationConfig.js
require('dotenv').config();

const webPushConfig = {
  vapidDetails: {
    subject: 'mailto:luisgerardodah@gmail.com',
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  },
};

module.exports =  webPushConfig;