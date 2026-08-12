# P4-PARSE-001 — Structure-aware document parsers

Status: DONE

## Traceability

- Requirement: `RF-07`, `RF-16`, `RF-17`.
- Corpus requirements: `RAG-CORPUS-001` through `RAG-CORPUS-011`.
- Authoritative sources: `fullspec.md` §2.1–2.4, §5.3, §10.4–10.5 and `plan.md` P4-PARSE-001.

## Implementation

- `packages/knowledge/src/parsers.ts` — deterministic, backend-only parser boundary for TXT/Markdown, DOCX, PDF text layer and XLSX.
- DOCX uses a bounded ZIP reader and namespace-tolerant XML tree parser. It preserves paragraph/table order, inline content controls, tracked text, tabs/manual breaks, list numbering, heading locators, table headers/rows, images and embedded-object disposition.
- TXT/Markdown preserve UTF-8/NFC display text and infer headings, lists, Markdown tables and blank-line paragraphs. Search text is a derived NFKC/Thai-digit/dash/whitespace representation; raw display text is never replaced.
- PDF accepts only a valid text layer, records coarse page locator, rejects malformed/encrypted/scanned-only input with review-queue errors, and does not claim OCR it did not run.
- XLSX preserves sheet/row/cell coordinates, shared strings, formulas plus cached values, table header paths and hidden sheet/row exclusion. Sheet/row/cell/ZIP expansion limits are explicit.
- Every result returns an extraction report with parser version, source checksum, counts, warning/error codes, media disposition, deterministic key and `activeIndexEligible: false`. Parsing never promotes content to ACTIVE.
- `packages/knowledge/src/parsers.test.ts` contains the frozen-corpus and adversarial parser suite; `__snapshots__/parsers.test.ts.snap` is the checked-in golden summary for all 17 corpus files.

## Verification evidence

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/knowledge/src/parsers.test.ts` | PASS — 7/7 tests |
| `pnpm exec vitest run packages/knowledge/src/parsers.test.ts -u` | PASS — golden snapshot written for all 17 files |
| `pnpm exec tsc -p packages/knowledge/tsconfig.json --noEmit` | PASS |
| `pnpm test:all` | PASS — 23 test files, 154/154 unit tests, 48/48 static tests, lint, web/package typecheck, secret scan and production build |
| Corpus parse assertion | PASS — 17 files, 16 DOCX + 1 TXT, all non-empty and `READY_FOR_REVIEW` |
| DOCX comparator regression | PASS — `กองสาธารณสุข (2).docx` retains `ADL ≤ 6` and content-control text |
| XLSX synthetic contract | PASS — formula/cache, hidden sheet/row and row locator behavior |
| PDF/TXT adversarial contract | PASS — text-layer extraction, UTF-8 failure, OCR-required, password, corrupt, macro and ZIP traversal cases |

## Acceptance criteria

- [x] Structure-aware blocks are ordered and include source locators; tables retain header path and row boundaries.
- [x] DOCX content controls, hyperlinks, tabs/manual breaks, tracked text and embedded media are handled without silent empty extraction.
- [x] TXT/Markdown Unicode/Thai normalization preserves original display text and produces a deterministic derived search copy.
- [x] PDF text-layer, encrypted/corrupt/scanned-only dispositions are fail-safe; no guessed OCR text is emitted.
- [x] XLSX sheet/row/cell semantics, formula/cached value and hidden content policy are explicit.
- [x] Parser output is deterministic and golden-covered for every current corpus file.
- [x] Macro, embedded object, unsafe ZIP path, expansion limit, invalid encoding and parser failure cannot enter the active index.

## Rollback procedure

Pin the prior parser version in `knowledge_document_versions.parser_version`, reprocess into a new quarantined artifact/index namespace, compare the golden/lineage report, and leave the prior approved active version untouched until the new artifact is reviewed. If a parser regression is detected, disable the parser version and route the revision to `NEEDS_REVIEW`/`FAILED`; do not repair source meaning in code.

## Known limitations

- PDF support is text-layer only; OCR and visual/rendered text diff remain a review/production integration step.
- DOCX page layout and visible-text coverage are not inferred from XML; approved renderer comparison remains post-production work.
- Corpus governance remains quarantined by `OD-001` and `CR-001`–`CR-015`; successful parsing is not content approval.
- Production sandbox/worker deployment and durable artifact persistence are delivered by subsequent P4 index/AI tasks.
