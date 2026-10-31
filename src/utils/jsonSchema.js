const Ajv = require('ajv');
const AppError = require('./AppError');

// removeAdditional: drop fields that are not listed in "properties"
// strict: false lets users add extra keywords such as "example" without errors
const ajv = new Ajv({ allErrors: true, removeAdditional: 'all', strict: false });

const TYPE_LIST = ['string', 'number', 'integer', 'boolean', 'array', 'object'];

// Return a copy of the schema where every field also accepts null.
// The model uses null when a value is not in the image, which is better than a guessed value.
const allowNull = (schema) => {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    return schema;
  }

  const copy = { ...schema };

  if (typeof copy.type === 'string' && TYPE_LIST.includes(copy.type)) {
    copy.type = [copy.type, 'null'];
  }
  if (Array.isArray(copy.type) && !copy.type.includes('null')) {
    copy.type = [...copy.type, 'null'];
  }
  if (Array.isArray(copy.enum) && !copy.enum.includes(null)) {
    copy.enum = [...copy.enum, null];
  }

  if (copy.properties !== null && typeof copy.properties === 'object') {
    const properties = {};
    for (const [key, value] of Object.entries(copy.properties)) {
      properties[key] = allowNull(value);
    }
    copy.properties = properties;
  }
  if (copy.items !== undefined) {
    copy.items = allowNull(copy.items);
  }

  return copy;
};

// Compile the user schema once per request. Throws 400 when the schema itself is invalid.
const compileSchema = (schema) => {
  if (schema.type !== 'object') {
    throw new AppError('schema must have "type": "object" at the top level', 400);
  }

  // The top level must stay an object, only the fields inside may be null
  const nullable = allowNull(schema);
  nullable.type = 'object';

  try {
    return { schema: nullable, validator: ajv.compile(nullable) };
  } catch (err) {
    throw new AppError(`schema is not a valid JSON Schema: ${err.message}`, 400);
  }
};

// Validate (and clean) data in place. Returns null when valid, otherwise a readable error list.
const validate = (validator, data) => {
  if (validator(data)) {
    return null;
  }
  return ajv.errorsText(validator.errors, { dataVar: 'json', separator: '; ' });
};

module.exports = { compileSchema, validate };
