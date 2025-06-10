import { db } from './lib/db';
import { user } from './lib/db/schema';
import { eq } from 'drizzle-orm';

async function fixOrphanedUser() {
  const email = 'ryan@ryanlisse.com';

  console.log('🔍 Checking for orphaned user records...');

  try {
    // Find the user record
    const existingUser = await db
      .select()
      .from(user)
      .where(eq(user.email, email));

    if (existingUser.length > 0) {
      console.log(`Found user record for ${email}: ${existingUser[0].id}`);

      // Delete the orphaned user record so they can register properly
      await db.delete(user).where(eq(user.email, email));
      console.log(`✅ Deleted orphaned user record for ${email}`);
      console.log('📝 User can now register properly using Better-auth signUp');
    } else {
      console.log(`No user record found for ${email}`);
    }
  } catch (error) {
    console.error('❌ Error fixing orphaned user:', error);
  }
}

fixOrphanedUser().then(() => process.exit(0));
