import { db } from './config';

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    // Simple health check query with timeout
    const result = await Promise.race([
      db.execute('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Database health check timeout')),
          10000,
        ),
      ),
    ]);

    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}
