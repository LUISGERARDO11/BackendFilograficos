/* This JavaScript code defines a module that validates product images based on certain criteria.
Here's a breakdown of what each part of the code is doing: */
const multer = require('multer');

// Contar imágenes por variante
const countImagesByVariant = (files) => {
    if (!Array.isArray(files)) return {};

    const imagesByVariant = {};
    files.forEach((file) => {
        const match = file.fieldname.match(/variants\[(\d+)\]\[images\]/);
        if (match) {
            const index = parseInt(match[1], 10);
            imagesByVariant[index] = (imagesByVariant[index] || 0) + 1;
        }
    });
    return imagesByVariant;
};

// Parsear variantes con manejo de errores
const parseVariants = (variantsBody, res) => {
    if (!variantsBody) return [];

    try {
        const parsed = JSON.parse(variantsBody);
        if (!Array.isArray(parsed)) {
            res.status(400).json({ message: 'El campo variants debe ser un arreglo JSON válido' });
            return null;
        }
        return parsed;
    } catch (error) {
        res.status(400).json({ 
            message: 'Error al parsear variants', 
            error: error.message 
        });
        return null;
    }
};

// Validar imágenes por variante
const validateImagesForVariants = (variants, imagesByVariant, res) => {
    for (const [i, variant] of variants.entries()) {
        const imageCount = imagesByVariant[i] || 0;
        const variantSku = variant.sku || `índice ${i}`;

        if (imageCount < 1) {
            res.status(400).json({ 
                message: `La variante ${variantSku} debe tener al menos 1 imagen` 
            });
            return false;
        }
        if (imageCount > 10) {
            res.status(400).json({ 
                message: `La variante ${variantSku} excede el límite de 10 imágenes (actual: ${imageCount})` 
            });
            return false;
        }
    }
    return true;
};

// Validar nuevas variantes sin imágenes
const validateNewVariantsWithoutImages = (variants, res) => {
    const hasNewVariants = variants.some(v => !v.variant_id);
    if (hasNewVariants) {
        res.status(400).json({ 
            message: 'Se requieren imágenes para nuevas variantes' 
        });
        return false;
    }
    return true;
};

// Manejar caso con archivos
const handleFilesCase = (req, res) => {
    const imagesByVariant = countImagesByVariant(req.files);
    const variants = parseVariants(req.body.variants, res);
    if (variants === null) return false;

    return variants.length > 0 
        ? validateImagesForVariants(variants, imagesByVariant, res)
        : true;
};

// Manejar caso sin archivos
const handleNoFilesCase = (req, res) => {
    const variants = parseVariants(req.body.variants, res);
    if (variants === null) return false;
    return validateNewVariantsWithoutImages(variants, res);
};

const validateProductImages = (req, res, next) => {
    try {
        // Validación inicial
        const hasFiles = req.files && req.files.length > 0;
        const hasVariants = !!req.body.variants;

        if (!hasFiles && !hasVariants) {
            return next();
        }

        // Procesar según caso usando declaraciones separadas
        let isValid;
        if (hasFiles) {
            isValid = handleFilesCase(req, res);
        } else if (hasVariants) {
            isValid = handleNoFilesCase(req, res);
        } else {
            isValid = true;
        }

        if (isValid) {
            next();
        }
    } catch (error) {
        res.status(500).json({ 
            message: 'Error inesperado al validar imágenes del producto',
            error: error.message 
        });
    }
};

module.exports = validateProductImages;