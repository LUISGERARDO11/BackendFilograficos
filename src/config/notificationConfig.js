/* This JavaScript code snippet is configuring web push notifications using the `webPushConfig` object.
Here's a breakdown of what it does: */
require('dotenv').config();

const webPushConfig = {
  vapidDetails: {
    subject: process.env.VAPID_SUBJECT,
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  },
};

module.exports =  webPushConfig;