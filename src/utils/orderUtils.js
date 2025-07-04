const moment = require('moment-timezone');
const { Op } = require('sequelize');

const orderUtils = {
  /**
   * Formatea un monto a moneda MXN.
   * @param {number} amount - El monto a formatear.
   * @returns {string} - El monto formateado como moneda MXN.
   */
  formatCurrency(amount) {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  },

  /**
   * Valida si un estado de orden es válido.
   * @param {string} status - El estado a validar.
   * @returns {boolean} - True si el estado es válido, false en caso contrario.
   */
  isValidOrderStatus(status) {
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered'];
    return validStatuses.includes(status);
  },

  /**
   * Construye la condición de fecha para consultas basada en el filtro de fecha.
   * @param {string} dateFilter - Filtro de fecha ('YYYY', 'YYYY-MM-DD', o 'YYYY-MM-DD,YYYY-MM-DD').
   * @param {string} field - Campo de fecha a filtrar ('created_at' o 'estimated_delivery_date').
   * @returns {Object} - Condición de fecha para Sequelize.
   * @throws {Error} - Si el formato de dateFilter es inválido.
   */
  buildDateCondition(dateFilter, field) {
    if (!dateFilter) return {};

    const parts = dateFilter.split(',');
    if (parts.length === 1) {
      // Validar como año (YYYY) o fecha única (YYYY-MM-DD)
      if (/^\d{4}$/.test(dateFilter)) {
        const year = parseInt(dateFilter);
        if (year >= 1000 && year <= 9999) {
          return {
            [field]: {
              [Op.between]: [
                moment.tz(`${year}-01-01`, 'UTC').startOf('year').toDate(),
                moment.tz(`${year}-12-31`, 'UTC').endOf('year').toDate(),
              ],
            },
          };
        }
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
        const date = moment.tz(dateFilter, 'UTC');
        if (date.isValid()) {
          return {
            [field]: {
              [Op.between]: [
                date.startOf('day').toDate(),
                date.endOf('day').toDate(),
              ],
            },
          };
        }
      }
      throw new Error('Formato de dateFilter inválido: debe ser YYYY o YYYY-MM-DD');
    } else if (parts.length === 2) {
      // Validar como rango de fechas (YYYY-MM-DD,YYYY-MM-DD)
      const [startDate, endDate] = parts;
      if (/^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        const start = moment.tz(startDate, 'UTC');
        const end = moment.tz(endDate, 'UTC');
        if (start.isValid() && end.isValid() && start <= end) {
          return {
            [field]: {
              [Op.between]: [
                start.startOf('day').toDate(),
                end.endOf('day').toDate(),
              ],
            },
          };
        }
      }
      throw new Error('Formato de rango de fechas inválido: debe ser YYYY-MM-DD,YYYY-MM-DD');
    }
    throw new Error('Formato de dateFilter no soportado');
  },

  /**
   * Calcula estadísticas de resumen para órdenes.
   * @param {Array} orders - Lista de órdenes.
   * @returns {Object} - Estadísticas de resumen (totales por estado).
   */
  calculateOrderSummary(orders) {
    return {
      totalOrders: orders.length,
      pendingCount: orders.filter(o => o.order_status === 'pending').length,
      processingCount: orders.filter(o => o.order_status === 'processing').length,
      shippedCount: orders.filter(o => o.order_status === 'shipped').length,
      deliveredCount: orders.filter(o => o.order_status === 'delivered').length,
    };
  },

  /**
   * Formatea los detalles de una orden para la respuesta.
   * @param {Object} order - Objeto de orden de Sequelize.
   * @returns {Object} - Orden formateada para la respuesta.
   */
  formatOrderDetails(order) {
    return {
      order_id: order.order_id,
      user_id: order.user_id,
      customer_name: order.User?.name || 'Cliente no disponible',
      total: parseFloat(order.total) || 0,
      discount: parseFloat(order.discount) || 0,
      shipping_cost: parseFloat(order.shipping_cost) || 0,
      payment_status: order.Payments?.[0]?.status || 'pending',
      payment_method: order.payment_method,
      order_status: order.order_status,
      estimated_delivery_date: order.estimated_delivery_date
        ? moment(order.estimated_delivery_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        : null,
      delivery_option: order.delivery_option || null,
      created_at: order.created_at
        ? moment(order.created_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        : null,
      order_details: order.OrderDetails?.map(detail => ({
        order_detail_id: detail.order_detail_id,
        product_name: detail.ProductVariant?.Product?.name || 'Producto no disponible',
        quantity: detail.quantity,
        unit_price: parseFloat(detail.unit_price) || 0,
        subtotal: parseFloat(detail.subtotal) || 0,
        discount_applied: parseFloat(detail.discount_applied) || 0,
        unit_measure: parseFloat(detail.unit_measure) || 1.00,
        is_urgent: detail.is_urgent,
        additional_cost: parseFloat(detail.additional_cost) || 0,
      })) || [],
      address: order.Address ? {
        address_id: order.Address.address_id,
        street: order.Address.street,
        city: order.Address.city,
        state: order.Address.state,
        postal_code: order.Address.postal_code,
      } : null,
      history: order.OrderHistories?.map(history => ({
        history_id: history.history_id,
        status: history.order_status,
        date: history.purchase_date
          ? moment(history.purchase_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
          : null,
      })) || [],
    };
  },
};

module.exports = orderUtils;