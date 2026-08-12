# Corpus audit baseline

`corpus-manifest.json` is the deterministic audit snapshot for `doc_rag_test/`.
It is an audit artifact, not an approval to index the files.

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
records ZIP/XML and embedded-media warnings, and preserves source hashes. It
uses `RESTRICTED` as a fail-safe classification while `OD-001` is unresolved.
Every source is `activeIndexEligible: false`; owner, authority, effective date,
and conflict disposition require content-owner approval. `CR-001` through
`CR-015` are attached to the affected source records where the mapping is
defined by `fullspec.md`.
