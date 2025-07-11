/* This code snippet provides functions for password management and security, with date handling in UTC. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const moment = require('moment-timezone');

let passwordList = new Set();
let isPasswordListLoaded = false;

// Función auxiliar para verificar el estado de la rotación de contraseñas
exports.checkPasswordRotation = (fechaUltimoCambio) => {
  if (!(fechaUltimoCambio instanceof Date)) {
    throw new Error("fechaUltimoCambio debe ser una instancia de Date");
  }

  // Convertir fechaUltimoCambio a UTC para cálculos consistentes
  const fechaUltimoCambioUTC = moment(fechaUltimoCambio).tz('UTC');
  const seisMesesAntes = moment().tz('UTC').subtract(6, 'months'); // Restar 6 meses en UTC
  const warningPeriod = moment().tz('UTC').subtract(5, 'days'); // Aviso si quedan 5 días o menos

  if (fechaUltimoCambioUTC.isBefore(seisMesesAntes)) {
    return {
      requiereCambio: true,
      message: "Debes cambiar tu contraseña. Han pasado más de 6 meses.",
    };
  }

  if (fechaUltimoCambioUTC.isBefore(warningPeriod)) {
    return {
      requiereCambio: false,
      warning: true,
      message: "Tu contraseña caduca pronto. Cámbiala en los próximos días.",
    };
  }

  return { requiereCambio: false, warning: false };
};

// Genera un código OTP seguro
exports.generateOTP = () => {
  return crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 caracteres en hexadecimal
};

// Cargar la lista de contraseñas
exports.loadPasswordList = () => {
  const filePath = path.join(__dirname, "..", "100k-most-used-passwords-NCSC.txt");

  try {
    const data = fs.readFileSync(filePath, "utf8");
    passwordList = new Set(data.split("\n").map((password) => password.trim()));
    isPasswordListLoaded = true;
    console.log("Lista de contraseñas cargada correctamente");
  } catch (err) {
    console.error("Error al leer el archivo de contraseñas:", err);
    process.exit(1); // Salir si ocurre un error grave
  }
};

// Verificar si una contraseña está comprometida
exports.isPasswordCompromised = (password) => {
  if (typeof password !== "string" || password.trim() === "") {
    throw new Error("La contraseña debe ser una cadena no vacía");
  }

  if (!isPasswordListLoaded) {
    throw new Error("La lista de contraseñas no ha sido cargada");
  }

  return passwordList.has(password.trim());
};

exports.parseBasicAuth = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return { client_id: null, client_secret: null };
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [client_id, client_secret] = credentials.split(':');

  return { client_id, client_secret };
};