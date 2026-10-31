const qdrant = require('../config/qdrant');
const config = require('../config');

const collection = config.qdrant.collection;

// Create the collection and payload index on first start
exports.ensureCollection = async () => {
  const { exists } = await qdrant.collectionExists(collection);
  if (exists) {
    return;
  }

  await qdrant.createCollection(collection, {
    vectors: {
      size: config.ollama.embedDimension,
      distance: 'Cosine',
    },
  });

  await qdrant.createPayloadIndex(collection, {
    field_name: 'document_id',
    field_schema: 'integer',
    wait: true,
  });
};

// points: [{ id, vector, payload }]
exports.upsert = async (points) => {
  await qdrant.upsert(collection, { wait: true, points });
};

// Return the closest chunks to the query vector
exports.search = async (vector, limit) => {
  const result = await qdrant.query(collection, {
    query: vector,
    limit,
    with_payload: true,
  });
  return result.points;
};

exports.deleteByDocumentId = async (documentId) => {
  await qdrant.delete(collection, {
    wait: true,
    filter: {
      must: [{ key: 'document_id', match: { value: documentId } }],
    },
  });
};
