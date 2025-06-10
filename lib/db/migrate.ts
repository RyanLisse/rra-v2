import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

config({
  path: '.env.local',
});

const runMigrate = async () => {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL is not defined');
  }

  const connection = postgres(process.env.POSTGRES_URL, {
    max: 1,
    connect_timeout: 60, // 60 seconds
    idle_timeout: 30,
    ssl: 'require',
    prepare: false,
    onnotice: () => {}, // Suppress notices
  });

  const db = drizzle(connection);

  console.log('⏳ Running migrations...');

  try {
    const start = Date.now();
    await migrate(db, { migrationsFolder: './lib/db/migrations' });
    const end = Date.now();

    console.log('✅ Migrations completed in', end - start, 'ms');
    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed with error:', error);
    await connection.end();
    throw error;
  }
};

runMigrate().catch((err) => {
  console.error('❌ Migration failed');
  console.error(err);
  process.exit(1);
});
