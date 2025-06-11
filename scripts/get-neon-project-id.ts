#!/usr/bin/env bun

/**
 * Helper script to get your Neon Project ID using the API key
 * Usage: bun run scripts/get-neon-project-id.ts --api-key YOUR_API_KEY
 */

const args = process.argv.slice(2);
const apiKeyIndex = args.indexOf('--api-key');

if (apiKeyIndex === -1 || !args[apiKeyIndex + 1]) {
  console.error('❌ Please provide your Neon API key:');
  console.error('   bun run scripts/get-neon-project-id.ts --api-key YOUR_API_KEY');
  process.exit(1);
}

const apiKey = args[apiKeyIndex + 1];

async function getNeonProjects() {
  try {
    console.log('🔍 Fetching your Neon projects...\n');
    
    const response = await fetch('https://console.neon.tech/api/v2/projects', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    
    if (!data.projects || data.projects.length === 0) {
      console.log('❌ No projects found. Make sure your API key is correct.');
      return;
    }

    console.log('✅ Found your Neon projects:\n');
    
    for (const project of data.projects) {
      console.log(`📋 Project: ${project.name}`);
      console.log(`   🆔 Project ID: ${project.id}`);
      console.log(`   🌐 Region: ${project.region_id}`);
      console.log(`   📅 Created: ${new Date(project.created_at).toLocaleDateString()}`);
      
      // Check if this matches your database URL
      if (project.database_host?.includes('ep-raspy-rice-a93dww9p-pooler')) {
        console.log(`   ⭐ THIS IS YOUR PROJECT (matches your DATABASE_URL)`);
      }
      console.log('');
    }

    // Find the matching project for the user
    const matchingProject = data.projects.find((p: any) => 
      p.database_host?.includes('ep-raspy-rice-a93dww9p-pooler')
    );

    if (matchingProject) {
      console.log('🎯 GITHUB SECRET VALUES:');
      console.log(`   NEON_API_KEY: ${apiKey}`);
      console.log(`   NEON_PROJECT_ID: ${matchingProject.id}`);
      console.log(`   NEON_DATABASE_URL: [you already have this in .env.local]`);
    }

  } catch (error) {
    console.error('❌ Error fetching projects:');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('\n💡 Make sure your API key is correct and has the right permissions.');
  }
}

getNeonProjects();