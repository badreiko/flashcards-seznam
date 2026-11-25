#!/usr/bin/env node
/**
 * Скрипт локального бэкапа Firebase Realtime Database (Golden DB).
 * Запуск: npm run backup
 * Результат: backups/firebase-YYYY-MM-DD_HH-mm-ss.json
 */

const fs = require('node:fs');
const path = require('node:path');

const DB_URL =
  process.env.FIREBASE_DATABASE_URL ||
  'https://flashcards-seznam-6652a-default-rtdb.europe-west1.firebasedatabase.app';

async function main() {
  const endpoint = `${DB_URL.replace(/\/+$/, '')}/.json`;
  console.log(`Downloading Firebase RTDB backup from ${endpoint}...`);

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const rawText = await response.text();
  const parsed = JSON.parse(rawText);

  const backupsDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join('-') + '_' + [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('-');

  const outPath = path.join(backupsDir, `firebase-${stamp}.json`);
  fs.writeFileSync(outPath, rawText, 'utf8');

  const sizeMb = (Buffer.byteLength(rawText, 'utf8') / (1024 * 1024)).toFixed(2);
  console.log(`Saved backup: ${outPath} (${sizeMb} MB)`);

  if (parsed && typeof parsed === 'object') {
    for (const key of ['dictionary', 'forms_index', 'phrase_index', 'phrase_buckets', 'words']) {
      if (parsed[key] && typeof parsed[key] === 'object') {
        console.log(`  - ${key}: ${Object.keys(parsed[key]).length} entries`);
      }
    }
  }
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
