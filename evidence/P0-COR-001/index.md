# Evidence — P0-COR-001

สถานะ: `BLOCKED` (implementation และ structural audit ผ่าน; governance/renderer approval ยังไม่ผ่าน)

## Requirement IDs

- `RAG-CORPUS-001` ถึง `RAG-CORPUS-011`
- `RF-07` corpus governance, parsing and traceability
- `RF-13` upload/archive/security baseline
- `RF-14` privacy/classification/retention boundary
- `RF-18` source ownership and approval auditability
- `SPEC-AGENT-001` inspect repository, preserve source, do not guess Open Decisions
- `OD-001`, `CR-001` ถึง `CR-015` (blocking governance/remediation references)

## Files changed

- `scripts/audit_corpus.py` — deterministic DOCX/TXT structural auditor and manifest verifier
- `scripts/test_corpus_audit.py` — regression tests for frozen counts, determinism, comparator preservation, conflict mapping and macro quarantine
- `scripts/__init__.py`
- `docs/corpus/README.md`
- `docs/corpus/corpus-manifest.json` — snapshot `corpus-2026-08-10`
- `plan.md` — task state and blocker

## Commands and actual results

```text
python scripts/audit_corpus.py --input doc_rag_test --output docs/corpus/corpus-manifest.json --snapshot-id corpus-2026-08-10
CORPUS_MANIFEST_WRITTEN docs\corpus\corpus-manifest.json
MANIFEST_DIGEST sha256:53d5313b3cdbcc00f79596c4804f3a630afbb6fadbf50b147336cd1f7108ace1
BASELINE_MATCH True

python scripts/audit_corpus.py --input doc_rag_test --verify docs/corpus/corpus-manifest.json
CORPUS_MANIFEST_VERIFIED sha256:53d5313b3cdbcc00f79596c4804f3a630afbb6fadbf50b147336cd1f7108ace1

python -m unittest scripts/test_corpus_audit.py -v
Ran 7 tests ... OK

python -m compileall -q scripts
exit 0
```

Existing GUI baseline was also rechecked: `pnpm lint` exit 0 and `pnpm build` exit 0 (Vite transformed 1,592 modules).

## Acceptance results

| Acceptance criterion | Result | Evidence |
|---|---|---|
| 17 files, DOCX 16 + TXT 1 | PASS | manifest `summary` |
| total bytes 1,701,883 | PASS | manifest `summary` |
| non-empty body paragraphs 1,322 | PASS | direct DOCX body paragraphs + 7 TXT blank-line paragraphs |
| source paragraph occurrences 1,578 | PASS | ordered DOCX paragraph descendants including table cells + TXT paragraphs |
| 6 tables / 74 rows / 6 embedded images | PASS | manifest `summary` |
| SHA-256, MIME, size and deterministic source set | PASS | manifest `files` and `integrity` |
| rerun produces identical manifest/digest | PASS | verifier + deterministic unit test |
| OOXML `w:sdtContent` and `≤` comparator retained | PASS | regression test for `กองสาธารณสุข (2).docx`; `≤ 6` present |
| macro/invalid/empty input is rejected/quarantined | PASS | temporary macro DOCX regression test; all current sources parseable |
| CR-001..CR-015 are quarantined, not ACTIVE | PASS | per-file `governance.blockedBy`; `activeIndexEligibleFileCount=0` |
| every file has approved owner/authority/effective date and disposition | BLOCKED | owner/authority/date require `OD-001`; fail-safe fields remain incomplete |
| rendered page count and blank-page baseline is re-confirmed | BLOCKED | Word 16.0 computed 81 pages vs `fullspec.md` reference 76; blank-page detection not performed |

Structural manifest result: `17/17` source files are checksumed and `BASELINE_MATCH=True`; `0/17` are eligible for an ACTIVE index.

## Renderer observation

The available Word COM renderer reported:

```text
WORD_VERSION=16.0
TOTAL_WORD_COM_PAGES=81
REFERENCE_FULLSPEC_PAGES=76
REFERENCE_FULLSPEC_BLANK_PAGES=5
BLANK_PAGE_DETECTION=NOT_PERFORMED
```

This discrepancy is recorded, not normalized away. An approved renderer and the source/blank-page counting convention are required before claiming page-level equivalence.

## Rollback procedure

1. Keep `doc_rag_test/` unchanged and restore the previous immutable manifest revision if one exists.
2. Remove the candidate manifest from any ingestion job input or index alias; current manifest already has zero ACTIVE-eligible files.
3. Re-run the verifier against the restored snapshot and record a new audit revision; never edit a published manifest in place.
4. If a future candidate was indexed accidentally, switch the index alias to the last approved version and retain the candidate/version/audit trail for investigation.

## Known limitations / next action

- `OD-001` is an external content-owner decision: assign each source agency/owner, classification, authority and effective date.
- Resolve the 81-versus-76 page-rendering discrepancy with the approved renderer, and verify the five blank pages.
- No source is approved or activated; this evidence intentionally does not claim P0-COR-001 Definition of Done.
- Next executable task after the blockers are cleared: `P0-GOV-002` (then continue the dependency order; `P0-COR-002` and the external approval portion of `P0-UX-001` remain gated).

## Automated unit gate checkpoint — 2026-08-12T15:20:32Z

<!-- unit-gate-runner -->
Status: **FAILED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `2e2ab65d20d6f6f8130b5b55302ebeee25aeff457e611c409376f36953c0ba7f`

### Unit-gate result

- Manifest: `task-unit-gates.v1` (`0aff1fb00bd45428804f987ebaedd674604b5553bdc9f352190a198a4e86c5ce`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `a2ae7bf86e43576b64369db584884ecb9d744fcf7e007bf3eafc256a6fb733f1`
- Pass/total: `0/5` required test IDs
- Command pass/total: `0/1`

### Commands

- `python scripts/audit_corpus.py --verify docs/corpus/corpus-manifest.json && python -m unittest scripts.test_corpus_audit -v` → exit `2`

### Acceptance

- Required commands exited with code `0`: **FAIL**
- No skipped/only/focused/flaky unit signal: **FAIL**
- No human approval state or action was used: **PASS**
- Plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **FAIL**

### Rollback note

Restore the previous plan/evidence revision and redeploy the previous signed revision. No production data mutation is performed by this runner.

### Known limitation

This checkpoint closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate evidence; missing external configuration remains fail-closed.
