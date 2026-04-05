from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TARGET_ROOT = ROOT / "visa-intelligence"
APPROVED_DIR = TARGET_ROOT / "normalized" / "approved"
REPORT_DIR = TARGET_ROOT / "validation_reports"
IMPORT_LOG_PATH = REPORT_DIR / "import_log.json"
RUNTIME_REPORT_PATH = ROOT / "packages" / "data" / "us_visa_kb" / "runtime_validation_report.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_runtime_failures() -> dict[str, list[str]]:
    if not RUNTIME_REPORT_PATH.exists():
        return {}
    report = load_json(RUNTIME_REPORT_PATH)
    failures: dict[str, list[str]] = {}
    for row in report.get("results", []):
        if row.get("status") != "passed":
            failures[row["visa_code"]] = row.get("issues", [])
    return failures


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    runtime_failures = load_runtime_failures()

    approved_files = sorted(APPROVED_DIR.glob("*.json"))
    imported = []
    skipped = []

    for path in approved_files:
        record = load_json(path)
        missing = [
            field
            for field in ["visa_code", "official_name", "visa_family", "source_version"]
            if record.get(field) in (None, "", [])
        ]
        if missing:
            skipped.append(
                {
                    "file": path.name,
                    "visa_code": record.get("visa_code"),
                    "reason": f"missing_db_fields:{','.join(missing)}",
                }
            )
            continue

        runtime_issues = runtime_failures.get(record["visa_code"])
        if runtime_issues:
            skipped.append(
                {
                    "file": path.name,
                    "visa_code": record["visa_code"],
                    "reason": f"runtime_validation_failed:{','.join(runtime_issues)}",
                }
            )
            continue

        imported.append(
            {
                "file": path.name,
                "visa_code": record["visa_code"],
                "visa_subtype": record.get("visa_subtype"),
                "source_version": record["source_version"],
                "mode": "dry_run" if args.dry_run else "ready_for_upsert",
            }
        )

    IMPORT_LOG_PATH.write_text(
        json.dumps(
            {
                "generated_at": now_iso(),
                "dry_run": args.dry_run,
                "approved_files": len(approved_files),
                "imported_records": imported,
                "skipped_records": skipped,
            },
            indent=2,
            ensure_ascii=True,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
