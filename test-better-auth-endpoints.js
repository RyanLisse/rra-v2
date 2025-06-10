#!/usr/bin/env node

async function testBetterAuthEndpoints() {
  console.log('🧪 Testing Better Auth Endpoints...\n');

  const baseUrl = 'http://localhost:3000/api/auth';

  // Test endpoints that better-auth typically provides
  const endpoints = [
    'session',
    'sign-up/email',
    'sign-in/email',
    'user',
    'providers',
    'list-sessions',
  ];

  for (const endpoint of endpoints) {
    console.log(`📍 Testing GET ${baseUrl}/${endpoint}`);
    try {
      const response = await fetch(`${baseUrl}/${endpoint}`);
      console.log(`   Status: ${response.status}`);
      const text = await response.text();
      console.log(
        `   Response: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`,
      );
    } catch (error) {
      console.log(`   Error: ${error.message}`);
    }
    console.log('');
  }

  // Test POST sign-up
  console.log('📍 Testing POST sign-up');
  const testEmail = `test-${Date.now()}@example.com`;
  try {
    const response = await fetch(`${baseUrl}/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'TestPassword123!',
        name: testEmail.split('@')[0],
      }),
    });
    console.log(`   Status: ${response.status}`);
    const text = await response.text();
    console.log(
      `   Response: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`,
    );
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }
}

testBetterAuthEndpoints();
