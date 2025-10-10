require('dotenv').config();
const ejs = require('ejs');
const transporter = require('../config/transporter');
const loggerUtils = require('../utils/loggerUtils');

class EmailService {
  // Función auxiliar para obtener una plantilla de email
  async getEmailTemplate(templateCode) {
    const { EmailType, EmailTemplate } = require('../models/Associations');
    const emailType = await EmailType.findOne({ where: { token: templateCode } });
    if (!emailType) throw new Error('Tipo de email no encontrado');

    const template = await EmailTemplate.findOne({ where: { email_type_id: emailType.email_type_id } });
    if (!template) throw new Error('Plantilla de email no encontrada');
    return template;
  }

  async sendGenericEmail(to, subject, html, text) {
    const { NotificationLog } = require('../models/Associations');

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
        user_id: null,
        type: 'email',
        title: subject,
        message: text || html,
        status: 'sent',
        sent_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        seen: false
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
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        seen: false
      });
      loggerUtils.logCriticalError(error);
      return { success: false, error: error.message };
    }
  }

  async sendBadgeNotification(userEmail, badgeToken, userName, badgeName, obtainedAt, badgeDescription) {
    const template = await this.getEmailTemplate(badgeToken);
    const data = {
      user_name: userName,
      badge_name: badgeName,
      obtained_at: obtainedAt,
      badge_description: badgeDescription
    };
    const htmlContent = ejs.render(template.html_content, data);
    const textContent = ejs.render(template.text_content, data);
    const subject = ejs.render(template.subject, data);

    return this.sendGenericEmail(userEmail, subject, htmlContent, textContent);
  }

  async sendVerificationEmail(destinatario, token) {
    const template = await this.getEmailTemplate('email_verificacion');
    const verificationLink = `${process.env.BASE_URL}/auth/verify-email?token=${token}`;
    const data = { destinatario, token, verificationLink };
    const htmlContent = ejs.render(template.html_content, data);
    const textContent = ejs.render(template.text_content, data);

    return this.sendGenericEmail(destinatario, template.subject, htmlContent, textContent);
  }

  async sendMFAOTPEmail(destinatario, otp) {
    const template = await this.getEmailTemplate('mfa_autenticacion');
    const data = { destinatario, otp: otp.split('').join(' ') };
    const htmlContent = ejs.render(template.html_content, data);
    const textContent = ejs.render(template.text_content, data);

    return this.sendGenericEmail(destinatario, template.subject, htmlContent, textContent);
  }

  async sendOTPEmail(destinatario, otp) {
    const template = await this.getEmailTemplate('recuperacion_contrasena');
    const data = { destinatario, otp: otp.split('').join(' ') };
    const htmlContent = ejs.render(template.html_content, data);
    const textContent = ejs.render(template.text_content, data);

    return this.sendGenericEmail(destinatario, template.subject, htmlContent, textContent);
  }

  async sendPasswordChangeNotification(destinatario) {
    const template = await this.getEmailTemplate('notificacion_cambio_contrasena');
    const data = { destinatario };
    const htmlContent = ejs.render(template.html_content, data);
    const textContent = ejs.render(template.text_content, data);

    return this.sendGenericEmail(destinatario, template.subject, htmlContent, textContent);
  }

  async sendUserSupportEmail(userEmail, userName, subject, message) {
    const template = await this.getEmailTemplate('support_inquiry_notification');
    const companyEmail = process.env.COMPANY_EMAIL || 'soporte@empresa.com';
    const data = { user_email: userEmail, user_name: userName, subject, message };
    const htmlContent = ejs.render(template.html_content, data);
    const textContent = ejs.render(template.text_content, data);

    return this.sendGenericEmail(companyEmail, `${template.subject} ${subject}`, htmlContent, textContent);
  }

  async notifyStockEmail(to, title, message) {
    const htmlContent = `<h1>${title}</h1><p>${message}</p>`;
    return this.sendGenericEmail(to, title, htmlContent, message);
  }

  async sendCouponEmail(to, couponCode) {
    const template = await this.getEmailTemplate('COUPON_DELIVERY');
    const data = { coupon_code: couponCode };
    const htmlContent = ejs.render(template.html_content, data);
    const textContent = ejs.render(template.text_content, data);

    return this.sendGenericEmail(to, template.subject, htmlContent, textContent);
  }
}

module.exports = EmailService;