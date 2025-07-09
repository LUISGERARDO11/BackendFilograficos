const Category = require('../models/Category');

async function buildCategoryBreadcrumb(categoryId) {
  const breadcrumb = [];

  let current = await Category.findByPk(categoryId);

  while (current) {
    breadcrumb.unshift({ id: current.category_id, name: current.name });
    if (!current.parent_id) break;
    current = await Category.findByPk(current.parent_id);
  }

  // Incluye "Inicio" como raíz
  breadcrumb.unshift({ id: null, name: 'Inicio' });

  return breadcrumb;
}

module.exports = { buildCategoryBreadcrumb };
