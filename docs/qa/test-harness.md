# P0 QA harness

`P0-QA-002` uses only synthetic data and local provider fixtures. It does not contact Supabase,
LINE, OpenRouter, storage or any other external service.

Run the smoke harness with:

```text
python scripts/qa_harness.py --verify
python -m unittest scripts.test_qa_harness -v
```

The manifest covers tenant A/B, departments A1/A2/B1, all canonical staff/citizen roles, citizen A/B,
Bangkok clock controls, signed LINE redelivery behavior and structured provider failure fallback.
The evidence report includes the repository revision, environment, seed, model/config hash, timestamps,
fixture artifact links and a content hash. A separate probe runs an intentionally failing command and
asserts a non-zero exit code; skipped or hidden failures are not accepted as a pass.

All identifiers and content are synthetic. Production PII, credentials and active corpus material are
not permitted in this harness.
