#!/usr/bin/env bun
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

// Load environment files in order
const envFiles = ['.env.test.local', '.env.test', '.env.local'];

console.log('🔍 Validating test environment configuration...\n');

// Load each env file
for (const file of envFiles) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) {
    config({ path });
    console.log(`✅ Loaded: ${file}`);
  } else {
    console.log(`⏭️  Skipped: ${file} (not found)`);
  }
}

console.log('\n📋 Environment validation:\n');

// Required environment variables
const required = {
  POSTGRES_URL: process.env.POSTGRES_URL,
  KINDE_CLIENT_ID: process.env.KINDE_CLIENT_ID,
  KINDE_CLIENT_SECRET: process.env.KINDE_CLIENT_SECRET,
  KINDE_ISSUER_URL: process.env.KINDE_ISSUER_URL,
  KINDE_SITE_URL: process.env.KINDE_SITE_URL,
  KINDE_POST_LOGOUT_REDIRECT_URL: process.env.KINDE_POST_LOGOUT_REDIRECT_URL,
  KINDE_POST_LOGIN_REDIRECT_URL: process.env.KINDE_POST_LOGIN_REDIRECT_URL,
};

// Optional but recommended
const optional = {
  USE_NEON_BRANCHING: process.env.USE_NEON_BRANCHING,
  NEON_API_KEY: process.env.NEON_API_KEY,
  NEON_PROJECT_ID: process.env.NEON_PROJECT_ID,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  REDIS_URL: process.env.REDIS_URL,
};

let hasErrors = false;

// Check required variables
console.log('Required variables:');
for (const [key, value] of Object.entries(required)) {
  if (!value) {
    console.log(`❌ ${key}: NOT SET`);
    hasErrors = true;
  } else {
    const displayValue = key.includes('SECRET') || key.includes('KEY') 
      ? `***${value.slice(-4)}` 
      : value.substring(0, 50) + (value.length > 50 ? '...' : '');
    console.log(`✅ ${key}: ${displayValue}`);
  }
}

console.log('\nOptional variables:');
for (const [key, value] of Object.entries(optional)) {
  if (!value) {
    console.log(`⚠️  ${key}: not set`);
  } else {
    const displayValue = key.includes('KEY') 
      ? `***${value.slice(-4)}` 
      : value.substring(0, 50) + (value.length > 50 ? '...' : '');
    console.log(`✅ ${key}: ${displayValue}`);
  }
}

// Check for test-specific overrides
console.log('\nTest configuration:');
console.log(`🧪 NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`📊 ENABLE_TEST_METRICS: ${process.env.ENABLE_TEST_METRICS || 'true (default)'}`);
console.log(`🔍 TEST_LOG_LEVEL: ${process.env.TEST_LOG_LEVEL || 'info (default)'}`);
console.log(`🏃 TEST_ISOLATION_MODE: ${process.env.TEST_ISOLATION_MODE || 'branch (default)'}`);

if (hasErrors) {
  console.log('\n❌ Test environment validation failed!');
  console.log('Please ensure all required environment variables are set in .env.test');
  process.exit(1);
} else {
  console.log('\n✅ Test environment validation passed!');
  console.log('All required environment variables are configured.');
  
  // Test database connection
  if (process.env.POSTGRES_URL) {
    console.log('\n🔗 Testing database connection...');
    try {
      const { db } = await import('../lib/db');
      await db.execute('SELECT 1');
      console.log('✅ Database connection successful!');
    } catch (error) {
      console.log('❌ Database connection failed:', error.message);
      console.log('   Make sure your POSTGRES_URL is correct and the database is accessible.');
    }
  }
}