const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config');
const routes = require('./routes');
const notFound = require('./middlewares/notFound.middleware');
const errorHandler = require('./middlewares/error.middleware');

const app = express();

// Global middlewares
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API docs (enabled with SWAGGER_ENABLED=true)
if (config.swaggerEnabled) {
  const swaggerUi = require('swagger-ui-express');
  const swaggerSpec = require('./config/swagger');

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (req, res) => {
    res.json(swaggerSpec);
  });
}

// Routes
app.use('/api/v1', routes);

// Error handling (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
