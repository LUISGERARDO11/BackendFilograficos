require("dotenv").config();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const ejs = require('ejs');
const nodemailer = require("nodemailer");
const transporter = require('../config/transporter');

// Importar modelos
const { EmailType, EmailTemplate } = require('../models/Associations')

// Importar utilidades
const loggerUtils = require('../utils/loggerUtils');

// ** SERVICIOS PARA ENVÍO DE CORREOS ELECTRÓNICOS **
const getEmailTemplate = async (templateCode) => {
  const emailType = await EmailType.findOne({
    where: { token: templateCode }
  });

  if (!emailType) throw new Error('Tipo de email no encontrado');

  const template = await EmailTemplate.findOne({
    where: { email_type_id: emailType.email_type_id }
  });

  if (!template) throw new Error('Plantilla de email no encontrada');
  return template;
};

// Servicio para enviar un código de verificación
exports.sendVerificationEmail = async (destinatario, token) => {
  try {
    const template = await getEmailTemplate('email_verificacion');
    const verificationLink = `${process.env.BASE_URL}/auth/verify-email?token=${token}`;

    const data = {
      destinatario,
      token,
      verificationLink
    };

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: destinatario,
      subject: template.subject,
      html: ejs.render(template.html_content, data),
      text: ejs.render(template.text_content, data)
    };

    await transporter.sendMail(mailOptions);
    loggerUtils.logUserActivity(null, 'send_verification_email', `Correo enviado a ${destinatario}`);
    console.log("Correo de verificación enviado");
  } catch (error) {
    loggerUtils.logCriticalError(error);
    throw new Error("Error enviando correo: " + error.message);
  }
};

// Servicio para enviar OTP de MFA
exports.sendMFAOTPEmail = async (destinatario, otp) => {
  try {
    const template = await getEmailTemplate('mfa_autenticacion');
    
    const data = {
      destinatario,
      otp: otp.split("").join(" ")
    };

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: destinatario,
      subject: template.subject,
      html: ejs.render(template.html_content, data),
      text: ejs.render(template.text_content, data)
    };

    await transporter.sendMail(mailOptions);
    loggerUtils.logUserActivity(null, 'send_mfa_otp', `OTP MFA enviado a ${destinatario}`);
    console.log("Correo MFA enviado");
  } catch (error) {
    loggerUtils.logCriticalError(error);
    throw new Error("Error enviando OTP MFA: " + error.message);
  }
};

// Servicio para enviar OTP de recuperación
exports.sendOTPEmail = async (destinatario, otp) => {
  try {
    const template = await getEmailTemplate('recuperacion_contrasena');
    
    const data = {
      destinatario,
      otp: otp.split("").join(" ")
    };

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: destinatario,
      subject: template.subject,
      html: ejs.render(template.html_content, data),
      text: ejs.render(template.text_content, data)
    };

    await transporter.sendMail(mailOptions);
    loggerUtils.logUserActivity(null, 'send_otp_recovery', `OTP recuperación enviado a ${destinatario}`);
    console.log("Correo recuperación enviado");
  } catch (error) {
    loggerUtils.logCriticalError(error);
    throw new Error("Error enviando OTP recuperación: " + error.message);
  }
};

// Servicio para notificación de cambio de contraseña
exports.sendPasswordChangeNotification = async (destinatario) => {
  try {
    const template = await getEmailTemplate('notificacion_cambio_contrasena');
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: destinatario,
      subject: template.subject,
      html: ejs.render(template.html_content, { destinatario }),
      text: ejs.render(template.text_content, { destinatario })
    };

    await transporter.sendMail(mailOptions);
    loggerUtils.logUserActivity(null, 'password_change_notification', `Notificación enviada a ${destinatario}`);
    console.log("Notificación de cambio enviada");
  } catch (error) {
    loggerUtils.logCriticalError(error);
    throw new Error("Error enviando notificación: " + error.message);
  }
};