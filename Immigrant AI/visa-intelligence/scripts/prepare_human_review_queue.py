from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TARGET_ROOT = ROOT / "visa-intelligence"
REVIEW_DIR = TARGET_ROOT / "human_review_queue"
DASHBOARD_PATH = REVIEW_DIR / "review_dashboard.json"
NOTES_PATH = REVIEW_DIR / "review_notes.md"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    records = []
    for path in sorted(REVIEW_DIR.glob("*.json")):
        if path.name in {"review_dashboard.json"}:
            continue
        record = load_json(path)
        notes = record.get("validation_notes") or ["manual_review_required"]
        records.append(
            {
                "visa_code": record.get("visa_code"),
                "field_in_question": notes[0],
                "issue_type": "ambiguous_or_validation_failure",
                "conflicting_or_missing_sources": record.get("official_source_urls") or [],
                "codex_extracted_value": None,
                "recommended_manual_action": "Manual legal review before publish",
            }
        )

    DASHBOARD_PATH.write_text(json.dumps(records, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    lines = ["# Human Review Notes", ""]
    for item in records:
        lines.append(f"## {item['visa_code']}")
        lines.append(f"- Field: {item['field_in_question']}")
        lines.append(f"- Issue: {item['issue_type']}")
        lines.append(f"- Recommended action: {item['recommended_manual_action']}")
        lines.append("")
    NOTES_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
