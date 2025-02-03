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

// User Associations
User.hasOne(Account, { foreignKey: 'user_id' });
Account.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(Address, { foreignKey: 'user_id' });
Address.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(Session, { foreignKey: 'user_id' });
Session.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(FailedAttempt, { foreignKey: 'user_id' });
FailedAttempt.belongsTo(User, { foreignKey: 'user_id' });

// Account Associations
Account.hasMany(TwoFactorConfig, { foreignKey: 'account_id' });
TwoFactorConfig.belongsTo(Account, { foreignKey: 'account_id' });

Account.hasOne(PasswordStatus, { foreignKey: 'account_id' });
PasswordStatus.belongsTo(Account, { foreignKey: 'account_id' });

Account.hasMany(PasswordRecovery, { foreignKey: 'account_id' });
PasswordRecovery.belongsTo(Account, { foreignKey: 'account_id' });

Account.hasMany(PasswordHistory, { foreignKey: 'account_id' });
PasswordHistory.belongsTo(Account, { foreignKey: 'account_id' });

// Document Associations
RegulatoryDocument.hasMany(DocumentVersion, { foreignKey: 'document_id' });
DocumentVersion.belongsTo(RegulatoryDocument, { foreignKey: 'document_id' });

// Email Associations
EmailType.hasMany(EmailTemplate, { foreignKey: 'email_type_id' });
EmailTemplate.belongsTo(EmailType, { foreignKey: 'email_type_id' });

EmailTemplate.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
EmailTemplate.belongsTo(User, { foreignKey: 'updated_by', as: 'Updater' });
EmailType.belongsTo(User, { foreignKey: 'created_by' });

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
  DocumentVersion
};