require('dotenv').config();
const ejs = require('ejs');
const transporter = require('../config/transporter');

// Importar modelos
const { EmailType, EmailTemplate, NotificationLog } = require('../models/Associations');

// Importar utilidades
const loggerUtils = require('../utils/loggerUtils');

// Función auxiliar para obtener una plantilla de email
const getEmailTemplate = async (templateCode) => {
  const emailType = await EmailType.findOne({ where: { token: templateCode } });
  if (!emailType) throw new Error('Tipo de email no encontrado');

  const template = await EmailTemplate.findOne({ where: { email_type_id: emailType.email_type_id } });
  if (!template) throw new Error('Plantilla de email no encontrada');
  return template;
};

// Clase EmailService para encapsular la lógica
class EmailService {
  /**
   * Envía un correo genérico con opciones personalizadas
   * @param {string} to - Destinatario del correo
   * @param {string} subject - Asunto del correo
   * @param {string} html - Contenido HTML del correo
   * @param {string} text - Contenido de texto plano del correo
   * @returns {Promise<Object>} Resultado del envío
   */
  async sendGenericEmail(to, subject, html, text) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to,
        subject,
        html,
        text,
      };

      const info = await transporter.sendMail(mailOptions);

      await NotificationLog.create({
        user_id: null, // No siempre tenemos user_id, depende del contexto
        type: 'email',
        title: subject,
        message: text || html,
        status: 'sent',
        sent_at: new Date(),
        created_at: new Date(),
      });

      loggerUtils.logUserActivity(null, 'send_generic_email', `Correo enviado a ${to}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      await NotificationLog.create({
        user_id: null,
        type: 'email',
        title: subject,
        message: text || html,
        status: 'failed',
        error_message: error.message,
        created_at: new Date(),
      });
      loggerUtils.logCriticalError(error);
      throw new Error(`Error enviando correo: ${error.message}`);
    }
  }

  /**
   * Envía un correo de verificación
   * @param {string} destinatario - Correo del destinatario
   * @param {string} token - Token de verificación
   * @returns {Promise<void>}
   */
  async sendVerificationEmail(destinatario, token) {
    try {
      const template = await getEmailTemplate('email_verificacion');
      const verificationLink = `${process.env.BASE_URL}/auth/verify-email?token=${token}`;
      const data = { destinatario, token, verificationLink };

      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: destinatario,
        subject: template.subject,
        html: ejs.render(template.html_content, data),
        text: ejs.render(template.text_content, data),
      };

      await transporter.sendMail(mailOptions);
      loggerUtils.logUserActivity(null, 'send_verification_email', `Correo enviado a ${destinatario}`);
      console.log('Correo de verificación enviado');
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error enviando correo: ${error.message}`);
    }
  }

  /**
   * Envía un OTP para MFA
   * @param {string} destinatario - Correo del destinatario
   * @param {string} otp - Código OTP
   * @returns {Promise<void>}
   */
  async sendMFAOTPEmail(destinatario, otp) {
    try {
      const template = await getEmailTemplate('mfa_autenticacion');
      const data = { destinatario, otp: otp.split('').join(' ') };

      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: destinatario,
        subject: template.subject,
        html: ejs.render(template.html_content, data),
        text: ejs.render(template.text_content, data),
      };

      await transporter.sendMail(mailOptions);
      loggerUtils.logUserActivity(null, 'send_mfa_otp', `OTP MFA enviado a ${destinatario}`);
      console.log('Correo MFA enviado');
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error enviando OTP MFA: ${error.message}`);
    }
  }

  /**
   * Envía un OTP para recuperación de contraseña
   * @param {string} destinatario - Correo del destinatario
   * @param {string} otp - Código OTP
   * @returns {Promise<void>}
   */
  async sendOTPEmail(destinatario, otp) {
    try {
      const template = await getEmailTemplate('recuperacion_contrasena');
      const data = { destinatario, otp: otp.split('').join(' ') };

      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: destinatario,
        subject: template.subject,
        html: ejs.render(template.html_content, data),
        text: ejs.render(template.text_content, data),
      };

      await transporter.sendMail(mailOptions);
      loggerUtils.logUserActivity(null, 'send_otp_recovery', `OTP recuperación enviado a ${destinatario}`);
      console.log('Correo recuperación enviado');
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error enviando OTP recuperación: ${error.message}`);
    }
  }

  /**
   * Envía notificación de cambio de contraseña
   * @param {string} destinatario - Correo del destinatario
   * @returns {Promise<void>}
   */
  async sendPasswordChangeNotification(destinatario) {
    try {
      const template = await getEmailTemplate('notificacion_cambio_contrasena');
      const data = { destinatario };

      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: destinatario,
        subject: template.subject,
        html: ejs.render(template.html_content, data),
        text: ejs.render(template.text_content, data),
      };

      await transporter.sendMail(mailOptions);
      loggerUtils.logUserActivity(null, 'password_change_notification', `Notificación enviada a ${destinatario}`);
      console.log('Notificación de cambio enviada');
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error enviando notificación: ${error.message}`);
    }
  }

  /**
   * Envía un correo de soporte al equipo
   * @param {string} userEmail - Correo del usuario
   * @param {string} userName - Nombre del usuario
   * @param {string} subject - Asunto del mensaje
   * @param {string} message - Mensaje del usuario
   * @returns {Promise<void>}
   */
  async sendUserSupportEmail(userEmail, userName, subject, message) {
    try {
      const template = await getEmailTemplate('support_inquiry_notification');
      const companyEmail = process.env.COMPANY_EMAIL || 'soporte@empresa.com';
      const data = { user_email: userEmail, user_name: userName, subject, message };

      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: companyEmail,
        subject: `${template.subject} ${subject}`,
        html: ejs.render(template.html_content, data),
        text: ejs.render(template.text_content, data),
      };

      await transporter.sendMail(mailOptions);
      loggerUtils.logUserActivity(null, 'send_user_support_email', `Correo enviado desde ${userEmail} a ${companyEmail}`);
      console.log('Correo de soporte enviado');
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error enviando correo de soporte: ${error.message}`);
    }
  }

  /**
   * Envía notificación de stock por correo
   * @param {string} to - Correo del destinatario
   * @param {string} title - Título del correo
   * @param {string} message - Mensaje del correo
   * @returns {Promise<Object>} Resultado del envío
   */
  async notifyStockEmail(to, title, message) {
    const htmlContent = `<h1>${title}</h1><p>${message}</p>`;
    return this.sendGenericEmail(to, title, htmlContent, message);
  }
}

module.exports = new EmailService();