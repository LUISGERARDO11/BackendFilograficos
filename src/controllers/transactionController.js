const { Order, OrderDetail, Product, ProductVariant } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');

// Controlador para exportar transacciones a CSV
exports.exportTransactions = async (req, res) => {
  try {

    // Obtener todas las órdenes con sus detalles y nombres de productos
    const orders = await Order.findAll({
      attributes: ['order_id'],
      include: [
        {
          model: OrderDetail,
          attributes: ['variant_id', 'quantity'],
          include: [
            {
              model: ProductVariant,
              attributes: ['variant_id'],
              include: [
                {
                  model: Product,
                  attributes: ['name'],
                },
              ],
            },
          ],
        },
      ],
    });

    // Agrupar por orden
    const transactionsMap = new Map();

    orders.forEach((order) => {
      const orderId = order.order_id;
      const productNames = order.OrderDetails.map((detail) =>
        detail.ProductVariant.Product.name
      );
      if (productNames.length > 0) {
        transactionsMap.set(orderId, productNames);
      }
    });

    // Crear las líneas CSV
    const lines = [];
    for (const products of transactionsMap.values()) {
      const line = products.join(',');
      lines.push(line);
    }

    // Generar el contenido del CSV
    const csvContent = lines.join('\n');

    // Configurar la respuesta para descargar el archivo
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=transaccionesFilograficos.csv');
    res.status(200).send(csvContent);

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al exportar transacciones', error: error.message });
  }
};