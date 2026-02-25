const { ValidationError } = require('../utils/errors');

/**
 * Validation middleware using Zod schemas
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @param {'body'|'query'|'params'} [location='body'] - Request property to validate
 */
function validate(schema, location = 'body') {
  return (req, res, next) => {
    const data = req[location];
    const result = schema.safeParse(data);

    if (!result.success) {
      const errors = result.error.flatten();
      return next(new ValidationError('Invalid request data', {
        fieldErrors: errors.fieldErrors,
        formErrors: errors.formErrors,
      }));
    }

    // Replace with parsed/transformed data (strips unknown fields)
    req[location] = result.data;
    next();
  };
}

/**
 * Validate multiple locations at once
 * @param {Object} schemas - Object with location keys and Zod schema values
 * @example validateMultiple({ body: bodySchema, query: querySchema })
 */
function validateMultiple(schemas) {
  return (req, res, next) => {
    const allErrors = {};
    let hasErrors = false;

    for (const [location, schema] of Object.entries(schemas)) {
      const data = req[location];
      const result = schema.safeParse(data);

      if (!result.success) {
        hasErrors = true;
        allErrors[location] = result.error.flatten();
      } else {
        req[location] = result.data;
      }
    }

    if (hasErrors) {
      return next(new ValidationError('Invalid request data', allErrors));
    }

    next();
  };
}

module.exports = { validate, validateMultiple };
