const { Category } = require('../models/Category');

async function buildCategoryBreadcrumb(categoryId) {
  const breadcrumb = [];

  let current = await Category.findByPk(categoryId);

  while (current) {
    breadcrumb.unshift(current.name);
    if (!current.parent_id) break;
    current = await Category.findByPk(current.parent_id);
  }

  return ['Inicio', ...breadcrumb];
}

module.exports = { buildCategoryBreadcrumb };
