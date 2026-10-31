const { QdrantClient } = require('@qdrant/js-client-rest');
const config = require('./index');

// Shared Qdrant client
const qdrant = new QdrantClient({
  url: config.qdrant.url,
  apiKey: config.qdrant.apiKey,
  checkCompatibility: false,
});

module.exports = qdrant;
