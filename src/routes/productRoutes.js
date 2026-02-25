const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { listProductsHandler, getProductHandler } = require('../controllers/productController');

const router = express.Router();

const listSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional()
});

const idSchema = z.object({
  id: z.string().regex(/^\d+$/)
});

router.get('/', validate(listSchema, 'query'), listProductsHandler);
router.get('/:id', validate(idSchema, 'params'), getProductHandler);

module.exports = { productRouter: router };
