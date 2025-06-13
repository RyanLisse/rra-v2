#!/usr/bin/env node

const fetch = require('node-fetch');

async function testPhase1Fixes() {
  console.log('🧪 Testing Phase 1 Fixes...\n');

  const tests = [
    {
      name: 'Homepage Access (Auth Fix)',
      test: async () => {
        const response = await fetch('http://localhost:3000', {
          redirect: 'manual',
        });
        return (
          response.status === 200 &&
          response.headers.get('content-type').includes('text/html')
        );
      },
    },
    {
      name: 'Health Endpoint Access',
      test: async () => {
        const response = await fetch('http://localhost:3000/api/health');
        const data = await response.json();
        return response.status === 200 && data.status !== undefined;
      },
    },
    {
      name: 'No Redirect Loop',
      test: async () => {
        let redirectCount = 0;
        let url = 'http://localhost:3000';

        while (redirectCount < 10) {
          const response = await fetch(url, {
            redirect: 'manual',
          });

          if (response.status >= 300 && response.status < 400) {
            url = response.headers.get('location');
            redirectCount++;
          } else {
            break;
          }
        }

        return redirectCount < 10;
      },
    },
    {
      name: 'Database Connection',
      test: async () => {
        const response = await fetch('http://localhost:3000/api/health');
        const data = await response.json();
        const dbCheck = data.checks?.find((c) => c.name === 'database');
        return dbCheck?.status === 'healthy';
      },
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const { name, test } of tests) {
    try {
      const result = await test();
      if (result) {
        console.log(`✅ ${name}`);
        passed++;
      } else {
        console.log(`❌ ${name}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${name} - Error: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('\n🎉 All Phase 1 fixes are working correctly!');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the implementation.');
  }
}

// Check if server is running
fetch('http://localhost:3000/api/ping')
  .then(() => testPhase1Fixes())
  .catch(() => {
    console.error('❌ Server is not running. Please start it with: bun dev');
    process.exit(1);
  });
