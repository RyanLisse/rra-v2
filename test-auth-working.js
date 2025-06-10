#!/usr/bin/env node

const { spawn } = require('node:child_process');

async function testAuthentication() {
  console.log('🧪 Testing Better Auth Authentication...\n');

  // Test 1: Registration
  console.log('1️⃣ Testing user registration...');
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';

  try {
    const registerResponse = await fetch(
      'http://localhost:3000/api/auth/sign-up/email',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: testEmail.split('@')[0],
        }),
      },
    );

    console.log('📊 Registration response status:', registerResponse.status);
    const registerResult = await registerResponse.text();
    console.log('📄 Registration response:', registerResult.substring(0, 200));

    if (registerResponse.ok) {
      console.log('✅ Registration successful');
    } else {
      console.log('❌ Registration failed');
    }
  } catch (error) {
    console.log('❌ Registration error:', error.message);
  }

  console.log('\n');

  // Test 2: Login
  console.log('2️⃣ Testing user login...');
  try {
    const loginResponse = await fetch(
      'http://localhost:3000/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      },
    );

    console.log('📊 Login response status:', loginResponse.status);
    const loginResult = await loginResponse.text();
    console.log('📄 Login response:', loginResult.substring(0, 200));

    if (loginResponse.ok) {
      console.log('✅ Login successful');
    } else {
      console.log('❌ Login failed');
    }
  } catch (error) {
    console.log('❌ Login error:', error.message);
  }

  console.log('\n');

  // Test 3: Session check
  console.log('3️⃣ Testing session validation...');
  try {
    const sessionResponse = await fetch(
      'http://localhost:3000/api/auth/session',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('📊 Session response status:', sessionResponse.status);
    const sessionResult = await sessionResponse.text();
    console.log('📄 Session response:', sessionResult.substring(0, 200));

    if (sessionResponse.ok) {
      console.log('✅ Session check successful');
    } else {
      console.log('❌ Session check failed');
    }
  } catch (error) {
    console.log('❌ Session error:', error.message);
  }

  console.log('\n🏁 Authentication test completed!');
}

// Wait for server to be ready
setTimeout(testAuthentication, 2000);
