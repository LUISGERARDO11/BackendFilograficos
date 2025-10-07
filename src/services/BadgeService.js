const { Op } = require('sequelize');
// Se asume que '../models/Associations' contiene los modelos relacionados:
// UserBadge -> User, UserBadge -> Badge, Badge -> BadgeCategory, etc.
const { Badge, BadgeCategory, User, UserBadge, Order } = require('../models/Associations');
const { uploadBadgeIconToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');
const loggerUtils = require('../utils/loggerUtils');
const sequelize = require('../config/dataBase');

class BadgeService {
    /**
     * @description Obtiene una lista paginada de insignias, incluyendo la categoría.
     * @param {object} params - Parámetros de paginación y filtro.
     */
    async getBadges({ where = {}, order = [['badge_id', 'ASC']], page = 1, pageSize = 10 } = {}, transaction = null) {
        const offset = (page - 1) * pageSize;

        const { count, rows } = await Badge.findAndCountAll({
            where,
            order,
            limit: pageSize,
            offset,
            include: [{ model: BadgeCategory, attributes: ['name'] }],
            transaction
        });

        return { count, rows };
    }

    /**
     * @description Obtiene una insignia por ID.
     */
    async getBadgeById(id, transaction = null) {
        const badge = await Badge.findByPk(id, {
            include: [{ model: BadgeCategory, attributes: ['name'] }],
            transaction
        });
        if (!badge || !badge.is_active) return null;
        return badge;
    }

    /**
     * @description Crea una nueva insignia y sube su ícono a Cloudinary.
     */
    async createBadge(badgeData, fileBuffer, transaction = null) {
        const { name, description, badge_category_id } = badgeData;

        const existingBadge = await Badge.findOne({
            where: { name },
            transaction
        });
        if (existingBadge) {
            throw new Error('El nombre de la insignia ya está en uso');
        }

        const category = await BadgeCategory.findByPk(badge_category_id, { transaction });
        if (!category || !category.is_active) {
            throw new Error('La categoría no existe o está inactiva');
        }

        // Simulación de subida: Asegúrate de tener implementada esta dependencia
        const result = await uploadBadgeIconToCloudinary(fileBuffer, name); 
        
        const badge = await Badge.create({
            name,
            description,
            icon_url: result.secure_url,
            public_id: result.public_id,
            badge_category_id,
            is_active: true
        }, { transaction });

        return await this.getBadgeById(badge.badge_id, transaction);
    }

    /**
     * @description Actualiza una insignia existente.
     */
    async updateBadge(id, data, fileBuffer, transaction = null) {
        const badge = await Badge.findByPk(id, { transaction });
        if (!badge) {
            throw new Error('Insignia no encontrada');
        }
        if (!badge.is_active) {
            throw new Error('No se puede actualizar una insignia inactiva');
        }

        const { name, description, badge_category_id } = data;

        if (name && name !== badge.name) {
            const existingBadge = await Badge.findOne({
                where: { name, badge_id: { [Op.ne]: id } },
                transaction
            });
            if (existingBadge) {
                throw new Error('El nombre de la insignia ya está en uso');
            }
        }

        if (badge_category_id) {
            const category = await BadgeCategory.findByPk(badge_category_id, { transaction });
            if (!category || !category.is_active) {
                throw new Error('La categoría no existe o está inactiva');
            }
        }

        let icon_url = badge.icon_url;
        let public_id = badge.public_id;

        if (fileBuffer) {
            // Se asume que deleteFromCloudinary está implementado
            await deleteFromCloudinary(badge.public_id);
            // Se asume que uploadBadgeIconToCloudinary está implementado
            const result = await uploadBadgeIconToCloudinary(fileBuffer, name || badge.name);
            icon_url = result.secure_url;
            public_id = result.public_id;
        }

        await badge.update({
            name: name || badge.name,
            description: description !== undefined ? description : badge.description,
            icon_url,
            public_id,
            badge_category_id: badge_category_id || badge.badge_category_id
        }, { transaction });

        return await this.getBadgeById(id, transaction);
    }

    /**
     * @description Desactiva una insignia (eliminación lógica).
     */
    async deleteBadge(id, transaction = null) {
        const badge = await Badge.findByPk(id, { transaction });
        if (!badge) {
            throw new Error('Insignia no encontrada');
        }

        await badge.update({ is_active: false }, { transaction });
        return { message: `Insignia '${badge.name}' desactivada exitosamente` };
    }

    /**
     * @description Obtiene categorías de insignias con el conteo de insignias asociadas.
     */
    async getBadgeCategoriesWithCount({ where = {}, order = [['badge_category_id', 'ASC']], page = 1, pageSize = 10 } = {}, transaction = null) {
        const offset = (page - 1) * pageSize;

        const { count, rows } = await BadgeCategory.findAndCountAll({
            where,
            order,
            limit: pageSize,
            offset,
            attributes: {
                include: [
                    [sequelize.fn('COUNT', sequelize.col('badges.badge_id')), 'badge_count']
                ]
            },
            include: [{
                model: Badge,
                attributes: [],
                required: false
            }],
            group: ['BadgeCategory.badge_category_id'],
            transaction
        });

        // Sequelize devuelve count como un arreglo si se usa group, se ajusta aquí:
        return { count: count.length, rows };
    }

    // --------------------------------------------------------------------------
    // MÉTODOS PARA LA HISTORIA DE USUARIO: Consulta de insignias otorgadas
    // --------------------------------------------------------------------------

    /**
     * @description Obtiene el historial paginado de insignias otorgadas.
     * Incluye filtros avanzados (usuario, insignia, categoría, rango de fechas).
     * @param {object} params - Parámetros de paginación y filtros.
     * @returns {Promise<{count: number, rows: object[]}>} Lista paginada del historial de UserBadge.
     */
    async getGrantedBadgesHistory({
        search = '', // Filtro por nombre/email de usuario
        user_id = null, // Nuevo: Captura user_id del controlador
        badge_id = null,
        badge_category_id = null,
        start_date = null,
        end_date = null,
        order = [['obtained_at', 'DESC']],
        page = 1,
        pageSize = 10
    } = {}, transaction = null) {
        const offset = (page - 1) * pageSize;
        // La condición para el filtro user_id se mueve aquí desde 'where' del controlador.
        const whereUserBadge = {}; 

        // 1. Filtro de Rango de Fechas (en UserBadge.obtained_at)
        if (start_date || end_date) {
            whereUserBadge.obtained_at = {};
            if (start_date) {
                whereUserBadge.obtained_at[Op.gte] = new Date(start_date);
            }
            if (end_date) {
                // Se asegura de incluir todo el día de end_date
                const endDateObj = new Date(end_date);
                endDateObj.setDate(endDateObj.getDate() + 1);
                whereUserBadge.obtained_at[Op.lt] = endDateObj;
            }
        }
        
        // 2. Filtro de Insignia y Usuario Específicos (en UserBadge)
        if (user_id) {
            whereUserBadge.user_id = user_id;
        }
        if (badge_id) {
            whereUserBadge.badge_id = badge_id;
        }

        // 3. Definición de Inclusiones y Filtros de Joins
        const include = [
            {
                model: Badge,
                attributes: ['badge_id', 'name', 'icon_url'],
                required: true,
                include: [{
                    model: BadgeCategory,
                    attributes: ['badge_category_id', 'name'],
                    required: true,
                    where: badge_category_id ? { badge_category_id } : {} // Filtro por Categoría
                }]
            },
            {
                model: User,
                attributes: ['user_id', 'email', 'name'],
                required: true,
                where: search ? {
                    [Op.or]: [
                        { name: { [Op.iLike]: `%${search}%` } },
                        { email: { [Op.iLike]: `%${search}%` } }
                    ]
                } : {} 
            }
        ];

        const { count, rows } = await UserBadge.findAndCountAll({
            where: whereUserBadge,
            order,
            limit: pageSize,
            offset,
            include,
            transaction,
            // Importante para el conteo correcto cuando se filtran las relaciones
            distinct: true 
        });

        // **[CORRECCIÓN APLICADA]**
        return { count, rows }; // Retorna 'count' y 'rows' (estándar de Sequelize).
    }


    /**
     * @description Obtiene métricas generales y la distribución de las insignias (Top 5).
     * @returns {Promise<{totalBadgesObtained: number, uniqueUsersCount: number, badgeDistribution: object[]}>}
     */
    async getBadgeMetrics(transaction = null) {
        // 1. Total de Insignias Otorgadas
        const totalBadgesObtained = await UserBadge.count({ transaction });

        // 2. Conteo de Usuarios Únicos que han obtenido al menos una insignia
        const uniqueUsersCount = await UserBadge.count({
            distinct: true,
            col: 'user_id',
            transaction
        });

        // 3. Top 5 de Insignias más Otorgadas (Distribución)
        const topBadges = await UserBadge.findAll({
            attributes: [
                'badge_id',
                [sequelize.fn('COUNT', sequelize.col('user_badge_id')), 'count']
            ],
            // Aseguramos que la agrupación incluya las IDs de las tablas relacionadas para evitar errores
            group: ['badge_id', 'Badge.badge_id', 'Badge->BadgeCategory.badge_category_id'], 
            order: [[sequelize.literal('count'), 'DESC']],
            limit: 5,
            include: [{
                model: Badge,
                attributes: ['name', 'icon_url'],
                include: [{ model: BadgeCategory, attributes: ['name'] }]
            }],
            raw: true, // Devuelve objetos planos para fácil manejo de los campos joineados
            transaction,
        });

        // Formatea el resultado crudo
        const badgeDistribution = topBadges.map(item => ({
            badge_id: item.badge_id,
            badge_name: item['Badge.name'],
            category_name: item['Badge.BadgeCategory.name'],
            icon_url: item['Badge.icon_url'],
            count: parseInt(item.count, 10)
        }));

        return {
            totalBadgesObtained,
            uniqueUsersCount,
            badgeDistribution
        };
    }

    /**
     * @description Obtiene la tendencia de adquisición de insignias (conteo diario) para los últimos 'days' días.
     * @param {number} days - Número de días a incluir en la tendencia.
     * @returns {Promise<object[]>} Arreglo con la fecha (YYYY-MM-DD) y el conteo de insignias otorgadas.
     */
    async getAcquisitionTrend(days = 30, transaction = null) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const trendData = await UserBadge.findAll({
            attributes: [
                // Usamos la función de base de datos para extraer la fecha y agrupar
                [sequelize.fn('DATE', sequelize.col('obtained_at')), 'date'],
                [sequelize.fn('COUNT', sequelize.col('user_badge_id')), 'count']
            ],
            where: {
                obtained_at: {
                    [Op.gte]: startDate
                }
            },
            group: [sequelize.fn('DATE', sequelize.col('obtained_at'))],
            order: [[sequelize.literal('date'), 'ASC']],
            raw: true,
            transaction,
        });

        // Convierte el conteo a número entero para el frontend
        return trendData.map(item => ({
            date: item.date,
            count: parseInt(item.count, 10)
        }));
    }
}

module.exports = BadgeService;
