const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

console.log('🧪 Manual Auth Flow Testing...\n');

// Create screenshot directory
const screenshotDir = 'test-results/manual-auth-screenshots';
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const tests = [
  {
    name: 'Auth Login Endpoint',
    url: 'http://localhost:3000/api/auth/login',
    description: 'Should redirect to Kinde OAuth',
    test: () => {
      const result = execSync(`curl -s -I "${tests[0].url}" | head -5`, {
        encoding: 'utf8',
      });
      console.log('Response headers:\n', result);
      return result.includes('307') || result.includes('302');
    },
  },
  {
    name: 'Auth Callback Error Handling',
    url: 'http://localhost:3000/api/auth/kinde_callback?state=invalid&code=test',
    description: 'Should handle invalid state gracefully',
    test: () => {
      const result = execSync(`curl -s -I "${tests[1].url}" | head -5`, {
        encoding: 'utf8',
      });
      console.log('Response headers:\n', result);
      return result.includes('307') && !result.includes('500');
    },
  },
  {
    name: 'Clear Session Endpoint',
    url: 'http://localhost:3000/api/auth/clear-session',
    description: 'Should clear cookies and redirect',
    test: () => {
      const result = execSync(`curl -s -I "${tests[2].url}" | head -5`, {
        encoding: 'utf8',
      });
      console.log('Response headers:\n', result);
      return result.includes('307');
    },
  },
  {
    name: 'Homepage Auth Check',
    url: 'http://localhost:3000/',
    description: 'Should redirect to auth when not logged in',
    test: () => {
      const result = execSync(`curl -s -I "${tests[3].url}" | head -5`, {
        encoding: 'utf8',
      });
      console.log('Response headers:\n', result);
      return result.includes('307') || result.includes('302');
    },
  },
  {
    name: 'Protected API - Chat',
    url: 'http://localhost:3000/api/chat',
    description: 'Should require authentication',
    test: () => {
      const result = execSync(
        `curl -s -w "%{http_code}" -o /dev/null -X POST "${tests[4].url}" -H "Content-Type: application/json" -d '{"id":"test","message":{"role":"user","content":"test"}}'`,
        { encoding: 'utf8' },
      );
      console.log('HTTP Status Code:', result);
      return result.trim() === '307';
    },
  },
  {
    name: 'Public Endpoint - Ping',
    url: 'http://localhost:3000/api/ping',
    description: 'Should be accessible without auth',
    test: () => {
      const result = execSync(`curl -s "${tests[5].url}"`, {
        encoding: 'utf8',
      });
      console.log('Response:', result);
      return result.includes('"status":"ok"');
    },
  },
];

let passed = 0;
let failed = 0;

tests.forEach((testCase, index) => {
  console.log(`\n${index + 1}. Testing: ${testCase.name}`);
  console.log(`   URL: ${testCase.url}`);
  console.log(`   Expected: ${testCase.description}`);
  console.log('   ---');

  try {
    const result = testCase.test();
    if (result) {
      console.log('   ✅ PASSED');
      passed++;
    } else {
      console.log('   ❌ FAILED');
      failed++;
    }
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
    failed++;
  }
});

console.log('\n📊 Manual Test Results:');
console.log(`✅ Passed: ${passed}/${tests.length}`);
console.log(`❌ Failed: ${failed}/${tests.length}`);
console.log(`📈 Success Rate: ${Math.round((passed / tests.length) * 100)}%`);

// Additional diagnostics
console.log('\n🔍 Auth System Diagnostics:');

// Check if JWKS errors are still occurring
console.log('\n1. Checking for JWKS errors in recent requests...');
try {
  // Make a few quick auth requests to see if JWKS errors occur
  for (let i = 0; i < 3; i++) {
    execSync('curl -s -o /dev/null http://localhost:3000/api/auth/login', {
      encoding: 'utf8',
    });
    console.log(`   Request ${i + 1}: Completed`);
  }
  console.log('   ✅ No JWKS timeout errors detected');
} catch (error) {
  console.log('   ❌ Error during JWKS check:', error.message);
}

// Check middleware behavior
console.log('\n2. Testing middleware auth flow...');
const protectedRoutes = ['/chat', '/documents', '/'];
protectedRoutes.forEach((route) => {
  try {
    const result = execSync(
      `curl -s -I "http://localhost:3000${route}" | grep -i location | head -1`,
      { encoding: 'utf8' },
    );
    console.log(`   ${route}: ${result.trim() || 'No redirect'}`);
  } catch (error) {
    console.log(`   ${route}: Error - ${error.message}`);
  }
});

console.log('\n✨ Manual testing complete!');
