# Corpus audit baseline

`corpus-manifest.json` is the deterministic audit snapshot for `doc_rag_test/`.
The project owner has declared this bundle to be the authentic municipal source
for the canary tenant. `authorized-source-policy.json` is the versioned receipt
for that authority. It makes intact files eligible for the screened ingestion
pipeline; it does **not** send all extracted text directly to the public index.

Generate the snapshot:

```powershell
python scripts/audit_corpus.py --input doc_rag_test --output docs/corpus/corpus-manifest.json --snapshot-id corpus-2026-08-10
```

Verify reproducibility without rewriting the artifact:

```powershell
python scripts/audit_corpus.py --input doc_rag_test --verify docs/corpus/corpus-manifest.json
```

Run the regression checks:

```powershell
python -m unittest scripts/test_corpus_audit.py -v
```

The audit walks DOCX `w:sdtContent`, keeps paragraph/table ordering statistics,
records ZIP/XML and embedded-media warnings, and preserves source hashes. A
macro, archive, encoding, or no-text failure is rejected and quarantined. An
intact file is `activeIndexEligible: true` only for the screened pipeline;
the activation generator applies the conflict ledger and excludes PII, personal
phone numbers, screenshots, templates, expired content, undecoded QR links, and
affected conflict segments. `CR-001` through `CR-015` remain attached to their
source records with a deterministic safe-answer policy in
`conflict-ledger.json`.

For the production MVP, run `scripts/authorized_corpus_activation.py` with
`--activation-mode safe-facts-mvp`. This activates all 17 audited source
records, but exposes only six certified exact-fact anchors plus title-derived
provenance chunks. The broader `full-screened` artifact remains offline until
each additional answerable segment receives structured validation.
