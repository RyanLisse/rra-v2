import { db } from './lib/db';

async function manualReset() {
  console.log('🗑️ MANUAL DATABASE RESET');
  console.log('========================\n');

  try {
    // Delete in proper order
    const tables = [
      'Vote',
      'Suggestion',
      'Message',
      'Stream',
      'Chat',
      'Session',
      'Account',
      'User',
    ];

    for (const table of tables) {
      try {
        console.log(`Deleting from ${table}...`);
        await db.execute(`DELETE FROM "${table}"`);
        console.log(`   ✅ Cleared ${table}`);
      } catch (error: any) {
        if (error.message?.includes('does not exist')) {
          console.log(`   ⚠️  ${table} table doesn't exist`);
        } else {
          console.log(`   ❌ Error clearing ${table}:`, error.message);
        }
      }
    }

    // Final verification
    console.log('\n3. Final verification...');
    try {
      const userCount = await db.execute(
        `SELECT COUNT(*) as count FROM "User"`,
      );
      console.log(`   Users remaining: ${userCount[0]?.count || 0}`);
    } catch (e) {
      console.log(`   User table verification failed`);
    }

    console.log('\n✅ MANUAL RESET COMPLETE');
    console.log('Ready for fresh authentication testing!');
  } catch (error) {
    console.error('❌ Manual reset failed:', error);
  }
}

manualReset().then(() => process.exit(0));
