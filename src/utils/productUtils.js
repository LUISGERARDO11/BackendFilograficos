const validatePagination = (page, pageSize) => {
    if (page < 1 || pageSize < 1) {
        throw new Error('Parámetros de paginación inválidos');
    }
};

const parseQueryParams = (query) => {
    const page = parseInt(query.page, 10) || 1;
    const pageSize = parseInt(query.pageSize, 10) || 10;
    const { sort, categoryId, search, minPrice, maxPrice, collaboratorId } = query;
    return { page, pageSize, sort, categoryId, search, minPrice, maxPrice, collaboratorId };
};

module.exports = { validatePagination, parseQueryParams };