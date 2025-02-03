/* This code snippet is setting up CORS (Cross-Origin Resource Sharing) configuration for a Node.js
application using the `cors` package. Here's a breakdown of what each part of the code is doing: */
const cors = require("cors");
require('dotenv').config();
const corsOptions = {
  /* The `origin` property in the `corsOptions` object is a function that determines whether a
    request origin is allowed based on a whitelist. Here's a breakdown of what it does: */
  origin: function (origin, callback) { 
    const whitelist = process.env.CORS_WHITELIST? process.env.CORS_WHITELIST.split(","): [];
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization','Access-Control-Allow-Origin','x-csrf-token'],
  credentials: true,
  optionsSuccessStatus: 200
};

module.exports = cors(corsOptions);
