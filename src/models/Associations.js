/* This code snippet is setting up associations between different models in a Node.js application using Sequelize, which is an ORM for Node.js. */
const User = require('./Users');
const Account = require('./Account');
const Company = require('./Company');
const SocialMedia = require('./SocialMedia');
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
const Collaborator = require('./Collaborator');
const Category = require('./Category');
const Product = require('./Product');
const ProductVariant = require('./ProductVariant');
const ProductAttribute = require('./ProductAttribute');
const ProductAttributeValue = require('./ProductAttributeValue');
const ProductImage = require('./ProductImage');
const PriceHistory = require('./PriceHistory');
const CustomizationOption = require('./CustomizationOption');
const Customization = require('./Customization');
const UploadedFiles = require('./UploadedFiles');
const ShippingOption = require('./ShippingOption');
const DeliveryPoint = require('./DeliveryPoint');
const Cart = require('./Cart');
const CartDetail = require('./CartDetail');
const OrderDetail = require('./OrderDetail');
const Promotion = require('./Promotion');
const CouponUsage = require('./CouponUsage');
const Coupon = require('./Coupon');
const PromotionProduct = require('./PromotionProduct');
const PromotionCategory = require('./PromotionCategory');
const Review = require('./Review');
const ReviewMedia = require('./ReviewMedia');
const PushSubscription = require('./PushSubscription');
const NotificationLog = require('./NotificationLog');
const CategoryAttributes = require('./CategoryAttributes');
const CommunicationPreference = require('./CommunicationPreference');
const SystemConfig = require('./Systemconfig');
const BackupConfig = require('./BackupConfig');
const BackupFiles = require('./BackupFiles');
const RevokedToken = require('./RevokedToken');
const AlexaAuthCode = require('./AlexaAuthCode');

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

User.hasMany(PriceHistory, { foreignKey: 'changed_by' });
PriceHistory.belongsTo(User, { foreignKey: 'changed_by' });

User.hasMany(BackupConfig, { foreignKey: 'created_by' });
BackupConfig.belongsTo(User, { foreignKey: 'created_by' });

User.hasMany(RevokedToken, { foreignKey: 'user_id' });
RevokedToken.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(AlexaAuthCode, { foreignKey: 'user_id' });
AlexaAuthCode.belongsTo(User, { foreignKey: 'user_id' });

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

Order.hasMany(OrderHistory, { foreignKey: 'order_id' });
OrderHistory.belongsTo(Order, { foreignKey: 'order_id' });

Order.belongsTo(Address, { foreignKey: 'address_id' });
Address.hasMany(Order, { foreignKey: 'address_id' });

// Relaciones de Respaldo y Restauración
BackupLog.hasMany(RestorationLog, { foreignKey: 'backup_id' });
RestorationLog.belongsTo(BackupLog, { foreignKey: 'backup_id' });

BackupLog.hasMany(BackupFiles, { foreignKey: 'backup_id' });
BackupFiles.belongsTo(BackupLog, { foreignKey: 'backup_id' });

// Relaciones de Productos
Product.hasMany(ProductVariant, { foreignKey: 'product_id' });
ProductVariant.belongsTo(Product, { foreignKey: 'product_id' });

ProductVariant.hasMany(ProductAttributeValue, { foreignKey: 'variant_id' });
ProductAttributeValue.belongsTo(ProductVariant, { foreignKey: 'variant_id' });

ProductAttribute.hasMany(ProductAttributeValue, { foreignKey: 'attribute_id' });
ProductAttributeValue.belongsTo(ProductAttribute, { foreignKey: 'attribute_id' });

ProductVariant.hasMany(ProductImage, { foreignKey: 'variant_id' });
ProductImage.belongsTo(ProductVariant, { foreignKey: 'variant_id' });

ProductVariant.hasMany(PriceHistory, { foreignKey: 'variant_id' });
PriceHistory.belongsTo(ProductVariant, { foreignKey: 'variant_id' });

Product.hasMany(CustomizationOption, { foreignKey: 'product_id' });
CustomizationOption.belongsTo(Product, { foreignKey: 'product_id' });

Product.hasMany(ShippingOption, { foreignKey: 'product_id' });
ShippingOption.belongsTo(Product, { foreignKey: 'product_id' });

Product.belongsTo(Category, { foreignKey: 'category_id' });
Category.hasMany(Product, { foreignKey: 'category_id' });

Product.belongsTo(Collaborator, { foreignKey: 'collaborator_id' });
Collaborator.hasMany(Product, { foreignKey: 'collaborator_id' });

// Relaciones de Personalización
CustomizationOption.hasMany(Customization, { foreignKey: 'option_id' });
Customization.belongsTo(CustomizationOption, { foreignKey: 'option_id' });

CartDetail.hasOne(Customization, { foreignKey: 'cart_detail_id' });
Customization.belongsTo(CartDetail, { foreignKey: 'cart_detail_id' });

OrderDetail.hasOne(Customization, { foreignKey: 'order_detail_id' });
Customization.belongsTo(OrderDetail, { foreignKey: 'order_detail_id' });

Order.hasMany(Customization, { foreignKey: 'order_id' });
Customization.belongsTo(Order, { foreignKey: 'order_id' });

UploadedFiles.belongsTo(Customization, { foreignKey: 'customization_id' });
Customization.hasMany(UploadedFiles, { foreignKey: 'customization_id' });

CartDetail.belongsTo(CustomizationOption, { foreignKey: 'option_id' });
CustomizationOption.hasMany(CartDetail, { foreignKey: 'option_id' });

OrderDetail.belongsTo(CustomizationOption, { foreignKey: 'option_id' });
CustomizationOption.hasMany(OrderDetail, { foreignKey: 'option_id' });

CartDetail.belongsTo(Customization, { foreignKey: 'customization_id' });
Customization.hasOne(CartDetail, { foreignKey: 'customization_id' });

OrderDetail.belongsTo(Customization, { foreignKey: 'customization_id' });
Customization.hasOne(OrderDetail, { foreignKey: 'customization_id' });

// Relaciones de Opciones de Envío
ShippingOption.hasMany(DeliveryPoint, { foreignKey: 'shipping_option_id' });
DeliveryPoint.belongsTo(ShippingOption, { foreignKey: 'shipping_option_id' });

// Relaciones de Carrito
Cart.hasMany(CartDetail, { foreignKey: 'cart_id' });
CartDetail.belongsTo(Cart, { foreignKey: 'cart_id' });

Cart.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(Cart, { foreignKey: 'user_id' });

CartDetail.belongsTo(Product, { foreignKey: 'product_id' });
Product.hasMany(CartDetail, { foreignKey: 'product_id' });

CartDetail.belongsTo(ProductVariant, { foreignKey: 'variant_id' });
ProductVariant.hasMany(CartDetail, { foreignKey: 'variant_id' });

Cart.belongsTo(Promotion, { foreignKey: 'promotion_id' });
Promotion.hasMany(Cart, { foreignKey: 'promotion_id' });

Cart.belongsTo(Coupon, { foreignKey: 'coupon_code', targetKey: 'code' });
Coupon.hasMany(Cart, { foreignKey: 'coupon_code', targetKey: 'code' });

// Relaciones de Pedidos
Order.hasMany(OrderDetail, { foreignKey: 'order_id' });
OrderDetail.belongsTo(Order, { foreignKey: 'order_id' });

OrderDetail.belongsTo(ProductVariant, { foreignKey: 'variant_id' });
ProductVariant.hasMany(OrderDetail, { foreignKey: 'variant_id' });

Order.belongsTo(Coupon, { foreignKey: 'coupon_code', targetKey: 'code' });
Coupon.hasMany(Order, { foreignKey: 'coupon_code', targetKey: 'code' });

// Relaciones de Promociones
Promotion.belongsToMany(ProductVariant, { through: PromotionProduct, foreignKey: 'promotion_id', otherKey: 'variant_id' });
ProductVariant.belongsToMany(Promotion, { through: PromotionProduct, foreignKey: 'variant_id', otherKey: 'promotion_id' });

Promotion.belongsToMany(Category, { through: PromotionCategory, foreignKey: 'promotion_id', otherKey: 'category_id' });
Category.belongsToMany(Promotion, { through: PromotionCategory, foreignKey: 'category_id', otherKey: 'promotion_id' });

User.hasMany(Promotion, { foreignKey: 'created_by' });
Promotion.belongsTo(User, { foreignKey: 'created_by' });

// Relaciones de Coupons
Promotion.hasMany(Coupon, { foreignKey: 'promotion_id' });
Coupon.belongsTo(Promotion, { foreignKey: 'promotion_id' });

// Relaciones de CouponUsage
Promotion.hasMany(CouponUsage, { foreignKey: 'promotion_id' });
CouponUsage.belongsTo(Promotion, { foreignKey: 'promotion_id' });

Coupon.hasMany(CouponUsage, { foreignKey: 'coupon_id' });
CouponUsage.belongsTo(Coupon, { foreignKey: 'coupon_id' });

User.hasMany(CouponUsage, { foreignKey: 'user_id' });
CouponUsage.belongsTo(User, { foreignKey: 'user_id' });

Order.hasMany(CouponUsage, { foreignKey: 'order_id' });
CouponUsage.belongsTo(Order, { foreignKey: 'order_id' });

Cart.hasMany(CouponUsage, { foreignKey: 'cart_id' });
CouponUsage.belongsTo(Cart, { foreignKey: 'cart_id' });

// Relaciones de PromotionProduct
Promotion.hasMany(PromotionProduct, { foreignKey: 'promotion_id' });
PromotionProduct.belongsTo(Promotion, { foreignKey: 'promotion_id' });

ProductVariant.hasMany(PromotionProduct, { foreignKey: 'variant_id' });
PromotionProduct.belongsTo(ProductVariant, { foreignKey: 'variant_id' });

// Relaciones de PromotionCategory
Promotion.hasMany(PromotionCategory, { foreignKey: 'promotion_id' });
PromotionCategory.belongsTo(Promotion, { foreignKey: 'promotion_id' });

Category.hasMany(PromotionCategory, { foreignKey: 'category_id' });
PromotionCategory.belongsTo(Category, { foreignKey: 'category_id' });

// Relaciones de Reseñas
User.hasMany(Review, { foreignKey: 'user_id' });
Review.belongsTo(User, { foreignKey: 'user_id' });

Product.hasMany(Review, { foreignKey: 'product_id' });
Review.belongsTo(Product, { foreignKey: 'product_id' });

Order.hasMany(Review, { foreignKey: 'order_id' });
Review.belongsTo(Order, { foreignKey: 'order_id' });

Review.hasMany(ReviewMedia, { foreignKey: 'review_id' });
ReviewMedia.belongsTo(Review, { foreignKey: 'review_id' });

// Relaciones de Push Subscriptions
User.hasMany(PushSubscription, { foreignKey: 'user_id' });
PushSubscription.belongsTo(User, { foreignKey: 'user_id' });

// Relaciones de Notification Log
User.hasMany(NotificationLog, { foreignKey: 'user_id' });
NotificationLog.belongsTo(User, { foreignKey: 'user_id' });

// Relaciones de CommunicationPreference
User.hasOne(CommunicationPreference, { foreignKey: 'user_id' });
CommunicationPreference.belongsTo(User, { foreignKey: 'user_id' });

// Asociaciones para CategoryAttributes
CategoryAttributes.belongsTo(Category, { foreignKey: 'category_id' });
CategoryAttributes.belongsTo(ProductAttribute, { foreignKey: 'attribute_id' });

Category.belongsToMany(ProductAttribute, { through: CategoryAttributes, foreignKey: 'category_id', otherKey: 'attribute_id' });
ProductAttribute.belongsToMany(Category, { through: CategoryAttributes, foreignKey: 'attribute_id', otherKey: 'category_id' });

// Hailie breadcrumbs
Category.hasMany(Category, { as: 'children', foreignKey: 'parent_id' });
Category.belongsTo(Category, { as: 'parent', foreignKey: 'parent_id' });

// Relaciones de Company y SocialMedia
Company.hasMany(SocialMedia, { foreignKey: 'company_id' });
SocialMedia.belongsTo(Company, { foreignKey: 'company_id' });

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
  RestorationLog,
  Collaborator,
  Category,
  Product,
  ProductVariant,
  ProductAttribute,
  ProductAttributeValue,
  ProductImage,
  PriceHistory,
  CustomizationOption,
  Customization,
  UploadedFiles,
  ShippingOption,
  DeliveryPoint,
  Cart,
  CartDetail,
  OrderDetail,
  Promotion,
  Coupon,
  CouponUsage,
  PromotionProduct,
  PromotionCategory,
  Review,
  ReviewMedia,
  PushSubscription,
  NotificationLog,
  CategoryAttributes,
  CommunicationPreference,
  SystemConfig,
  Company,
  SocialMedia,
  BackupConfig,
  BackupFiles,
  RevokedToken,
  AlexaAuthCode
};