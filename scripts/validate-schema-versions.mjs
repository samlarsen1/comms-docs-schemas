#!/usr/bin/env node
/**
 * validate-schema-versions.mjs — Schema version validator
 *
 * Usage:
 *   npm run validate          # warnings allowed
 *   npm run validate:ci       # fails on warnings too (--strict)
 *
 * Checks:
 *   - Every .avsc file has valid semver "version"
 *   - Every .avsc file has valid "compatibility" value
 *   - Every .avsc file has valid "status" value
 *   - Every .avsc file has a top-level "doc" string
 *   - Every field in record schemas has a "doc" string
 *   - version in .avsc matches registry currentVersion
 *   - changelog is in ascending semver order
 *   - No registry orphans (registry entry with no .avsc file)
 *   - No unregistered schemas (.avsc file with no registry entry)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'schemas', 'schema-registry.json');

const VALID_COMPATIBILITY = ['BACKWARD', 'FORWARD', 'FULL', 'NONE'];
const VALID_STATUS = ['ACTIVE', 'DEPRECATED', 'RETIRED'];
const VALID_CHANGE_TYPES = ['INITIAL', 'PATCH', 'MINOR', 'MAJOR'];
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

const strict = process.argv.includes('--strict');

let errors = 0;
let warnings = 0;

function error(msg) {
  console.error(`  ERROR: ${msg}`);
  errors++;
}

function warn(msg) {
  if (strict) {
    console.error(`  WARN: ${msg}`);
    errors++;
  } else {
    console.warn(`  WARN: ${msg}`);
    warnings++;
  }
}

function semverCompare(a, b) {
  const [ma, na, pa] = a.split('.').map(Number);
  const [mb, nb, pb] = b.split('.').map(Number);
  if (ma !== mb) return ma - mb;
  if (na !== nb) return na - nb;
  return pa - pb;
}

function checkFieldDocs(fields, schemaName, path = '') {
  if (!Array.isArray(fields)) return;
  for (const field of fields) {
    const fieldPath = path ? `${path}.${field.name}` : field.name;
    if (!field.doc || field.doc.trim() === '') {
      warn(`${schemaName}: field "${fieldPath}" is missing a doc string`);
    }
    // Recurse into inline records
    const type = field.type;
    const types = Array.isArray(type) ? type : [type];
    for (const t of types) {
      if (t && typeof t === 'object' && t.type === 'record' && Array.isArray(t.fields)) {
        checkFieldDocs(t.fields, schemaName, fieldPath);
      }
    }
  }
}

function validateAvsc(file, fqn, registryEntry) {
  const filePath = path.join(ROOT, file);
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    error(`${file}: Failed to parse JSON — ${e.message}`);
    return;
  }

  // version
  if (!schema.version) {
    error(`${file}: missing "version" property`);
  } else if (!SEMVER_RE.test(schema.version)) {
    error(`${file}: "version" is not valid semver: "${schema.version}"`);
  } else if (registryEntry && schema.version !== registryEntry.currentVersion) {
    error(`${file}: version "${schema.version}" does not match registry currentVersion "${registryEntry.currentVersion}"`);
  }

  // compatibility
  if (!schema.compatibility) {
    error(`${file}: missing "compatibility" property`);
  } else if (!VALID_COMPATIBILITY.includes(schema.compatibility)) {
    error(`${file}: invalid compatibility "${schema.compatibility}". Must be one of: ${VALID_COMPATIBILITY.join(', ')}`);
  }

  // status
  if (!schema.status) {
    error(`${file}: missing "status" property`);
  } else if (!VALID_STATUS.includes(schema.status)) {
    error(`${file}: invalid status "${schema.status}". Must be one of: ${VALID_STATUS.join(', ')}`);
  }

  // doc (only records and enums are expected to have it)
  if (schema.type === 'record' || schema.type === 'enum') {
    if (!schema.doc || schema.doc.trim() === '') {
      warn(`${file}: missing top-level "doc" string`);
    }
  }

  // field docs (records only)
  if (schema.type === 'record' && Array.isArray(schema.fields)) {
    checkFieldDocs(schema.fields, file);
  }
}

function validateRegistryEntry(fqn, entry) {
  const filePath = path.join(ROOT, entry.file);
  if (!fs.existsSync(filePath)) {
    error(`Registry entry "${fqn}": file not found at ${entry.file}`);
    return;
  }

  if (!SEMVER_RE.test(entry.currentVersion)) {
    error(`Registry entry "${fqn}": currentVersion "${entry.currentVersion}" is not valid semver`);
  }

  if (!VALID_COMPATIBILITY.includes(entry.compatibility)) {
    error(`Registry entry "${fqn}": invalid compatibility "${entry.compatibility}"`);
  }

  if (!VALID_STATUS.includes(entry.status)) {
    error(`Registry entry "${fqn}": invalid status "${entry.status}"`);
  }

  // changelog validation
  if (!Array.isArray(entry.changelog) || entry.changelog.length === 0) {
    error(`Registry entry "${fqn}": changelog is empty or missing`);
    return;
  }

  // Check first entry is INITIAL
  if (entry.changelog[0].changeType !== 'INITIAL') {
    warn(`Registry entry "${fqn}": first changelog entry should have changeType "INITIAL"`);
  }

  // Validate each changelog entry
  for (const c of entry.changelog) {
    if (!SEMVER_RE.test(c.version)) {
      error(`Registry entry "${fqn}": changelog version "${c.version}" is not valid semver`);
    }
    if (!VALID_CHANGE_TYPES.includes(c.changeType)) {
      error(`Registry entry "${fqn}": invalid changeType "${c.changeType}"`);
    }
    if (!Array.isArray(c.changes) || c.changes.length === 0) {
      warn(`Registry entry "${fqn}": changelog entry ${c.version} has no changes listed`);
    }
  }

  // Check ascending semver order
  for (let i = 1; i < entry.changelog.length; i++) {
    const prev = entry.changelog[i - 1].version;
    const curr = entry.changelog[i].version;
    if (semverCompare(curr, prev) <= 0) {
      error(`Registry entry "${fqn}": changelog not in ascending order — ${prev} before ${curr}`);
    }
  }

  // Check currentVersion matches last changelog entry
  const lastVersion = entry.changelog[entry.changelog.length - 1].version;
  if (entry.currentVersion !== lastVersion) {
    error(`Registry entry "${fqn}": currentVersion "${entry.currentVersion}" does not match last changelog entry "${lastVersion}"`);
  }
}

function collectAvscFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectAvscFiles(fullPath, files);
    } else if (entry.name.endsWith('.avsc')) {
      files.push(fullPath);
    }
  }
  return files;
}

function main() {
  console.log(`\nValidating schema versions${strict ? ' (strict mode)' : ''}...\n`);

  if (!fs.existsSync(REGISTRY_PATH)) {
    console.error('ERROR: schemas/schema-registry.json not found');
    process.exit(1);
  }

  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch (e) {
    console.error(`ERROR: Failed to parse schema-registry.json — ${e.message}`);
    process.exit(1);
  }

  const schemasDir = path.join(ROOT, 'schemas');
  const allAvscFiles = collectAvscFiles(schemasDir).filter(f => !f.includes('schema-registry'));

  // Build a map of file -> FQN from registry
  const fileToFqn = {};
  for (const [fqn, entry] of Object.entries(registry.schemas)) {
    fileToFqn[path.join(ROOT, entry.file)] = fqn;
  }

  // Check every .avsc file
  console.log('Checking .avsc files...');
  for (const filePath of allAvscFiles) {
    const relPath = path.relative(ROOT, filePath);
    const fqn = fileToFqn[filePath];
    if (!fqn) {
      warn(`${relPath}: not registered in schema-registry.json`);
    }
    const registryEntry = fqn ? registry.schemas[fqn] : null;
    validateAvsc(relPath, fqn, registryEntry);
  }

  // Check every registry entry
  console.log('\nChecking registry entries...');
  for (const [fqn, entry] of Object.entries(registry.schemas)) {
    validateRegistryEntry(fqn, entry);
    // Cross-validate with avsc
    validateAvsc(entry.file, fqn, entry);
  }

  // Summary
  console.log('\n' + '─'.repeat(50));
  if (errors === 0 && warnings === 0) {
    console.log(`✓ All schemas valid. ${Object.keys(registry.schemas).length} schemas checked.`);
    process.exit(0);
  } else if (errors === 0) {
    console.log(`✓ ${Object.keys(registry.schemas).length} schemas checked. ${warnings} warning(s).`);
    process.exit(0);
  } else {
    console.log(`✗ ${errors} error(s), ${warnings} warning(s). Fix errors before committing.`);
    process.exit(1);
  }
}

main();
