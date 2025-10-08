const { Op, fn, col, literal } = require('sequelize');
const { Badge, BadgeCategory, User, UserBadge } = require('../models/Associations');
const { uploadBadgeIconToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');
const loggerUtils = require('../utils/loggerUtils');
const sequelize = require('../config/dataBase');

class BadgeService {
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
    
    async getActiveBadges(transaction = null) {
        const activeBadges = await Badge.findAll({
            where: { is_active: true },
            attributes: ['badge_id', 'name'],
            order: [['name', 'ASC']],
            transaction
        });

        return activeBadges;
    }


    async getBadgeById(id, transaction = null) {
        const badge = await Badge.findByPk(id, {
            include: [{ model: BadgeCategory, attributes: ['name'] }],
            transaction
        });
        if (!badge || !badge.is_active) return null;
        return badge;
    }

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
            await deleteFromCloudinary(badge.public_id);
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

    async deleteBadge(id, transaction = null) {
        const badge = await Badge.findByPk(id, { transaction });
        if (!badge) {
            throw new Error('Insignia no encontrada');
        }

        await badge.update({ is_active: false }, { transaction });
        return { message: `Insignia '${badge.name}' desactivada exitosamente` };
    }

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

        return { count: count.length, rows };
    }

    async getGrantedBadgesHistory({
        search = '',
        user_id = null,
        badge_id = null,
        badge_category_id = null,
        start_date = null,
        end_date = null,
        order = 'last_obtained_at:DESC', // Nuevo valor por defecto
        page = 1,
        pageSize = 10
    } = {}, transaction = null) {
        const offset = (page - 1) * pageSize;
        
        // 1. Definición de filtros para UserBadge y Badge
        const whereUserBadge = {};
        const whereBadgeCategory = badge_category_id ? { badge_category_id } : {};
        const whereBadge = badge_id ? { badge_id } : {};
        
        if (user_id) {
            whereUserBadge.user_id = user_id;
        }
        
        if (start_date || end_date) {
            whereUserBadge.obtained_at = {};
            if (start_date) {
                whereUserBadge.obtained_at[Op.gte] = new Date(start_date);
            }
            if (end_date) {
                const endDateObj = new Date(end_date);
                endDateObj.setDate(endDateObj.getDate() + 1);
                whereUserBadge.obtained_at[Op.lt] = endDateObj;
            }
        }

        // 2. Definición de filtros para User
        const whereUser = {};
        if (search) {
            const searchConditions = [
                { name: { [Op.iLike]: `%${search}%` } },
                { email: { [Op.iLike]: `%${search}%` } },
            ];
            // Si la búsqueda es un número, incluye el user_id
            if (!isNaN(parseInt(search))) {
                searchConditions.push({ user_id: parseInt(search) });
            }
            whereUser[Op.or] = searchConditions;
        }

        // 3. Procesar ordenación para GROUP BY
        // El ordenamiento debe ser sobre las columnas de agregación (COUNT, MAX(obtained_at)) o User
        let orderBy = [];
        if (order) {
            const [column, direction = 'DESC'] = order.split(':').map(s => s.trim().toUpperCase());
            
            if (column === 'TOTAL_BADGES') {
                orderBy.push([sequelize.literal('total_badges'), direction]);
            } else if (column === 'LAST_OBTAINED_AT') {
                orderBy.push([sequelize.literal('last_obtained_at'), direction]);
            } else if (column === 'USER_ID') {
                orderBy.push(['user_id', direction]);
            } else {
                // Orden por defecto si es inválido
                orderBy.push([sequelize.literal('last_obtained_at'), 'DESC']);
            }
        } else {
            orderBy.push([sequelize.literal('last_obtained_at'), 'DESC']);
        }

        // 4. Consulta principal: Obtener usuarios únicos con filtros aplicados
        const options = {
            attributes: [
                'user_id', // El campo principal para agrupar
                [sequelize.fn('COUNT', sequelize.col('user_badge_id')), 'total_badges'],
                [sequelize.fn('MAX', sequelize.col('UserBadges.obtained_at')), 'last_obtained_at']
            ],
            where: whereUser,
            include: [{
                model: UserBadge,
                attributes: [], // No necesitamos atributos de la tabla join en la consulta principal
                where: whereUserBadge,
                required: true, // Sólo usuarios con al menos una insignia que coincida con los filtros
                include: [{
                    model: Badge,
                    attributes: [],
                    where: whereBadge,
                    required: true,
                    include: [{
                        model: BadgeCategory,
                        attributes: [],
                        where: whereBadgeCategory,
                        required: true
                    }]
                }]
            }],
            group: ['User.user_id'],
            order: orderBy,
            limit: pageSize,
            offset: offset,
            subQuery: false, // Esencial para la paginación con GROUP BY
            distinct: true,
            transaction
        };

        // Realizar la consulta para los usuarios paginados y su conteo total
        const { count: countUsers, rows: users } = await User.findAndCountAll(options);
        
        // Sequelize con GROUP BY devuelve un array de objetos con `count` para la paginación.
        const totalUsers = Array.isArray(countUsers) ? countUsers.length : countUsers;

        // 5. Obtener las insignias detalladas para los usuarios paginados (una segunda consulta, más eficiente)
        const userIds = users.map(user => user.user_id);

        if (userIds.length === 0) {
            return { totalUsers: 0, groupedHistory: [] };
        }

        const detailedBadges = await UserBadge.findAll({
            where: { 
                user_id: { [Op.in]: userIds },
                ...whereUserBadge // Reaplicar filtros de fecha si existen
            },
            order: [['obtained_at', 'DESC']], // Ordenar las insignias dentro de cada usuario
            include: [
                { model: User, attributes: ['user_id', 'email', 'name'] }, // Necesario para el formato final
                { 
                    model: Badge, 
                    attributes: ['badge_id', 'name', 'icon_url'], 
                    where: whereBadge, 
                    include: [{ 
                        model: BadgeCategory, 
                        attributes: ['name'], 
                        where: whereBadgeCategory
                    }]
                }
            ],
            transaction
        });

        // 6. Agrupar el historial detallado por usuario y dar formato final
        const groupedHistoryMap = new Map();
        
        detailedBadges.forEach(item => {
            const user_id = item.User.user_id;
            
            if (!groupedHistoryMap.has(user_id)) {
                groupedHistoryMap.set(user_id, {
                    user_id: user_id,
                    user_email: item.User.email,
                    user_name: item.User.name,
                    total_badges: 0, // Se actualizará en el siguiente paso
                    last_obtained_at: null, // Se actualizará
                    badges: []
                });
            }

            const userGroup = groupedHistoryMap.get(user_id);
            
            // Agregar detalle de la insignia
            userGroup.badges.push({
                user_badge_id: item.user_badge_id,
                badge_id: item.Badge.badge_id,
                badge_name: item.Badge.name,
                badge_category: item.Badge.BadgeCategory ? item.Badge.BadgeCategory.name : 'N/A', 
                icon_url: item.Badge.icon_url,
                obtained_at: item.obtained_at
            });
        });

        // 7. Combinar datos de la primera consulta (totales/orden) con el detalle (segunda consulta)
        const groupedHistory = users.map(user => {
            const userDetail = groupedHistoryMap.get(user.user_id) || {};
            
            return {
                user_id: user.user_id,
                user_email: userDetail.user_email || 'N/A',
                user_name: userDetail.user_name || 'N/A',
                total_badges: parseInt(user.getDataValue('total_badges'), 10),
                last_obtained_at: user.getDataValue('last_obtained_at'),
                badges: userDetail.badges || []
            };
        });
        
        return { totalUsers, groupedHistory };
    }

    async getBadgeMetrics(transaction = null) {
        const totalBadgesObtained = await UserBadge.count({ transaction });

        const uniqueUsersCount = await UserBadge.count({
            distinct: true,
            col: 'user_id',
            transaction
        });

        const topBadges = await UserBadge.findAll({
            attributes: [
                'badge_id',
                [sequelize.fn('COUNT', sequelize.col('user_badge_id')), 'count']
            ],
            group: ['badge_id', 'Badge.badge_id', 'Badge->BadgeCategory.badge_category_id'], 
            order: [[sequelize.literal('count'), 'DESC']],
            limit: 5,
            include: [{
                model: Badge,
                attributes: ['name', 'icon_url'],
                include: [{ model: BadgeCategory, attributes: ['name'] }]
            }],
            raw: true,
            transaction,
        });

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

    async getAcquisitionTrend(days = 30, transaction = null) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);

        // Obtener el conteo real por día
        const results = await UserBadge.findAll({
            attributes: [
                [sequelize.fn('DATE', sequelize.col('obtained_at')), 'date'],
                [sequelize.fn('COUNT', sequelize.col('user_badge_id')), 'count']
            ],
            where: {
                obtained_at: {
                    [Op.between]: [startDate, endDate]
                }
            },
            group: [sequelize.fn('DATE', sequelize.col('obtained_at'))],
            order: [[literal('date'), 'ASC']],
            raw: true,
            transaction,
        });

        // Convertir a un mapa (para poder rellenar días vacíos)
        const countByDate = new Map();
        results.forEach(item => {
            const date = new Date(item.date).toISOString().slice(0, 10); // YYYY-MM-DD
            countByDate.set(date, parseInt(item.count, 10));
        });

        // Generar todos los días del rango (incluso si no hay registros)
        const trendData = [];
        for (let i = 0; i <= days; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const formattedDate = currentDate.toISOString().slice(0, 10);

            trendData.push({
                date: formattedDate,
                count: countByDate.get(formattedDate) || 0
            });
        }

        return trendData;
    }
}

module.exports = BadgeService;