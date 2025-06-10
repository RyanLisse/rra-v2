import { db } from './lib/db';
import {
  user,
  account,
  session,
  chat,
  message,
  vote,
  suggestion,
  stream,
  document,
  ragDocument,
  documentContent,
  documentChunk,
  documentEmbedding,
  documentImage,
} from './lib/db/schema';

async function resetUsers() {
  console.log('🗑️ DROPPING ALL USER DATA AND RELATED RECORDS');
  console.log('=============================================\n');

  try {
    // Delete in order to respect foreign key constraints (most dependent first)
    console.log('1. Deleting document embeddings...');
    await db.delete(documentEmbedding);
    console.log(`   ✅ Deleted document embeddings`);

    console.log('2. Deleting document chunks...');
    await db.delete(documentChunk);
    console.log(`   ✅ Deleted document chunks`);

    console.log('3. Deleting document content...');
    await db.delete(documentContent);
    console.log(`   ✅ Deleted document content`);

    console.log('4. Deleting document images...');
    await db.delete(documentImage);
    console.log(`   ✅ Deleted document images`);

    console.log('5. Deleting RAG documents...');
    await db.delete(ragDocument);
    console.log(`   ✅ Deleted RAG documents`);

    console.log('6. Deleting documents...');
    await db.delete(document);
    console.log(`   ✅ Deleted documents`);

    console.log('7. Deleting votes...');
    await db.delete(vote);
    console.log(`   ✅ Deleted votes`);

    console.log('8. Deleting suggestions...');
    await db.delete(suggestion);
    console.log(`   ✅ Deleted suggestions`);

    console.log('9. Deleting messages...');
    await db.delete(message);
    console.log(`   ✅ Deleted messages`);

    console.log('10. Deleting streams...');
    await db.delete(stream);
    console.log(`   ✅ Deleted streams`);

    console.log('11. Deleting chats...');
    await db.delete(chat);
    console.log(`   ✅ Deleted chats`);

    console.log('12. Deleting sessions...');
    await db.delete(session);
    console.log(`   ✅ Deleted sessions`);

    console.log('13. Deleting accounts...');
    await db.delete(account);
    console.log(`   ✅ Deleted accounts`);

    console.log('14. Deleting users...');
    await db.delete(user);
    console.log(`   ✅ Deleted users`);

    console.log('\n✅ ALL USER DATA AND RELATED RECORDS CLEARED');
    console.log('Ready for fresh authentication testing!');
  } catch (error) {
    console.error('❌ Error resetting users:', error);
  }
}

resetUsers().then(() => process.exit(0));
