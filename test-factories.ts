#!/usr/bin/env bun

/**
 * Test script to verify factory functionality and type safety
 */
import {
  userFactory,
  completeChatFactory,
  completeRAGDocumentFactory,
  performanceFactory,
} from './tests/factories';

async function testFactories() {
  console.log('🧪 Testing factory functionality...\n');

  try {
    // Test user factory
    console.log('1. Testing UserFactory...');
    const user = userFactory.create();
    console.log(`   ✓ Created user: ${user.name} (${user.email})`);

    // Test chat factory
    console.log('2. Testing CompleteChatFactory...');
    const chat = completeChatFactory.create();
    console.log(
      `   ✓ Created chat: ${chat.chat.title} with ${chat.messages.length} messages`,
    );

    // Test public chat factory
    console.log('3. Testing CompleteChatFactory.createPublic...');
    const publicChat = completeChatFactory.createPublic();
    console.log(
      `   ✓ Created public chat: ${publicChat.chat.title} (visibility: ${publicChat.chat.visibility})`,
    );

    // Test RAG document factory
    console.log('4. Testing CompleteRAGDocumentFactory...');
    const ragDoc = completeRAGDocumentFactory.create();
    console.log(
      `   ✓ Created RAG document: ${ragDoc.document.originalName} with ${ragDoc.chunks.length} chunks and ${ragDoc.embeddings.length} embeddings`,
    );

    // Test performance factory scenarios
    console.log('5. Testing PerformanceFactory scenarios...');
    const scenarios = performanceFactory.createLoadTestingScenarios();
    console.log(`   ✓ Created ${scenarios.length} load testing scenarios`);

    console.log('\n✅ All factory tests passed!');
  } catch (error) {
    console.error('\n❌ Factory test failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  testFactories();
}
