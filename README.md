# Bank Communications Avro Schemas

Avro schema definitions for a banking communications platform. Covers core banking entities, all major communication channels, and a full range of statement types. Includes reference data schemas for templates and customer preferences, an `AUTO` meta-channel that cascades delivery across channels at runtime, and pre-composed document support for AFP and other print formats.

## Standards Alignment

| Domain | Standard |
|---|---|
| Core account & transaction data | [UK Open Banking Read/Write API](https://standards.openbanking.org.uk/api-specifications/) (OBAccount, OBTransaction, OBBalance, OBStatement, OBProduct) |
| Payment & party data | [ISO 20022](https://www.iso20022.org/) (PostalAddress, PartyIdentification, CashAccount, RemittanceInformation, BankTransactionCode) |
| Investment & open finance | [Brazil Open Finance](https://openfinancebrasil.atlassian.net/) (Investimentos, Previdência, Consentimento, Notificacoes) |
| Pension statements | [DWP Simpler Annual Statements](https://www.gov.uk/government/publications/simpler-annual-statements) + FCA COBS 19 |
| Mortgage statements | FCA MCOB (Mortgage Conduct of Business rules) |
| Consumer credit | FCA CONC (Consumer Credit sourcebook) |
| Fraud notifications | UK Finance Fraud Code + FCA BCOBS |
| Currency codes | ISO 4217 |
| Country codes | ISO 3166-1 alpha-2 |
| Language tags | BCP 47 |
| Security identifiers | ISIN (ISO 6166), SEDOL |
| LEI | ISO 17442 |
| Merchant category codes | ISO 8583 MCC |

---

## Repository Structure

```
schemas/
├── common/
│   ├── enums/                      # Shared enumeration types
│   │   ├── AccountStatus.avsc
│   │   ├── BalanceType.avsc
│   │   ├── ChannelType.avsc        # Includes AUTO meta-channel
│   │   ├── CommunicationEventType.avsc
│   │   ├── CreditDebitIndicator.avsc
│   │   ├── FeeType.avsc
│   │   ├── InterestRateType.avsc
│   │   ├── MessagePriority.avsc
│   │   ├── MessageStatus.avsc
│   │   ├── PartyType.avsc
│   │   ├── ProductType.avsc
│   │   ├── StatementFrequency.avsc
│   │   ├── TemplateStatus.avsc
│   │   └── TransactionStatus.avsc
│   ├── Address.avsc                # ISO 20022 PostalAddress + UK Royal Mail
│   ├── ContactDetails.avsc         # Email, mobile, phone (E.164)
│   ├── Identifier.avsc             # NI, Passport, CRN, LEI, IBAN, etc.
│   └── Money.avsc                  # Amount (string) + ISO 4217 currency
│
├── core/                           # Core banking domain entities
│   ├── Account.avsc                # UK Open Banking OBAccount6
│   ├── Balance.avsc                # UK Open Banking OBBalance + ISO 20022
│   ├── Fees.avsc                   # UK Open Banking OBFeeChargeDetail
│   ├── FxFees.avsc                 # FX markup, cross-border, ATM fees
│   ├── InterestCharge.avsc         # ISO 20022 TransactionInterest4
│   ├── InterestRate.avsc           # Tiered, fixed, variable, tracker rates
│   ├── Party.avsc                  # ISO 20022 PartyIdentification135
│   ├── Product.avsc                # UK Open Banking OBProduct2
│   ├── ProductHolding.avsc         # Party-product-account association
│   └── Transaction.avsc            # UK Open Banking OBTransaction6
│
├── reference/                      # Reference & configuration data
│   ├── ChannelTemplate.avsc        # Channel-specific template config
│   ├── CommunicationPreferences.avsc  # Customer channel consent & preferences
│   └── Template.avsc               # Template catalogue entry
│
├── events/                         # Event envelope schemas
│   ├── CommunicationEvent.avsc     # Top-level event with payload union
│   └── CommunicationEventResponse.avsc  # Delivery status update event
│
├── payloads/
│   ├── statements/
│   │   ├── CommercialStatementPayload.avsc
│   │   ├── CreditCardStatementPayload.avsc
│   │   ├── CurrentAccountStatementPayload.avsc
│   │   ├── InvestmentStatementPayload.avsc   # MiFID II + ISA
│   │   ├── LoanStatementPayload.avsc
│   │   ├── MortgageStatementPayload.avsc      # FCA MCOB compliant
│   │   └── PensionStatementPayload.avsc       # DWP Simpler Statements
│   ├── letters/
│   │   ├── BankLetterPayload.avsc
│   │   └── InterestRateChangeLetterPayload.avsc
│   ├── emails/
│   │   └── InterestRateChangeEmailPayload.avsc
│   ├── sms/
│   │   └── FraudNotificationSmsPayload.avsc
│   ├── push/
│   │   └── PaymentPushNotificationPayload.avsc
│   └── documents/                  # Pre-composed document payloads (no template rendering)
│       ├── AfpDocumentPayload.avsc       # AFP/MO:DCA-P — long-term supported format
│       └── PreComposedDocumentPayload.avsc  # PDF, PostScript, PCL, proprietary
│
├── channels/
│   └── AutoChannelDispatch.avsc    # AUTO cascade resolution & audit record
│
└── schema-registry.json            # Master version changelog manifest

scripts/
├── bump-version.mjs                # CLI: bump schema semver + update registry
├── validate-schema-versions.mjs    # Validate all schemas + registry consistency
└── generate-schema-docs.mjs        # Generate Docusaurus MDX documentation

examples/
├── auto-cascade/
│   ├── interest-rate-change-auto.json  # EMAIL success on first attempt
│   ├── fraud-alert-auto.json           # SMS→PUSH (fails)→EMAIL cascade
│   └── payment-received-auto.json      # PUSH success on first attempt
└── events/
    └── current-account-statement-email.json  # Direct EMAIL channel event

package.json
schema-docs.config.json             # Doc generator config (outputDir, GitHub repo)
```

---

## Tooling

### npm Scripts

```bash
npm run validate        # Validate all schemas and registry (warnings allowed)
npm run validate:ci     # Same but exits non-zero on warnings (for CI pipelines)
npm run bump            # Bump a schema version and update the registry
npm run generate        # Generate Docusaurus MDX docs from all schemas
```

### Bumping a Schema Version

```bash
npm run bump -- --schema <FQN|shortName> --type <patch|minor|major> --change "<description>"

# Examples:
npm run bump -- --schema Money --type patch --change "Clarified amount field doc string"
npm run bump -- --schema Party --type minor --change "Added preferredName field to IndividualDetails"
npm run bump -- --schema com.bank.schemas.core.Account --type major --change "Removed deprecated subType field"
```

Short name lookup is case-insensitive. If a short name matches more than one FQN, the command fails with a disambiguation error — use the full FQN in that case.

**Bump type rules:**
| Type | Use for |
|---|---|
| `patch` | Doc/description changes only, no field or symbol changes |
| `minor` | Backward-compatible additions: new optional field (with `default`/`null`), new enum symbol |
| `major` | Breaking changes: remove field, change field type, rename field, remove enum symbol, change namespace |

### Schema Versioning

Every `.avsc` file carries three top-level properties (valid Avro — parsers ignore unknown properties):

```json
"version": "1.0.0",
"compatibility": "BACKWARD",
"status": "ACTIVE"
```

**Compatibility values:**
| Value | Meaning |
|---|---|
| `FULL` | New schema reads old data AND old schema reads new data. Used for foundational types (Money, Address, ContactDetails, Identifier) that are referenced everywhere. |
| `BACKWARD` | New schema can read data written by the old schema. Default for all other schemas. Consumers upgrade first. |
| `FORWARD` | Old schema can read data written by the new schema. Producers upgrade first. |
| `NONE` | No compatibility guarantee. Use only for schemas in active development before first production use. |

**Status values:** `ACTIVE` · `DEPRECATED` · `RETIRED`

`schema-registry.json` is the master manifest tracking current version, compatibility, status, and full changelog history for all 46 schemas.

### Generating Documentation

The generator targets [`comms-docs-demo`](https://github.com/samlarsen1/comms-docs-demo), which must be checked out as a sibling directory:

```
~/your-dir/
  comms-docs-schemas/    ← this repo
  comms-docs-demo/       ← docs site
```

Output location and GitHub link config are in `schema-docs.config.json`:

```json
{
  "outputDir": "../comms-docs-demo/website/docs/schemas",
  "schemaBaseUrl": "/schemas",
  "githubRepo": "https://github.com/samlarsen1/comms-docs-schemas",
  "githubBranch": "main"
}
```

`npm run generate` writes one MDX page per schema plus an `index.mdx` catalogue and `_category_.json` Docusaurus sidebar files, organised by namespace directory. Cross-reference links, nested type expansion, and changelog tables are generated automatically.

After running the generator, commit the output in the docs repo:

```bash
# From comms-docs-demo/website
npm run gen:schemas
git add docs/schemas/
git commit -m "chore: regenerate schema docs"
git push
```

---

## Core Concepts

### CommunicationEvent (Top-Level Envelope)

Every communication starts as a `CommunicationEvent`. It contains:

| Field | Purpose |
|---|---|
| `eventId` | UUID for idempotency & deduplication |
| `correlationId` | Links events across a business journey |
| `causationId` | ID of the upstream event that triggered this |
| `sourceSystem` | Originating system identity + environment |
| `channel` | Target channel, or `AUTO` for runtime resolution |
| `priority` | Queue priority (`LOW` / `NORMAL` / `HIGH` / `URGENT`) |
| `partyId` | The recipient party |
| `templateId` / `templateCode` | Optional explicit template override |
| `scheduledFor` | Delayed delivery timestamp |
| `expiresAt` | Do-not-deliver-after timestamp |
| `payload` | Union of all supported payload types |

### AUTO Channel

Setting `channel: AUTO` hands routing to the dispatch service, which:

1. **Loads** `CommunicationPreferences` for the party × event type × product type
2. **Filters** channels where `ChannelConsent.consentGiven = true`
3. **Orders** channels by `EventTypePreference.preferredChannelOrder`
4. **For each channel**, checks whether an `ACTIVE` `Template` exists that:
   - Lists the channel in `supportedChannels`
   - Lists the payload's Avro type in `supportedPayloadTypes`
   - Has a corresponding `ChannelTemplate` with `isActive = true`
5. **Attempts delivery** and moves to the next channel on failure (if `stopOnFirstSuccess = false` or delivery failed)
6. **Records** the full cascade attempt history in `AutoChannelDispatch`

```
AUTO event received
       │
       ▼
Load CommunicationPreferences
       │
       ▼
Build ordered channel list (consented + preferences)
       │
       ├─► Channel 1: Template exists? ──YES──► Attempt delivery ──OK──► DONE (if stopOnFirst)
       │                                                        └─FAIL──► try next channel
       │
       ├─► Channel 2: Template exists? ──NO───► Skip (log TEMPLATE_NOT_FOUND)
       │                              └─YES──► Attempt delivery ──OK──► DONE
       │
       └─► Channel N: ...
```

**AUTO channel and pre-composed documents** — `AfpDocumentPayload` and `PreComposedDocumentPayload` are not compatible with `channel: AUTO`. AFP can only be delivered to print-capable channels (POST, DOCUMENT) and requires no template rendering. Events carrying pre-composed document payloads must specify a concrete channel directly. The dispatcher rejects AUTO + pre-composed payload combinations at runtime.

### Templates & ChannelTemplates

`Template` is the catalogue entry. It declares:
- Which **channels** it supports (`supportedChannels`)
- Which **payload types** it can render (`supportedPayloadTypes`)
- Which payload fields it **requires** (`requiredPayloadFields`) — AUTO validates these before dispatch

`ChannelTemplate` stores channel-specific rendering config:
- **EMAIL**: subject line, from address, pre-header text
- **SMS**: sender ID, max length, multi-part flag
- **PUSH**: default title, deep link template, collapse key
- **DOCUMENT**: paper size, encryption, retention period
- **POST**: print provider, mail class, reply envelope

**Templates are not used for pre-composed documents.** When `CommunicationEvent.payload` is an `AfpDocumentPayload` or `PreComposedDocumentPayload`, the dispatcher skips template resolution entirely and routes the file reference directly to the delivery system. `templateId` and `templateCode` on the event must be null in this case.

### Communication Preferences

`CommunicationPreferences` captures:
- Global opt-out flag (non-mandatory comms suppressed)
- Per-channel consent with timestamps and source
- Per-event-type channel ordering (with optional product/account scoping)
- Language preference (BCP 47)
- Accessibility requirements (large print, braille, audio)
- Paperless enrolment status

---

## Pre-Composed Documents

Some documents arrive in the system already fully composed by an upstream print composition system (e.g. IBM Exstream, Sefas Fusion, OpenText). These do not go through template rendering — the file is retrieved from object storage and routed to a print or document delivery system as-is.

### Two payload types

| Schema | Format | Status |
|---|---|---|
| `AfpDocumentPayload` | AFP / MO:DCA-P | Long-term supported. Full AFP resource model, print control, and archive index fields. |
| `PreComposedDocumentPayload` | PDF, PostScript, PCL, XPS, HTML, Proprietary | Pass-through delivery. Channel constraints declared in the payload. |

### Channel constraints

| Format | POST | DOCUMENT | EMAIL (attachment) | PUSH | SMS |
|---|:---:|:---:|:---:|:---:|:---:|
| AFP | ✓ | ✓ (AFP-capable printer) | ✗ | ✗ | ✗ |
| PostScript | ✓ | ✓ (PS-capable printer) | ✗ | ✗ | ✗ |
| PCL | ✓ | ✓ (PCL-capable printer) | ✗ | ✗ | ✗ |
| PDF | ✓ | ✓ | ✓ | ✗ | ✗ |

`PreComposedDocumentPayload.deliverableChannels` carries the permitted channels for the specific file, allowing the dispatcher to validate before attempting delivery.

### File references, not inline content

Pre-composed payloads carry a `contentUri` pointing to object storage — never the file bytes inline. Binary content embedded in Avro messages causes problems with Kafka message size limits, consumer memory pressure, and event log replay. The delivery system retrieves the file using the URI after message consumption.

Use permanent internal URIs with IAM-controlled access for internal systems. If pre-signed URLs are necessary, set `contentUriExpiresAt` and ensure the TTL extends well beyond the maximum expected queue depth on the receiving print system.

### AFP specifics

AFP (MO:DCA-P) is the long-term supported pre-composed format. Key operational considerations:

- **Resource groups must be pre-staged.** The print server requires the AFP resource group (fonts, overlays, page/form definitions) to be available before the print job arrives. `AfpDocumentPayload.afpResources.resourceGroupUri` points to the resource group; the delivery system is responsible for staging it.

- **Archive index tags are required for document management systems.** AFP statements and letters are typically stored in a content management system (IBM Content Manager, OpenText) for retrieval. `AfpDocumentPayload.archiveIndex.indexTags` carries the key-value index written at archive time. Agree the vocabulary (`ACCOUNT_ID`, `STATEMENT_PERIOD`, `DOC_TYPE`, `PARTY_ID`, etc.) with the archive system team before going live.

- **Conversion for archive.** Some archive systems cannot serve AFP for download and require a PDF copy. `AfpDocumentPayload.requiresConversionForArchive = true` instructs the delivery system to run AFP→PDF conversion after printing and store the PDF alongside the original.

- **Print control data.** `AfpDocumentPayload.printControl` carries simplex/duplex, copy count, paper tray, and output bin. Paper tray is particularly important when documents require pre-printed letterhead stock.

---

## Schema Load Order

Schemas reference each other by fully-qualified name. When loading into a schema registry or parser, use this dependency order:

```
1. schemas/common/enums/*.avsc       (no dependencies)
2. schemas/common/Money.avsc
3. schemas/common/Address.avsc
4. schemas/common/ContactDetails.avsc
5. schemas/common/Identifier.avsc
6. schemas/core/*.avsc               (depends on common/*)
7. schemas/reference/*.avsc          (depends on common/*, core/*)
8. schemas/payloads/**/*.avsc        (depends on common/*)
9. schemas/events/*.avsc             (depends on all payloads + common/enums)
10. schemas/channels/*.avsc          (depends on events/*)
```

---

## Channel Coverage Matrix

### Templated payloads

| Event Type | EMAIL | SMS | PUSH | DOCUMENT | POST | IN_APP |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Statement (Current Account) | ✓ | — | — | ✓ | ✓ | ✓ |
| Statement (Credit Card) | ✓ | — | — | ✓ | ✓ | ✓ |
| Statement (Mortgage) | ✓ | — | — | ✓ | ✓ | — |
| Statement (Loan) | ✓ | — | — | ✓ | ✓ | — |
| Statement (Investment) | ✓ | — | — | ✓ | ✓ | — |
| Statement (Pension) | ✓ | — | — | ✓ | ✓ | — |
| Statement (Commercial) | ✓ | — | — | ✓ | ✓ | — |
| Interest Rate Change | ✓ | — | — | ✓ | ✓ | — |
| Payment Received/Sent | ✓ | ✓ | ✓ | — | — | ✓ |
| Fraud Alert | ✓ | ✓ | ✓ | — | — | ✓ |
| Bank Letter | ✓ | — | — | ✓ | ✓ | — |

### Pre-composed documents (no template rendering)

| Payload | DOCUMENT | POST | EMAIL |
|---|:---:|:---:|:---:|
| `AfpDocumentPayload` | ✓ (AFP-capable) | ✓ | ✗ |
| `PreComposedDocumentPayload` (PDF) | ✓ | ✓ | ✓ (attachment) |
| `PreComposedDocumentPayload` (PostScript / PCL) | ✓ | ✓ | ✗ |

---

## Payload Union in CommunicationEvent

The `payload` field in `CommunicationEvent` is an Avro named union. The dispatcher uses the Avro type name to discriminate the payload and determine whether template rendering applies.

```json
"payload": [
  "com.bank.schemas.payloads.statements.CurrentAccountStatementPayload",
  "com.bank.schemas.payloads.statements.CreditCardStatementPayload",
  "com.bank.schemas.payloads.statements.MortgageStatementPayload",
  "com.bank.schemas.payloads.statements.LoanStatementPayload",
  "com.bank.schemas.payloads.statements.InvestmentStatementPayload",
  "com.bank.schemas.payloads.statements.PensionStatementPayload",
  "com.bank.schemas.payloads.statements.CommercialStatementPayload",
  "com.bank.schemas.payloads.letters.BankLetterPayload",
  "com.bank.schemas.payloads.letters.InterestRateChangeLetterPayload",
  "com.bank.schemas.payloads.emails.InterestRateChangeEmailPayload",
  "com.bank.schemas.payloads.sms.FraudNotificationSmsPayload",
  "com.bank.schemas.payloads.push.PaymentPushNotificationPayload",
  "com.bank.schemas.payloads.documents.AfpDocumentPayload",
  "com.bank.schemas.payloads.documents.PreComposedDocumentPayload"
]
```

In JSON encoding, the union branch is specified by the fully-qualified type name as a key:
```json
"payload": {
  "com.bank.schemas.payloads.push.PaymentPushNotificationPayload": { ... }
}
```

**Dispatcher branching on payload type:**
```
if payload type in {AfpDocumentPayload, PreComposedDocumentPayload}:
    → skip template resolution
    → validate channel is compatible with format
    → retrieve file from contentUri
    → route to delivery system
else:
    → resolve template (explicit or by eventType + channel + language)
    → render payload against template
    → deliver rendered output
```

---

## Key Design Decisions

**Monetary amounts as strings** — `Money.amount` is a `string` (e.g. `"1234.56"`) to avoid IEEE 754 floating-point precision issues in financial calculations.

**Timestamps as `long` with `timestamp-millis`** — Avro logical type `timestamp-millis` on a `long` field represents UTC milliseconds since Unix epoch. All timestamps are UTC.

**Dates as ISO 8601 strings** — Calendar dates (birth dates, effective dates, statement periods) are `string` in `YYYY-MM-DD` format to avoid timezone ambiguity.

**Nullable fields default to `null`** — Optional fields use Avro union `["null", T]` with `"default": null` so schemas are forward-compatible.

**AUTO channel is non-deliverable directly** — `ChannelType.AUTO` is a meta-channel only. `ChannelTemplate.channel` must never be `AUTO`. Templates declare concrete channels only.

**Payload re-use across channels** — A single payload (e.g. `InterestRateChangeLetterPayload`) can be rendered by templates on multiple channels. The template's `supportedPayloadTypes` and `ChannelTemplate` configurations handle channel-specific rendering differences.

**Pre-composed documents never embed binary content** — `AfpDocumentPayload` and `PreComposedDocumentPayload` carry a `contentUri` reference to object storage, not the file bytes. This keeps Kafka messages small and event logs replayable. The delivery system retrieves the file after consumption.

**Pre-composed documents bypass the template system** — The dispatcher detects `AfpDocumentPayload` and `PreComposedDocumentPayload` by payload type and skips template resolution. `templateId` and `templateCode` on the `CommunicationEvent` must be null for these payloads. The `channel` field must be a concrete channel (POST or DOCUMENT for AFP; POST, DOCUMENT, or EMAIL for PDF) — AUTO is not permitted.

**AFP is the long-term supported pre-composed format** — AFP (MO:DCA-P) has a dedicated schema with explicit fields for resource groups, print control, and archive indexing. Other pre-composed formats (PostScript, PCL, PDF) use the generic `PreComposedDocumentPayload`.

**Foundational common types use FULL compatibility** — `Money`, `Address`, `ContactDetails`, and `Identifier` are referenced by almost every other schema. They carry `"compatibility": "FULL"` (both backward and forward compatible), requiring that changes to these types be non-breaking in both directions before merging.

---

## Examples

See `examples/auto-cascade/` for annotated JSON examples illustrating the AUTO cascade logic:

- **`interest-rate-change-auto.json`** — Happy path: email succeeds on first attempt, POST channel is cancelled
- **`fraud-alert-auto.json`** — Multi-step cascade: SMS fails (no mobile), PUSH fails (expired token), EMAIL succeeds
- **`payment-received-auto.json`** — Real-time payment: PUSH succeeds immediately

See `examples/events/` for direct-channel event examples:

- **`current-account-statement-email.json`** — Full December statement with transactions, delivered directly to EMAIL channel
