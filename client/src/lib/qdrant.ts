import { QdrantClient } from '@qdrant/js-client-rest';

export const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

export async function initQdrantCollection(collectionName: string) {
  try {
    const collections = await qdrantClient.getCollections();
    if (!collections.collections.find((c: any) => c.name === collectionName)) {
      await qdrantClient.createCollection(collectionName, {
        vectors: {
          size: 768, // Default for nomic-embed-text or llama3.1 embeddings
          distance: 'Cosine',
        },
      });
      return `✅ Collection ${collectionName} created.`;
    }
    return `ℹ️ Collection ${collectionName} already exists.`;
  } catch (err: any) {
    throw new Error(`Qdrant Init Error: ${err.message}`);
  }
}

export async function upsertToQdrant(collectionName: string, points: any[]) {
  try {
    await qdrantClient.upsert(collectionName, {
      wait: true,
      points: points,
    });
    return `✅ Vector data upserted to ${collectionName}.`;
  } catch (err: any) {
    throw new Error(`Qdrant Upsert Error: ${err.message}`);
  }
}

export async function searchQdrant(collectionName: string, vector: number[], limit: number = 5) {
  try {
    return await qdrantClient.search(collectionName, {
      vector: vector,
      limit: limit,
      with_payload: true,
    });
  } catch (err: any) {
    throw new Error(`Qdrant Search Error: ${err.message}`);
  }
}
