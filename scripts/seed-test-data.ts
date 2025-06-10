#!/usr/bin/env bun

import { db } from '@/lib/db';
import {
  user,
  ragDocument,
  documentContent,
  documentChunk,
  documentEmbedding,
} from '@/lib/db/schema';
import { faker } from '@faker-js/faker';
import { parseArgs } from 'node:util';
import { createId } from '@paralleldrive/cuid2';
import { sql } from 'drizzle-orm';

interface SeedPreset {
  users: number;
  documents: number;
  chunksPerDocument: number;
  description: string;
}

const PRESETS: Record<string, SeedPreset> = {
  minimal: {
    users: 2,
    documents: 5,
    chunksPerDocument: 10,
    description: 'Minimal data for quick tests',
  },
  standard: {
    users: 10,
    documents: 50,
    chunksPerDocument: 20,
    description: 'Standard test dataset',
  },
  ci: {
    users: 5,
    documents: 20,
    chunksPerDocument: 15,
    description: 'CI/CD test dataset',
  },
  performance: {
    users: 50,
    documents: 500,
    chunksPerDocument: 50,
    description: 'Performance testing dataset',
  },
  stress: {
    users: 100,
    documents: 1000,
    chunksPerDocument: 100,
    description: 'Stress testing dataset',
  },
};

// Sample content for documents
const SAMPLE_CONTENT = {
  roborail: [
    'The RoboRail calibration process involves precise alignment of the chuck mechanism.',
    'PMAC communication errors can be resolved by checking the ethernet connection.',
    'Chuck alignment must be performed after any maintenance operation.',
    'The measurement system requires periodic calibration to maintain accuracy.',
    'Data collection is automated through the integrated software system.',
  ],
  technical: [
    'System diagnostics should be run before starting any calibration procedure.',
    'The operator interface provides real-time feedback during measurements.',
    'Emergency stop procedures are documented in the safety manual.',
    'Regular maintenance intervals are based on operational hours.',
    'Quality control checks are performed at each stage of the process.',
  ],
};

function generateEmbedding(dimension = 1024): number[] {
  // Generate a random embedding vector
  const embedding = new Array(dimension);
  for (let i = 0; i < dimension; i++) {
    embedding[i] = (Math.random() - 0.5) * 2; // Random values between -1 and 1
  }

  // Normalize the vector
  const magnitude = Math.sqrt(
    embedding.reduce((sum, val) => sum + val * val, 0),
  );
  return embedding.map((val) => val / magnitude);
}

async function seedUsers(count: number) {
  console.log(`Creating ${count} users...`);

  const users = [];
  for (let i = 0; i < count; i++) {
    users.push({
      id: createId(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
      image: faker.image.avatar(),
      createdAt: faker.date.past(),
      updatedAt: new Date(),
    });
  }

  await db.insert(user).values(users);
  return users;
}

async function seedDocuments(userIds: string[], preset: SeedPreset) {
  console.log(`Creating ${preset.documents} documents...`);

  const documents = [];
  const contents = [];
  const chunks = [];
  const embeddings = [];

  for (let i = 0; i < preset.documents; i++) {
    const docId = createId();
    const userId = userIds[Math.floor(Math.random() * userIds.length)];
    const contentType = Math.random() > 0.5 ? 'roborail' : 'technical';

    // Create document
    documents.push({
      id: docId,
      uploadedBy: userId,
      fileName: `${faker.system.fileName({ extensionCount: 0 })}.pdf`,
      originalName: `${faker.system.fileName({ extensionCount: 0 })}.pdf`,
      filePath: `/uploads/${docId}.pdf`,
      mimeType: 'application/pdf',
      fileSize: faker.number.int({ min: 100000, max: 10000000 }).toString(),
      status: 'processed' as const,
      createdAt: faker.date.past(),
      updatedAt: new Date(),
    });

    // Create content
    const fullContent = faker.helpers
      .arrayElements(SAMPLE_CONTENT[contentType], { min: 5, max: 10 })
      .join('\n\n');

    const contentId = createId();
    contents.push({
      id: contentId,
      documentId: docId,
      extractedText: fullContent,
      pageCount: faker.number.int({ min: 10, max: 100 }).toString(),
      charCount: fullContent.length.toString(),
      metadata: {
        extractedAt: new Date().toISOString(),
        method: 'pdf-parse',
      },
      createdAt: new Date(),
    });

    // Create chunks
    for (let j = 0; j < preset.chunksPerDocument; j++) {
      const chunkId = createId();
      const chunkContent = faker.helpers.arrayElement(
        SAMPLE_CONTENT[contentType],
      );

      chunks.push({
        id: chunkId,
        documentId: docId,
        content: chunkContent,
        chunkIndex: j.toString(),
        tokenCount: Math.floor(chunkContent.length / 4).toString(), // Rough estimate
        elementType: faker.helpers.arrayElement(['paragraph', 'title', 'list_item']),
        pageNumber: Math.floor(j / 5) + 1,
        metadata: {
          section: contentType,
          startOffset: j * 500,
          endOffset: (j + 1) * 500,
        },
        createdAt: new Date(),
      });

      // Create embedding
      embeddings.push({
        id: createId(),
        chunkId,
        documentId: docId,
        embedding: JSON.stringify(generateEmbedding()),
        embeddingType: 'text',
        dimensions: 1024,
        model: 'cohere-embed-v4.0',
        createdAt: new Date(),
      });
    }

    // Show progress
    if ((i + 1) % 10 === 0) {
      console.log(`  Created ${i + 1}/${preset.documents} documents`);
    }
  }

  // Batch insert
  console.log('Inserting documents...');
  await db.insert(ragDocument).values(documents);

  console.log('Inserting content...');
  await db.insert(documentContent).values(contents);

  console.log('Inserting chunks...');
  // Insert chunks in batches to avoid memory issues
  const chunkBatchSize = 1000;
  for (let i = 0; i < chunks.length; i += chunkBatchSize) {
    await db.insert(documentChunk).values(chunks.slice(i, i + chunkBatchSize));
  }

  console.log('Inserting embeddings...');
  // Insert embeddings in batches
  const embeddingBatchSize = 500;
  for (let i = 0; i < embeddings.length; i += embeddingBatchSize) {
    await db
      .insert(documentEmbedding)
      .values(embeddings.slice(i, i + embeddingBatchSize));
  }

  return documents;
}

async function verifyData() {
  const counts = await db.execute(sql`
    SELECT 
      (SELECT COUNT(*) FROM ${user}) as users,
      (SELECT COUNT(*) FROM ${ragDocument}) as documents,
      (SELECT COUNT(*) FROM ${documentChunk}) as chunks,
      (SELECT COUNT(*) FROM ${documentEmbedding}) as embeddings
  `);

  return counts[0];
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      preset: {
        type: 'string',
        short: 'p',
        default: 'standard',
      },
      clean: {
        type: 'boolean',
        short: 'c',
        default: false,
      },
    },
  });

  const presetName = values.preset || 'standard';
  const preset = PRESETS[presetName];

  if (!preset) {
    console.error(`Unknown preset: ${presetName}`);
    console.error(`Available presets: ${Object.keys(PRESETS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\nSeeding database with preset: ${presetName}`);
  console.log(`Description: ${preset.description}`);
  console.log(`Configuration:`);
  console.log(`  - Users: ${preset.users}`);
  console.log(`  - Documents: ${preset.documents}`);
  console.log(`  - Chunks per document: ${preset.chunksPerDocument}`);
  console.log(
    `  - Total chunks: ${preset.documents * preset.chunksPerDocument}`,
  );
  console.log('');

  try {
    if (values.clean) {
      console.log('Cleaning existing data...');
      await db.delete(documentEmbedding);
      await db.delete(documentChunk);
      await db.delete(documentContent);
      await db.delete(ragDocument);
      await db.delete(user);
    }

    const startTime = Date.now();

    // Seed users
    const users = await seedUsers(preset.users);
    const userIds = users.map((u) => u.id);

    // Seed documents
    await seedDocuments(userIds, preset);

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // Verify
    const counts = await verifyData();

    console.log('\n✅ Seeding completed successfully!');
    console.log(`Time taken: ${duration.toFixed(2)} seconds`);
    console.log('\nDatabase counts:');
    console.log(`  - Users: ${counts.users}`);
    console.log(`  - Documents: ${counts.documents}`);
    console.log(`  - Chunks: ${counts.chunks}`);
    console.log(`  - Embeddings: ${counts.embeddings}`);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

main();
