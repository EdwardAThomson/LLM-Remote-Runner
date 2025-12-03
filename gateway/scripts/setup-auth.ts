#!/usr/bin/env ts-node
/**
 * Setup script to create initial admin password
 * Run once: pnpm tsx scripts/setup-auth.ts
 * Delete this script after setup for security
 */

import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const ENV_FILE = path.join(__dirname, '../.env');
const SALT_ROUNDS = 12;

async function promptPassword(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Enter admin password (min 16 characters): ', (password) => {
      rl.close();
      resolve(password);
    });
  });
}

async function confirmPassword(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Confirm password: ', (password) => {
      rl.close();
      resolve(password);
    });
  });
}

async function main() {
  console.log('=== Codex Remote Runner - Authentication Setup ===\n');

  // Check if password already exists
  if (fs.existsSync(ENV_FILE)) {
    const envContent = fs.readFileSync(ENV_FILE, 'utf-8');
    if (envContent.includes('ADMIN_PASSWORD_HASH=')) {
      console.log('⚠️  Admin password already configured.');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      const answer = await new Promise<string>((resolve) => {
        rl.question('Do you want to reset it? (yes/no): ', (ans) => {
          rl.close();
          resolve(ans.toLowerCase());
        });
      });

      if (answer !== 'yes') {
        console.log('Setup cancelled.');
        process.exit(0);
      }
    }
  }

  // Get password
  const password = await promptPassword();
  
  if (password.length < 16) {
    console.error('❌ Password must be at least 16 characters long.');
    process.exit(1);
  }

  // Confirm password
  const confirmation = await confirmPassword();
  
  if (password !== confirmation) {
    console.error('❌ Passwords do not match.');
    process.exit(1);
  }

  // Hash password
  console.log('\n🔐 Hashing password...');
  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  // Update .env file
  let envContent = '';
  if (fs.existsSync(ENV_FILE)) {
    envContent = fs.readFileSync(ENV_FILE, 'utf-8');
    
    // Remove existing ADMIN_PASSWORD_HASH if present
    envContent = envContent
      .split('\n')
      .filter(line => !line.startsWith('ADMIN_PASSWORD_HASH='))
      .join('\n');
  }

  // Add new hash
  if (!envContent.endsWith('\n')) {
    envContent += '\n';
  }
  envContent += `ADMIN_PASSWORD_HASH=${hash}\n`;

  fs.writeFileSync(ENV_FILE, envContent);

  console.log('✅ Admin password configured successfully!\n');
  console.log('⚠️  IMPORTANT SECURITY STEPS:');
  console.log('1. Delete this script: rm scripts/setup-auth.ts');
  console.log('2. Restart the gateway server');
  console.log('3. Never commit .env file to version control\n');
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
