#!/usr/bin/env node
/**
 * bump-version.mjs — Schema version bump CLI
 *
 * Usage:
 *   npm run bump -- --schema <FQN|shortName> --type <patch|minor|major> --change "<description>"
 *
 * Semver bump rules:
 *   patch — doc/description changes only, no field changes
 *   minor — backward-compatible: add optional field (with default/null), add enum symbol
 *   major — breaking: remove field, change type, rename field, remove enum symbol, change namespace
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'schemas', 'schema-registry.json');

const VALID_TYPES = ['patch', 'minor', 'major'];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  return args;
}

function semverBump(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Invalid bump type: ${type}`);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function changeType(bumpType) {
  if (bumpType === 'patch') return 'PATCH';
  if (bumpType === 'minor') return 'MINOR';
  if (bumpType === 'major') return 'MAJOR';
}

function resolveSchema(registry, query) {
  const schemas = registry.schemas;

  // Exact FQN match
  if (schemas[query]) return [query, schemas[query]];

  // Short name match (case-insensitive)
  const queryLower = query.toLowerCase();
  const matches = Object.entries(schemas).filter(([fqn]) => {
    const shortName = fqn.split('.').pop().toLowerCase();
    return shortName === queryLower;
  });

  if (matches.length === 0) {
    console.error(`\nError: No schema found matching "${query}"`);
    console.error('\nAvailable schemas:');
    Object.keys(schemas).forEach(fqn => console.error(`  ${fqn}`));
    process.exit(1);
  }

  if (matches.length > 1) {
    console.error(`\nError: "${query}" is ambiguous. Matches:`);
    matches.forEach(([fqn]) => console.error(`  ${fqn}`));
    console.error('\nUse the full qualified name to disambiguate.');
    process.exit(1);
  }

  return matches[0];
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.schema || !args.type || !args.change) {
    console.error('Usage: npm run bump -- --schema <FQN|shortName> --type <patch|minor|major> --change "<description>"');
    process.exit(1);
  }

  if (!VALID_TYPES.includes(args.type)) {
    console.error(`Error: --type must be one of: ${VALID_TYPES.join(', ')}`);
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const [fqn, entry] = resolveSchema(registry, args.schema);

  const oldVersion = entry.currentVersion;
  const newVersion = semverBump(oldVersion, args.type);

  // Check for duplicate version
  const existingVersions = entry.changelog.map(c => c.version);
  if (existingVersions.includes(newVersion)) {
    console.error(`Error: Version ${newVersion} already exists in the changelog for ${fqn}`);
    process.exit(1);
  }

  // Update the .avsc file version
  const avscPath = path.join(ROOT, entry.file);
  if (!fs.existsSync(avscPath)) {
    console.error(`Error: Schema file not found: ${avscPath}`);
    process.exit(1);
  }

  let avscContent = fs.readFileSync(avscPath, 'utf8');
  const versionRegex = /"version"\s*:\s*"[^"]+"/;
  if (!versionRegex.test(avscContent)) {
    console.error(`Error: Could not find "version" field in ${entry.file}`);
    process.exit(1);
  }

  avscContent = avscContent.replace(versionRegex, `"version": "${newVersion}"`);
  fs.writeFileSync(avscPath, avscContent, 'utf8');

  // Append changelog entry to registry
  const newEntry = {
    version: newVersion,
    date: today(),
    changeType: changeType(args.type),
    breaking: args.type === 'major',
    changes: [args.change]
  };

  entry.currentVersion = newVersion;
  entry.changelog.push(newEntry);
  registry.lastUpdated = today();

  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');

  console.log(`\nBumped ${fqn}`);
  console.log(`  ${oldVersion} → ${newVersion} (${args.type})`);
  console.log(`  Change: ${args.change}`);
  console.log(`  File: ${entry.file}`);
  console.log(`  Breaking: ${newEntry.breaking}`);
}

main();
