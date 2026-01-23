#!/usr/bin/env node
const bcrypt = require('bcryptjs');

const password = process.argv[2];
const rounds = parseInt(process.argv[3]) || 10;

if (!password) {
  console.error('Usage: node hash-password.js <password> [rounds]');
  process.exit(1);
}

bcrypt.hash(password, rounds).then(hash => {
  console.log(hash);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
