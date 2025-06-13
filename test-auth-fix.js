#!/usr/bin/env node

/**
 * Test script to verify the auth redirect loop fix
 * Run with: node test-auth-fix.js
 */

const http = require('node:http');
const https = require('node:https');

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () =>
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
        }),
      );
    });
    req.on('error', reject);
  });
}

async function testAuthFlow() {
  const baseUrl = 'http://localhost:3000';

  console.log('Testing Auth Redirect Loop Fix...\n');

  // Test 1: Homepage should be accessible without auth
  console.log('1. Testing homepage access without authentication...');
  try {
    const response = await makeRequest(baseUrl, {
      headers: { Accept: 'text/html' },
      timeout: 5000,
    });

    if (response.statusCode === 200) {
      console.log('✅ Homepage accessible without authentication');
    } else if (response.statusCode === 302 || response.statusCode === 307) {
      console.log(`❌ Homepage redirecting to: ${response.headers.location}`);
      console.log('   This indicates the redirect loop issue still exists');
    } else {
      console.log(`⚠️  Unexpected status code: ${response.statusCode}`);
    }
  } catch (error) {
    console.log(`❌ Error accessing homepage: ${error.message}`);
  }

  // Test 2: Check guest route behavior
  console.log('\n2. Testing guest route redirect...');
  try {
    const response = await makeRequest(`${baseUrl}/api/auth/guest`, {
      headers: { Accept: 'application/json' },
      timeout: 5000,
    });

    if (response.statusCode === 307 || response.statusCode === 302) {
      console.log(
        `✅ Guest route redirecting to: ${response.headers.location}`,
      );
    } else {
      console.log(`⚠️  Unexpected status code: ${response.statusCode}`);
    }
  } catch (error) {
    console.log(`❌ Error accessing guest route: ${error.message}`);
  }

  // Test 3: Check auth status endpoint
  console.log('\n3. Testing auth status endpoint...');
  try {
    const response = await makeRequest(`${baseUrl}/api/auth/status`, {
      headers: { Accept: 'application/json' },
      timeout: 5000,
    });

    if (response.statusCode === 200) {
      console.log('✅ Auth status endpoint accessible');
      try {
        const data = JSON.parse(response.data);
        console.log(`   Authenticated: ${data.authenticated}`);
      } catch (e) {
        console.log('   Response:', response.data);
      }
    } else {
      console.log(`⚠️  Unexpected status code: ${response.statusCode}`);
    }
  } catch (error) {
    console.log(`❌ Error accessing auth status: ${error.message}`);
  }

  console.log('\n---');
  console.log('Summary:');
  console.log('- If homepage returns 200: Fix is working ✅');
  console.log(
    '- If homepage redirects to /api/auth/login: Redirect loop still exists ❌',
  );
  console.log('- Make sure the dev server is running: bun dev');
}

// Run the test
testAuthFlow().catch(console.error);
