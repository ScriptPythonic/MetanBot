const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Connect to the SQLite database
const db = new sqlite3.Database('users.db');

// Create a users table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    chat_id INTEGER UNIQUE,
    username TEXT,
    balance INTEGER DEFAULT 100,
    referral_code TEXT UNIQUE
  )
`);

// Create a referrals table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS referrals (
    referral_id INTEGER PRIMARY KEY,
    referring_user INTEGER,
    referred_user INTEGER,
    FOREIGN KEY(referring_user) REFERENCES users(user_id),
    FOREIGN KEY(referred_user) REFERENCES users(user_id)
  )
`);

module.exports = { db, fs }; 

