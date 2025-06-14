const loggerUtils = require('../utils/loggerUtils');
const productServices = require('../services/productServices');
const productUtils = require('../utils/productUtils');

exports.getAllProducts = async (req, res) => {
    try {
        const params = productUtils.parseQueryParams(req.query);
        productUtils.validatePagination(params.page, params.pageSize);

        console.log('Filtros recibidos:', params);

        const { count, products } = await productServices.getProductsWithFilters({ 
            ...params, 
            includeCollaborator: true,
            search: params.search 
        });
        const formattedProducts = await productServices.formatProductList(products);

        res.status(200).json({
            message: 'Productos obtenidos exitosamente',
            products: formattedProducts,
            total: count.length,
            page: params.page,
            pageSize: params.pageSize,
        });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(error.message === 'Parámetros de paginación inválidos' ? 400 : 500).json({
            message: 'Error al obtener los productos',
            error: error.message,
        });
    }
};

exports.getProductById = async (req, res) => {
    try {
        const { product_id } = req.params;
        const product = await productServices.getProductById(product_id, true);

        if (!product) return res.status(404).json({ message: 'Producto no encontrado' });

        res.status(200).json({
            message: 'Producto obtenido exitosamente',
            product,
        });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al obtener el producto', error: error.message });
    }
};