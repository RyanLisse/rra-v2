import { db } from './lib/db';
import { user, account } from './lib/db/schema';
import { eq } from 'drizzle-orm';

async function checkUsers() {
  console.log('🔍 Checking all users in database...\n');

  try {
    // Get all users
    const allUsers = await db.select().from(user);

    console.log(`Found ${allUsers.length} users:`);
    for (const u of allUsers) {
      console.log(
        `- ${u.email} (${u.id}) - Type: ${u.type}, Anonymous: ${u.isAnonymous}`,
      );

      // Check if they have accounts
      const accounts = await db
        .select()
        .from(account)
        .where(eq(account.userId, u.id));
      console.log(`  Accounts: ${accounts.length}`);
      for (const acc of accounts) {
        console.log(
          `    - Provider: ${acc.providerId}, Account ID: ${acc.accountId}`,
        );
      }
    }

    // Check for Ryan specifically
    console.log('\n🔍 Checking Ryan specifically...');
    const ryanUsers = await db
      .select()
      .from(user)
      .where(eq(user.email, 'ryan@ryanlisse.com'));

    if (ryanUsers.length > 0) {
      const ryan = ryanUsers[0];
      console.log(`Ryan found: ${ryan.id}`);

      const ryanAccounts = await db
        .select()
        .from(account)
        .where(eq(account.userId, ryan.id));
      console.log(`Ryan's accounts: ${ryanAccounts.length}`);

      if (ryanAccounts.length > 0) {
        console.log(
          '✅ Ryan has proper account records - authentication should work',
        );
      } else {
        console.log('❌ Ryan has no account records - this is the problem!');

        // Clean up orphaned user
        await db.delete(user).where(eq(user.email, 'ryan@ryanlisse.com'));
        console.log('✅ Cleaned up orphaned Ryan user record');
      }
    } else {
      console.log('Ryan not found - can register fresh');
    }
  } catch (error) {
    console.error('❌ Error checking users:', error);
  }
}

checkUsers().then(() => process.exit(0));
