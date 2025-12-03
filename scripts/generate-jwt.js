#!/usr/bin/env node
const jwt = require('jsonwebtoken');

const secret = process.argv[2] || 'dev-secret-change-in-production-12345';
const issuer = process.argv[3] || 'codex-remote-runner';

const token = jwt.sign(
  { 
    sub: 'test-user',
    name: 'Test User'
  },
  secret,
  { 
    issuer,
    expiresIn: '30d'
  }
);

console.log(token);
