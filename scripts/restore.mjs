#!/usr/bin/env node
/**
 * Restore QuickCapture tasks from a backup file into a running deployment.
 *
 * Usage:
 *   node scripts/restore.mjs backups/tasks-2026-09-06.json https://your-app.example.com
 *   node scripts/restore.mjs backups/latest.json http://localhost:3210
 *
 * The target must expose POST /api/tasks/import (shipped in this repo).
 * The import is idempotent: rows whose id already exists are skipped, so
 * re-running a restore is safe.
 */

import { readFile } from "node:fs/promises";

const [backupPath, baseUrlArg] = process.argv.slice(2);

if (!backupPath || !baseUrlArg) {
  console.error(
    "Usage: node scripts/restore.mjs <backup-file.json> <base-url>\n" +
      "Example: node scripts/restore.mjs backups/latest.json https://quickcapture-nextjs.onrender.com",
  );
  process.exit(1);
}

let payload;
try {
  const raw = await readFile(backupPath, "utf8");
  const parsed = JSON.parse(raw);
  payload = { tasks: parsed.tasks ?? parsed };
} catch (error) {
  console.error(`Cannot read backup file: ${error.message}`);
  process.exit(1);
}

const rows = payload.tasks;
if (!Array.isArray(rows) || rows.length === 0) {
  console.error("Backup contains no tasks — nothing to restore.");
  process.exit(1);
}

const url = new URL("/api/tasks/import", baseUrlArg).toString();

try {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Restore failed: HTTP ${res.status}`, body);
    process.exit(1);
  }
  console.log(
    `Restored ${body.imported} task(s); skipped ${body.skippedDuplicates} duplicate(s).`,
  );
} catch (error) {
  console.error(`Restore failed: ${error.message}`);
  process.exit(1);
}
