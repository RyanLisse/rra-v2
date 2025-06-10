import { db } from './lib/db';

async function cascadeReset() {
  console.log('🗑️ CASCADE USER DATA RESET');
  console.log('==========================\n');

  try {
    console.log('1. Deleting all users (CASCADE will handle dependencies)...');

    // This should cascade delete all related records
    const result = await db.execute(`DELETE FROM "User"`);
    console.log(`   ✅ Deleted users`);

    // Verify what's left
    console.log('\n2. Verifying cleanup...');

    const counts = await db.execute(`
      SELECT 
        (SELECT COUNT(*) FROM "User") as users,
        (SELECT COUNT(*) FROM "Account") as accounts,
        (SELECT COUNT(*) FROM "Session") as sessions,
        (SELECT COUNT(*) FROM "Chat") as chats,
        (SELECT COUNT(*) FROM "Message") as messages,
        (SELECT COUNT(*) FROM "Vote") as votes,
        (SELECT COUNT(*) FROM "Suggestion") as suggestions
    `);

    const row = counts[0];
    console.log(`   Users: ${row?.users || 0}`);
    console.log(`   Accounts: ${row?.accounts || 0}`);
    console.log(`   Sessions: ${row?.sessions || 0}`);
    console.log(`   Chats: ${row?.chats || 0}`);
    console.log(`   Messages: ${row?.messages || 0}`);
    console.log(`   Votes: ${row?.votes || 0}`);
    console.log(`   Suggestions: ${row?.suggestions || 0}`);

    console.log('\n✅ DATABASE RESET COMPLETE');
    console.log('Ready for fresh authentication testing!');
  } catch (error) {
    console.error('❌ Error resetting database:', error);
  }
}

cascadeReset().then(() => process.exit(0));
