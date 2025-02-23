/* This code snippet is setting up associations between different models in a Node.js application using
Sequelize, which is an ORM for Node.js. */
const User = require('./Users');
const Account = require('./Account');
const TwoFactorConfig = require('./Twofactorconfig');
const PasswordStatus = require('./Passwordstatus');
const PasswordRecovery = require('./Passwordrecovery');
const PasswordHistory = require('./Passwordhistory');
const Session = require('./Sessions');
const FailedAttempt = require('./Failedattempts');
const Address = require('./Addresses');
const EmailType = require('./Emailtypes');
const EmailTemplate = require('./Emailtemplates');
const RegulatoryDocument = require('./Regulatorydocuments');
const DocumentVersion = require('./Documentversions');
const FaqCategory = require('./Faqcategory');
const Faq = require('./Faq');
const SupportInquiry = require('./Supportinquiry');
const Order = require('./Order');
const OrderHistory = require('./OrderHistory');
const Payment = require('./Payment');
const Banner = require('./Banner');
const BackupLog = require('./BackupLog');
const RestorationLog = require('./RestorationLog');

// Relaciones de Usuarios
User.hasOne(Account, { foreignKey: 'user_id' });
Account.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(Address, { foreignKey: 'user_id' });
Address.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(Session, { foreignKey: 'user_id' });
Session.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(FailedAttempt, { foreignKey: 'user_id' });
FailedAttempt.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(SupportInquiry, { foreignKey: 'user_id' });
SupportInquiry.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(Order, { foreignKey: 'user_id' });
Order.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(OrderHistory, { foreignKey: 'user_id' });
OrderHistory.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(BackupLog, { foreignKey: 'performed_by' });
BackupLog.belongsTo(User, { foreignKey: 'performed_by' });

User.hasMany(RestorationLog, { foreignKey: 'performed_by' });
RestorationLog.belongsTo(User, { foreignKey: 'performed_by' });

// Relaciones de Cuentas
Account.hasMany(TwoFactorConfig, { foreignKey: 'account_id' });
TwoFactorConfig.belongsTo(Account, { foreignKey: 'account_id' });

Account.hasOne(PasswordStatus, { foreignKey: 'account_id' });
PasswordStatus.belongsTo(Account, { foreignKey: 'account_id' });

Account.hasMany(PasswordRecovery, { foreignKey: 'account_id' });
PasswordRecovery.belongsTo(Account, { foreignKey: 'account_id' });

Account.hasMany(PasswordHistory, { foreignKey: 'account_id' });
PasswordHistory.belongsTo(Account, { foreignKey: 'account_id' });

// Relaciones de Documentos
RegulatoryDocument.hasMany(DocumentVersion, { foreignKey: 'document_id' });
DocumentVersion.belongsTo(RegulatoryDocument, { foreignKey: 'document_id' });

// Relaciones de Correos Electrónicos
EmailType.hasMany(EmailTemplate, { foreignKey: 'email_type_id' });
EmailTemplate.belongsTo(EmailType, { foreignKey: 'email_type_id' });

EmailTemplate.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
EmailTemplate.belongsTo(User, { foreignKey: 'updated_by', as: 'Updater' });
EmailType.belongsTo(User, { foreignKey: 'created_by' });

// Relaciones de FAQs
FaqCategory.hasMany(Faq, { foreignKey: 'category_id', as: 'faqs' });
Faq.belongsTo(FaqCategory, { foreignKey: 'category_id', as: 'category' });

// Relaciones de Pedidos y Pagos
Order.hasOne(Payment, { foreignKey: 'order_id' });
Payment.belongsTo(Order, { foreignKey: 'order_id' });

Order.hasOne(OrderHistory, { foreignKey: 'order_id' });
OrderHistory.belongsTo(Order, { foreignKey: 'order_id' });

// Relaciones de Respaldo y Restauración
BackupLog.hasMany(RestorationLog, { foreignKey: 'backup_id' });
RestorationLog.belongsTo(BackupLog, { foreignKey: 'backup_id' });

// Exportación de Modelos
module.exports = {
  User,
  Account,
  TwoFactorConfig,
  PasswordStatus,
  PasswordRecovery,
  PasswordHistory,
  Session,
  FailedAttempt,
  Address,
  EmailType,
  EmailTemplate,
  RegulatoryDocument,
  DocumentVersion,
  FaqCategory,
  Faq,
  SupportInquiry,
  Order,
  OrderHistory,
  Payment,
  Banner,
  BackupLog,
  RestorationLog
};