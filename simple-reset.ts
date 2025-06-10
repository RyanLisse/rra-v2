import { db } from './lib/db';

async function simpleReset() {
  console.log('🗑️ SIMPLE USER DATA RESET');
  console.log('=========================\n');

  try {
    // Use raw SQL to delete everything in dependency order
    console.log('1. Clearing all user-related data...');

    await db.execute(`
      DO $$ 
      BEGIN 
        -- Disable foreign key checks
        SET session_replication_role = replica;
        
        -- Delete from tables that exist (ignore errors for tables that don't exist)
        DELETE FROM "Vote";
        DELETE FROM "Suggestion"; 
        DELETE FROM "Message";
        DELETE FROM "Stream";
        DELETE FROM "Chat";
        DELETE FROM "Session";
        DELETE FROM "Account";
        DELETE FROM "User";
        
        -- Re-enable foreign key checks
        SET session_replication_role = DEFAULT;
        
      EXCEPTION WHEN OTHERS THEN
        -- Reset foreign key checks even if there's an error
        SET session_replication_role = DEFAULT;
        RAISE;
      END $$;
    `);

    console.log('   ✅ All user data cleared');

    // Verify
    const userCount = await db.execute(`SELECT COUNT(*) as count FROM "User"`);
    console.log(
      `   ✅ Verification: ${userCount[0]?.count || 0} users remaining`,
    );

    console.log('\n✅ DATABASE RESET COMPLETE');
    console.log('Ready for fresh authentication testing!');
  } catch (error) {
    console.error('❌ Error resetting database:', error);
  }
}

simpleReset().then(() => process.exit(0));
