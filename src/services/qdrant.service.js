const qdrant = require('../config/qdrant');
const config = require('../config');

const collection = config.qdrant.collection;

// Qdrant answers 404 when the collection does not exist
const isMissingCollection = (err) => {
  return err.status === 404;
};

// Create the collection and payload index if they do not exist yet.
// Called at startup and before every upsert, so a deleted collection is recreated.
exports.ensureCollection = async () => {
  const { exists } = await qdrant.collectionExists(collection);
  if (exists) {
    return;
  }

  console.log(`Creating Qdrant collection "${collection}"`);

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
  await exports.ensureCollection();
  await qdrant.upsert(collection, { wait: true, points });
};

// Return the closest chunks to the query vector.
// No collection means no documents yet, so return an empty list.
exports.search = async (vector, limit) => {
  try {
    const result = await qdrant.query(collection, {
      query: vector,
      limit,
      with_payload: true,
    });
    return result.points;
  } catch (err) {
    if (isMissingCollection(err)) {
      return [];
    }
    throw err;
  }
};

exports.deleteByDocumentId = async (documentId) => {
  try {
    await qdrant.delete(collection, {
      wait: true,
      filter: {
        must: [{ key: 'document_id', match: { value: documentId } }],
      },
    });
  } catch (err) {
    if (isMissingCollection(err)) {
      return;
    }
    throw err;
  }
};
