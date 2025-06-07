import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth/config';

const handler = toNextJsHandler(auth);

export const { POST, GET } = handler;
