#!/usr/bin/env node
/**
 * generate-schema-docs.mjs — Docusaurus MDX documentation generator
 *
 * Usage:
 *   npm run generate
 *
 * Reads all .avsc files + schema-registry.json, writes MDX to outputDir.
 * Config is read from schema-docs.config.json at the repo root.
 *
 * Outputs:
 *   - One MDX page per top-level schema
 *   - index.mdx — searchable catalogue table grouped by namespace
 *   - _category_.json — Docusaurus sidebar config per namespace directory
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'schema-docs.config.json');
const REGISTRY_PATH = path.join(ROOT, 'schemas', 'schema-registry.json');

// ─── Config ───────────────────────────────────────────────────────────────────

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Error: schema-docs.config.json not found at repo root.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fqnToSlug(fqn) {
  return fqn.replace(/\./g, '-').toLowerCase();
}

function fqnToRelPath(fqn) {
  const parts = fqn.split('.');
  // com.bank.schemas.<group>.<Name> → <group>/<Name>
  // e.g. com.bank.schemas.core.Party → core/Party
  // e.g. com.bank.schemas.common.enums.AccountStatus → common/enums/AccountStatus
  const withoutPrefix = parts.slice(3); // strip com.bank.schemas
  return withoutPrefix.join('/');
}

function namespaceLabel(ns) {
  const labels = {
    'com.bank.schemas.common.enums': 'Common Enums',
    'com.bank.schemas.common': 'Common Types',
    'com.bank.schemas.core': 'Core Entities',
    'com.bank.schemas.reference': 'Reference',
    'com.bank.schemas.events': 'Events',
    'com.bank.schemas.payloads.statements': 'Payloads / Statements',
    'com.bank.schemas.payloads.letters': 'Payloads / Letters',
    'com.bank.schemas.payloads.emails': 'Payloads / Emails',
    'com.bank.schemas.payloads.sms': 'Payloads / SMS',
    'com.bank.schemas.payloads.push': 'Payloads / Push',
    'com.bank.schemas.channels': 'Channels',
  };
  return labels[ns] || ns;
}

function namespaceSidebarPosition(ns) {
  const order = [
    'com.bank.schemas.common.enums',
    'com.bank.schemas.common',
    'com.bank.schemas.core',
    'com.bank.schemas.reference',
    'com.bank.schemas.events',
    'com.bank.schemas.payloads.statements',
    'com.bank.schemas.payloads.letters',
    'com.bank.schemas.payloads.emails',
    'com.bank.schemas.payloads.sms',
    'com.bank.schemas.payloads.push',
    'com.bank.schemas.channels',
  ];
  const idx = order.indexOf(ns);
  return idx >= 0 ? idx + 1 : 99;
}

function escapeForMdx(str) {
  if (!str) return '';
  return str.replace(/[{}<>]/g, c => ({ '{': '&#123;', '}': '&#125;', '<': '&lt;', '>': '&gt;' }[c]));
}

function formatAvroType(type, fqnToPage, depth = 0) {
  if (type === null || type === undefined) return '`null`';
  if (typeof type === 'string') {
    if (fqnToPage[type]) {
      const slug = fqnToPage[type];
      const shortName = type.split('.').pop();
      return `[\`${shortName}\`](${slug})`;
    }
    // Primitive types
    const primitiveMap = {
      'null': '`null`', 'boolean': '`boolean`', 'int': '`int`',
      'long': '`long`', 'float': '`float`', 'double': '`double`',
      'bytes': '`bytes`', 'string': '`string`',
    };
    return primitiveMap[type] || `\`${type}\``;
  }
  if (Array.isArray(type)) {
    const nonNull = type.filter(t => t !== 'null');
    const formatted = nonNull.map(t => formatAvroType(t, fqnToPage, depth));
    const nullable = type.includes('null');
    return nullable ? `${formatted.join(' \\| ')} _(optional)_` : formatted.join(' \\| ');
  }
  if (typeof type === 'object') {
    if (type.logicalType) {
      const logicalMap = { 'timestamp-millis': '`long` _(timestamp-millis, UTC ms)_', 'date': '`int` _(date)_' };
      return logicalMap[type.logicalType] || `\`${type.type}\` _(${type.logicalType})_`;
    }
    if (type.type === 'array') {
      return `array of ${formatAvroType(type.items, fqnToPage, depth)}`;
    }
    if (type.type === 'map') {
      return `map\\<string, ${formatAvroType(type.values, fqnToPage, depth)}\\>`;
    }
    if (type.type === 'enum') {
      const enumName = type.name;
      if (type.namespace && fqnToPage[`${type.namespace}.${enumName}`]) {
        const fqn = `${type.namespace}.${enumName}`;
        return `[\`${enumName}\`](${fqnToPage[fqn]})`;
      }
      return `\`${enumName}\` _(inline enum)_`;
    }
    if (type.type === 'record') {
      const recordName = type.name;
      if (type.namespace && fqnToPage[`${type.namespace}.${recordName}`]) {
        const fqn = `${type.namespace}.${recordName}`;
        return `[\`${recordName}\`](${fqnToPage[fqn]})`;
      }
      return `\`${recordName}\` _(inline record)_`;
    }
  }
  return `\`${JSON.stringify(type)}\``;
}

function formatDefault(def) {
  if (def === null) return '`null`';
  if (def === undefined) return '—';
  if (typeof def === 'string') return `\`"${def}"\``;
  if (typeof def === 'boolean') return `\`${def}\``;
  if (Array.isArray(def) && def.length === 0) return '`[]`';
  if (typeof def === 'object' && Object.keys(def).length === 0) return '`{}`';
  return `\`${JSON.stringify(def)}\``;
}

// Collect all inline nested types (records and enums) from fields
function collectInlineTypes(fields, result = []) {
  if (!Array.isArray(fields)) return result;
  for (const field of fields) {
    const types = Array.isArray(field.type) ? field.type : [field.type];
    for (const t of types) {
      if (t && typeof t === 'object') {
        if (t.type === 'record' && t.fields) {
          result.push({ kind: 'record', schema: t });
          collectInlineTypes(t.fields, result);
        } else if (t.type === 'enum' && !t.namespace?.includes('enums')) {
          result.push({ kind: 'enum', schema: t });
        } else if (t.type === 'array' && t.items && typeof t.items === 'object') {
          if (t.items.type === 'record') {
            result.push({ kind: 'record', schema: t.items });
            collectInlineTypes(t.items.fields, result);
          }
        }
      }
    }
  }
  return result;
}

// ─── MDX generation ───────────────────────────────────────────────────────────

function generateSchemaPage(schema, registryEntry, fqnToPage, referencedBy, config) {
  const fqn = `${schema.namespace}.${schema.name}`;
  const version = schema.version || '1.0.0';
  const compatibility = schema.compatibility || 'BACKWARD';
  const status = schema.status || 'ACTIVE';
  const isEnum = schema.type === 'enum';
  const fileRelPath = registryEntry?.file || '';
  const githubUrl = fileRelPath
    ? `${config.githubRepo}/blob/${config.githubBranch}/${fileRelPath}`
    : null;

  const lines = [];

  // Frontmatter
  lines.push('---');
  lines.push(`id: ${fqnToSlug(fqn)}`);
  lines.push(`title: ${schema.name}`);
  lines.push(`description: "${escapeForMdx(schema.doc || '').replace(/"/g, '\\"')}"`);
  lines.push(`tags: [${schema.name}, v${version}, ${namespaceLabel(schema.namespace)}]`);
  lines.push('---');
  lines.push('');

  // Title
  lines.push(`# ${schema.name}`);
  lines.push('');

  // Metadata table
  lines.push('| | |');
  lines.push('|---|---|');
  lines.push(`| **Namespace** | \`${schema.namespace}\` |`);
  lines.push(`| **Type** | \`${schema.type}\` |`);
  lines.push(`| **Version** | \`${version}\` |`);
  lines.push(`| **Compatibility** | \`${compatibility}\` |`);
  lines.push(`| **Status** | \`${status}\` |`);
  if (githubUrl) {
    lines.push(`| **Source** | [${fileRelPath}](${githubUrl}) |`);
  }
  lines.push('');

  // Description
  if (schema.doc) {
    lines.push(escapeForMdx(schema.doc));
    lines.push('');
  }

  if (isEnum) {
    // Symbols table
    lines.push('## Symbols');
    lines.push('');
    lines.push('| Symbol |');
    lines.push('|--------|');
    for (const sym of schema.symbols) {
      lines.push(`| \`${sym}\` |`);
    }
    lines.push('');
  } else {
    // Fields table
    lines.push('## Fields');
    lines.push('');
    lines.push('| Field | Type | Required | Default | Description |');
    lines.push('|-------|------|----------|---------|-------------|');

    for (const field of (schema.fields || [])) {
      const typeStr = formatAvroType(field.type, fqnToPage);
      const hasDefault = field.default !== undefined;
      const isNullable = Array.isArray(field.type) && field.type.includes('null');
      const required = !hasDefault && !isNullable ? 'Yes' : 'No';
      const defaultStr = hasDefault ? formatDefault(field.default) : '—';
      const doc = escapeForMdx(field.doc || '');
      lines.push(`| \`${field.name}\` | ${typeStr} | ${required} | ${defaultStr} | ${doc} |`);
    }
    lines.push('');

    // Nested Types section
    const inlineTypes = collectInlineTypes(schema.fields || []);
    if (inlineTypes.length > 0) {
      lines.push('## Nested Types');
      lines.push('');
      for (const { kind, schema: nested } of inlineTypes) {
        const anchor = nested.name.toLowerCase();
        lines.push(`### ${nested.name} {#${anchor}}`);
        lines.push('');
        if (nested.doc) {
          lines.push(escapeForMdx(nested.doc));
          lines.push('');
        }
        if (kind === 'record' && nested.fields) {
          lines.push('| Field | Type | Required | Default | Description |');
          lines.push('|-------|------|----------|---------|-------------|');
          for (const field of nested.fields) {
            const typeStr = formatAvroType(field.type, fqnToPage);
            const hasDefault = field.default !== undefined;
            const isNullable = Array.isArray(field.type) && field.type.includes('null');
            const required = !hasDefault && !isNullable ? 'Yes' : 'No';
            const defaultStr = hasDefault ? formatDefault(field.default) : '—';
            const doc = escapeForMdx(field.doc || '');
            lines.push(`| \`${field.name}\` | ${typeStr} | ${required} | ${defaultStr} | ${doc} |`);
          }
          lines.push('');
        } else if (kind === 'enum' && nested.symbols) {
          lines.push('| Symbol |');
          lines.push('|--------|');
          for (const sym of nested.symbols) {
            lines.push(`| \`${sym}\` |`);
          }
          lines.push('');
        }
      }
    }
  }

  // Referenced By
  const refs = referencedBy[fqn] || [];
  if (refs.length > 0) {
    lines.push('## Referenced By');
    lines.push('');
    lines.push('| Schema | Namespace |');
    lines.push('|--------|-----------|');
    for (const refFqn of refs) {
      const refName = refFqn.split('.').pop();
      const refNs = refFqn.split('.').slice(0, -1).join('.');
      const refPage = fqnToPage[refFqn];
      const refLink = refPage ? `[${refName}](${refPage})` : refName;
      lines.push(`| ${refLink} | \`${refNs}\` |`);
    }
    lines.push('');
  }

  // Changelog
  if (registryEntry?.changelog?.length > 0) {
    lines.push('## Changelog');
    lines.push('');
    lines.push('| Version | Date | Type | Breaking | Changes |');
    lines.push('|---------|------|------|----------|---------|');
    for (const entry of [...registryEntry.changelog].reverse()) {
      const breaking = entry.breaking ? '⚠️ Yes' : 'No';
      const changes = entry.changes.map(c => escapeForMdx(c)).join('; ');
      lines.push(`| \`${entry.version}\` | ${entry.date} | ${entry.changeType} | ${breaking} | ${changes} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function generateIndexPage(allSchemas, fqnToPage, registry) {
  const lines = [];

  lines.push('---');
  lines.push('id: index');
  lines.push('title: Schema Catalogue');
  lines.push('description: All Avro schemas for the banking communications platform');
  lines.push('---');
  lines.push('');
  lines.push('# Schema Catalogue');
  lines.push('');
  lines.push(`Complete reference for all ${allSchemas.length} Avro schemas in the communications platform.`);
  lines.push('');

  // Group by namespace
  const byNamespace = {};
  for (const { schema } of allSchemas) {
    const ns = schema.namespace;
    if (!byNamespace[ns]) byNamespace[ns] = [];
    byNamespace[ns].push(schema);
  }

  const namespaceOrder = [
    'com.bank.schemas.common.enums',
    'com.bank.schemas.common',
    'com.bank.schemas.core',
    'com.bank.schemas.reference',
    'com.bank.schemas.events',
    'com.bank.schemas.payloads.statements',
    'com.bank.schemas.payloads.letters',
    'com.bank.schemas.payloads.emails',
    'com.bank.schemas.payloads.sms',
    'com.bank.schemas.payloads.push',
    'com.bank.schemas.channels',
  ];

  for (const ns of namespaceOrder) {
    const schemas = byNamespace[ns];
    if (!schemas || schemas.length === 0) continue;

    lines.push(`## ${namespaceLabel(ns)}`);
    lines.push('');
    lines.push('| Schema | Type | Version | Status | Description |');
    lines.push('|--------|------|---------|--------|-------------|');

    for (const schema of schemas) {
      const fqn = `${schema.namespace}.${schema.name}`;
      const page = fqnToPage[fqn];
      const link = page ? `[${schema.name}](${page})` : schema.name;
      const regEntry = registry.schemas[fqn];
      const version = regEntry?.currentVersion || schema.version || '1.0.0';
      const status = regEntry?.status || schema.status || 'ACTIVE';
      const doc = escapeForMdx((schema.doc || '').split('.')[0]); // first sentence only
      lines.push(`| ${link} | \`${schema.type}\` | \`${version}\` | ${status} | ${doc} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Collect all schemas ──────────────────────────────────────────────────────

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

// Build reverse reference index: which schemas reference each FQN?
function buildReferenceIndex(allSchemas) {
  const referencedBy = {};

  function findRefs(type, sourceFqn) {
    if (!type) return;
    if (typeof type === 'string') {
      if (type.includes('.')) {
        if (!referencedBy[type]) referencedBy[type] = new Set();
        referencedBy[type].add(sourceFqn);
      }
      return;
    }
    if (Array.isArray(type)) {
      type.forEach(t => findRefs(t, sourceFqn));
      return;
    }
    if (typeof type === 'object') {
      if (type.items) findRefs(type.items, sourceFqn);
      if (type.values) findRefs(type.values, sourceFqn);
      if (type.fields) type.fields.forEach(f => findRefs(f.type, sourceFqn));
      if (type.namespace && type.name && type.type) {
        // inline type — not an external reference
      }
    }
  }

  for (const { schema } of allSchemas) {
    const fqn = `${schema.namespace}.${schema.name}`;
    if (schema.fields) {
      schema.fields.forEach(f => findRefs(f.type, fqn));
    }
    // Also check payload union in CommunicationEvent
    if (schema.type === 'record' && Array.isArray(schema.fields)) {
      const payloadField = schema.fields.find(f => f.name === 'payload');
      if (payloadField && Array.isArray(payloadField.type)) {
        payloadField.type.forEach(t => findRefs(t, fqn));
      }
    }
  }

  // Convert Sets to sorted arrays
  const result = {};
  for (const [fqn, set] of Object.entries(referencedBy)) {
    result[fqn] = [...set].sort();
  }
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const config = loadConfig();
  const outputDir = path.resolve(ROOT, config.outputDir);

  console.log(`\nGenerating schema docs...`);
  console.log(`Output: ${outputDir}\n`);

  // Load registry
  if (!fs.existsSync(REGISTRY_PATH)) {
    console.error('Error: schemas/schema-registry.json not found. Run npm run validate first.');
    process.exit(1);
  }
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

  // Load all schemas
  const schemasDir = path.join(ROOT, 'schemas');
  const avscFiles = collectAvscFiles(schemasDir).filter(f => !f.includes('schema-registry'));

  const allSchemas = [];
  for (const filePath of avscFiles) {
    try {
      const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (schema.name && schema.namespace) {
        allSchemas.push({ schema, filePath });
      }
    } catch (e) {
      console.warn(`  Warning: Could not parse ${filePath}: ${e.message}`);
    }
  }

  console.log(`Loaded ${allSchemas.length} schemas.`);

  // Build FQN → page path map for cross-reference links
  // Page paths are relative MDX paths from the outputDir root
  const fqnToPage = {};
  for (const { schema } of allSchemas) {
    const fqn = `${schema.namespace}.${schema.name}`;
    const relPath = fqnToRelPath(fqn);
    // Path relative to the index page (same directory level)
    fqnToPage[fqn] = `./${relPath}`;
  }

  // Build reverse reference index
  const referencedBy = buildReferenceIndex(allSchemas);

  // Group schemas by their sub-directory path
  const byDir = {};
  for (const { schema, filePath } of allSchemas) {
    const fqn = `${schema.namespace}.${schema.name}`;
    const relPath = fqnToRelPath(fqn);
    const dir = relPath.includes('/') ? relPath.split('/').slice(0, -1).join('/') : '';
    if (!byDir[dir]) byDir[dir] = [];
    byDir[dir].push({ schema, filePath, fqn, relPath });
  }

  // Create output directories and write files
  fs.mkdirSync(outputDir, { recursive: true });

  let written = 0;

  for (const [dir, schemas] of Object.entries(byDir)) {
    const targetDir = dir ? path.join(outputDir, dir) : outputDir;
    fs.mkdirSync(targetDir, { recursive: true });

    // Write _category_.json for Docusaurus sidebar
    if (dir) {
      const ns = schemas[0].schema.namespace;
      const categoryJson = {
        label: namespaceLabel(ns),
        position: namespaceSidebarPosition(ns),
        link: { type: 'generated-index' }
      };
      fs.writeFileSync(
        path.join(targetDir, '_category_.json'),
        JSON.stringify(categoryJson, null, 2) + '\n'
      );
    }

    // Write each schema page
    for (const { schema, fqn, relPath } of schemas) {
      const regEntry = registry.schemas[fqn];
      const mdx = generateSchemaPage(schema, regEntry, fqnToPage, referencedBy, config);
      const fileName = relPath.split('/').pop() + '.mdx';
      fs.writeFileSync(path.join(targetDir, fileName), mdx);
      written++;
    }
  }

  // Write root _category_.json
  const rootCategory = {
    label: 'Schemas',
    position: 1,
    link: { type: 'doc', id: 'index' }
  };
  fs.writeFileSync(
    path.join(outputDir, '_category_.json'),
    JSON.stringify(rootCategory, null, 2) + '\n'
  );

  // Write index.mdx
  const indexMdx = generateIndexPage(allSchemas, fqnToPage, registry);
  fs.writeFileSync(path.join(outputDir, 'index.mdx'), indexMdx);

  console.log(`\n✓ Generated ${written} schema pages + index.mdx`);
  console.log(`  Output: ${outputDir}`);
}

main();
