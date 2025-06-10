import { generateId } from 'ai';
import { genSaltSync, hashSync } from 'bcrypt-ts';
import { db } from './config';

export function generateHashedPassword(password: string) {
  const salt = genSaltSync(10);
  const hash = hashSync(password, salt);

  return hash;
}

export function generateDummyPassword() {
  const password = generateId(12);
  const hashedPassword = generateHashedPassword(password);

  return hashedPassword;
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    // Simple health check query
    await db.execute('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}
