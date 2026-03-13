#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const queriesPath = path.join(ROOT, 'src', 'db', 'queries.js');
const queriesSrc = fs.readFileSync(queriesPath, 'utf8');

const acceptFnStart = queriesSrc.indexOf('export async function acceptBrandApplicationWithCharge(');
const dealsStart = queriesSrc.indexOf('// List brand deals', acceptFnStart);
assert.ok(acceptFnStart >= 0 && dealsStart > acceptFnStart, 'Expected to locate acceptBrandApplicationWithCharge() source block');
const acceptFnSrc = queriesSrc.slice(acceptFnStart, dealsStart);

assert.ok(
  acceptFnSrc.includes("'accepted_by_user_id', $2::bigint") &&
    acceptFnSrc.includes("'charged_cost', $3::int"),
  'Expected acceptBrandApplicationWithCharge() to cast jsonb_build_object parameters for accepted_by_user_id and charged_cost'
);

const markFnStart = queriesSrc.indexOf('export async function markBrandApplicationAccepted(');
const acceptStart = queriesSrc.indexOf('// Accept brand application AND charge Brand Pass credits exactly-once.', markFnStart);
assert.ok(markFnStart >= 0 && acceptStart > markFnStart, 'Expected to locate markBrandApplicationAccepted() source block');
const markFnSrc = queriesSrc.slice(markFnStart, acceptStart);

assert.ok(
  markFnSrc.includes("'accepted_by_user_id', $2::bigint"),
  'Expected markBrandApplicationAccepted() to cast jsonb_build_object accepted_by_user_id to bigint'
);

console.log('✅ smoke brand application accept SQL typed params contract OK');
