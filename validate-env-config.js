const fs = require('node:fs');
const path = require('node:path');

console.log('🔍 Validating Environment Configuration...\n');

// Check for required environment files
const envFiles = ['.env.local', '.env.example'];
const existingEnvFiles = envFiles.filter((file) => fs.existsSync(file));

console.log('📁 Environment Files:');
existingEnvFiles.forEach((file) => {
  console.log(`✅ ${file} exists`);
});

// Read environment variables
let envVars = {};
if (fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  envVars = Object.fromEntries(
    envContent
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.split('='))
      .filter(([key]) => key),
  );
}

console.log('\n🔐 Kinde Authentication Configuration:');
const kindeVars = [
  'KINDE_CLIENT_ID',
  'KINDE_CLIENT_SECRET',
  'KINDE_ISSUER_URL',
  'KINDE_SITE_URL',
  'KINDE_POST_LOGOUT_REDIRECT_URL',
  'KINDE_POST_LOGIN_REDIRECT_URL',
];

const kindeStatus = kindeVars.map((varName) => {
  const value = envVars[varName];
  const isSet = !!value;
  const isValid =
    value && value.length > 0 && !value.includes('<') && !value.includes('>');

  console.log(
    `${isValid ? '✅' : '❌'} ${varName}: ${isSet ? 'Set' : 'Missing'} ${isValid ? '' : '(Invalid format)'}`,
  );

  return { varName, isSet, isValid };
});

console.log('\n🤖 AI Provider Configuration:');
const aiVars = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
];

const aiStatus = aiVars.map((varName) => {
  const value = envVars[varName];
  const isSet = !!value;
  const isValid = value && value.length > 20; // API keys are typically long

  console.log(
    `${isValid ? '✅' : '⚠️ '} ${varName}: ${isSet ? 'Set' : 'Missing'} ${isValid ? '' : '(Check format)'}`,
  );

  return { varName, isSet, isValid };
});

console.log('\n🗄️  Database Configuration:');
const dbVars = ['POSTGRES_URL'];
const dbStatus = dbVars.map((varName) => {
  const value = envVars[varName];
  const isSet = !!value;
  const isValid =
    value &&
    (value.startsWith('postgres://') || value.startsWith('postgresql://'));

  console.log(
    `${isValid ? '✅' : '❌'} ${varName}: ${isSet ? 'Set' : 'Missing'} ${isValid ? '' : '(Invalid format)'}`,
  );

  return { varName, isSet, isValid };
});

console.log('\n🌍 Site Configuration:');
const siteVars = ['KINDE_SITE_URL'];
siteVars.forEach((varName) => {
  const value = envVars[varName];
  if (value) {
    const isLocalhost =
      value.includes('localhost') || value.includes('127.0.0.1');
    const hasPort = value.includes(':3000') || value.includes(':3001');
    console.log(`✅ ${varName}: ${value}`);
    if (isLocalhost) {
      console.log(`   ℹ️  Using localhost (development mode)`);
    }
    if (hasPort) {
      console.log(`   ℹ️  Includes port specification`);
    }
  }
});

// Validation Summary
console.log('\n📊 Configuration Validation Summary:');

const kindeComplete = kindeStatus.every((s) => s.isValid);
const hasAiProvider = aiStatus.some((s) => s.isValid);
const dbComplete = dbStatus.every((s) => s.isValid);

console.log(
  `🔐 Kinde Auth: ${kindeComplete ? '✅ Complete' : '❌ Incomplete'}`,
);
console.log(
  `🤖 AI Providers: ${hasAiProvider ? '✅ At least one configured' : '❌ None configured'}`,
);
console.log(
  `🗄️  Database: ${dbComplete ? '✅ Configured' : '❌ Not configured'}`,
);

const overallHealthy = kindeComplete && hasAiProvider && dbComplete;
console.log(
  `\n🎯 Overall Status: ${overallHealthy ? '✅ HEALTHY' : '⚠️  NEEDS ATTENTION'}`,
);

if (!overallHealthy) {
  console.log('\n🔧 Recommendations:');
  if (!kindeComplete) {
    console.log('- Complete Kinde configuration with valid values');
  }
  if (!hasAiProvider) {
    console.log(
      '- Configure at least one AI provider (OpenAI, Anthropic, or Gemini)',
    );
  }
  if (!dbComplete) {
    console.log('- Configure PostgreSQL database connection');
  }
}

// Check middleware configuration
console.log('\n🛡️  Middleware Configuration:');
try {
  const middlewareContent = fs.readFileSync('middleware.ts', 'utf8');
  const hasKindeMiddleware = middlewareContent.includes('withAuth');
  const hasErrorHandling = middlewareContent.includes('onError');
  const hasExclusions =
    middlewareContent.includes('ping') || middlewareContent.includes('health');

  console.log(
    `✅ Kinde middleware: ${hasKindeMiddleware ? 'Enabled' : 'Missing'}`,
  );
  console.log(
    `✅ Error handling: ${hasErrorHandling ? 'Configured' : 'Missing'}`,
  );
  console.log(
    `✅ Endpoint exclusions: ${hasExclusions ? 'Configured' : 'Missing'}`,
  );
} catch (error) {
  console.log('❌ Middleware file not found or not readable');
}

console.log('\n✨ Environment validation complete!');
