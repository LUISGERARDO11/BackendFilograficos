/* This code snippet is a set of services for sending different types of emails in a Node.js
application. Here's a breakdown of what each part of the code is doing: */
require("dotenv").config();
const ejs = require('ejs');
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

// Enviar el correo con la información del usuario al correo de contacto de la empresa
exports.sendUserSupportEmail = async (userEmail, userName, subject, message) => {
  try {
    // Obtener la plantilla desde la base de datos
    const template = await getEmailTemplate('support_inquiry_notification');

    // Correo de contacto de la empresa (de .env o configuración)
    const companyEmail = process.env.COMPANY_EMAIL || "soporte@empresa.com";

    // Datos para renderizar la plantilla
    const data = {
      user_email: userEmail, 
      user_name: userName,
      subject,
      message
    };

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: companyEmail,
      subject: `${template.subject} ${subject}`, // Concatenamos el asunto de la plantilla con el del usuario
      html: ejs.render(template.html_content, data),
      text: ejs.render(template.text_content, data)
    };

    // Enviar el correo
    await transporter.sendMail(mailOptions);

    // Registrar en logs
    loggerUtils.logUserActivity(null, 'send_user_support_email', `Correo enviado desde ${userEmail} a ${companyEmail}`);
    console.log("Correo de soporte enviado");

  } catch (error) {
    loggerUtils.logCriticalError(error);
    throw new Error("Error enviando correo de soporte: " + error.message);
  }
};