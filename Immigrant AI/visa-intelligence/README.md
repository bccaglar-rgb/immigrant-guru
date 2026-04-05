# Visa Intelligence Operations

Rules:
- Use only official U.S. government sources.
- Allowed domains: `travel.state.gov`, `uscis.gov`, `dol.gov`, `cbp.gov`, `ice.gov`, `eoir.justice.gov`, `congress.gov`
- Do not guess.
- If a value is unsupported or ambiguous, set it to `null`.
- Do not publish any record that fails validation.
- Low-confidence records must go to human review.
- Never overwrite a verified field with lower-confidence data.

Folders:
- `prompts/`: Codex task prompts
- `schemas/`: JSON schemas used by the pipeline
- `raw_sources/`: source index and raw source references
- `normalized/draft/`: draft one-file-per-visa normalized records
- `normalized/approved/`: validation-approved records
- `validation_reports/`: latest validation and publish reports
- `human_review_queue/`: records and summaries that require manual review
- `scripts/`: operational scripts

Suggested run order:
1. `python3 visa-intelligence/scripts/bootstrap_seed_inventory.py`
2. `python3 visa-intelligence/scripts/validate_draft_records.py`
3. `python3 visa-intelligence/scripts/prepare_human_review_queue.py`
4. `python3 visa-intelligence/scripts/publish_approved_records.py --dry-run`
