from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
TARGET_ROOT = ROOT / "visa-intelligence"
DRAFT_DIR = TARGET_ROOT / "normalized" / "draft"
APPROVED_DIR = TARGET_ROOT / "normalized" / "approved"
REVIEW_DIR = TARGET_ROOT / "human_review_queue"
REPORT_DIR = TARGET_ROOT / "validation_reports"
SOURCE_INDEX_PATH = TARGET_ROOT / "raw_sources" / "source_index.json"
LATEST_REPORT_PATH = REPORT_DIR / "latest.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def host_allowed(url: str, allowed_domains: set[str]) -> bool:
    host = urlparse(url).netloc.lower()
    return any(host == domain or host.endswith(f".{domain}") for domain in allowed_domains)


def validate_record(record: dict, all_codes: set[str], allowed_domains: set[str]) -> tuple[list[str], list[str]]:
    blocking: list[str] = []
    warnings: list[str] = []

    for field in [
        "visa_code",
        "official_name",
        "visa_family",
        "official_source_urls",
        "last_verified_at",
        "confidence_level",
    ]:
        if record.get(field) in (None, "", []):
            blocking.append(f"missing_required_field:{field}")

    if record.get("visa_family") == "immigrant" and record.get("visa_bulletin_applicable") is None:
        blocking.append("immigrant_requires_explicit_visa_bulletin_flag")

    if record.get("lottery_based") is True and not (
        record.get("numerical_cap") is True or (record.get("lottery_notes") or "").strip()
    ):
        blocking.append("lottery_requires_cap_or_notes")

    if record.get("treaty_required") is True:
        treaty_note = (record.get("treaty_nationality_note") or "").strip().lower()
        if not (record.get("treaty_nationalities") or []) and not treaty_note:
            warnings.append("treaty_required_without_explicit_nationalities")

    if record.get("sevis_required") is True:
        if (record.get("category_group") or "").lower() not in {"study", "exchange"} and record.get("visa_code") not in {"F-1", "M-1", "J-1"}:
            blocking.append("sevis_required_for_non_student_exchange_category")

    if (record.get("petition_form") or []) and record.get("petitioner_required") is not True:
        warnings.append("petition_form_present_without_petitioner_required_true")

    derivative_visas = set(record.get("derivative_visas") or [])
    overlaps = sorted(code for code in derivative_visas if code in all_codes)
    if overlaps:
        warnings.append(f"derivative_visa_also_exists_as_primary:{','.join(overlaps)}")

    if (record.get("confidence_level") or "").lower() == "low":
        blocking.append("low_confidence_must_not_publish")

    for url in record.get("official_source_urls") or []:
        if not host_allowed(url, allowed_domains):
            blocking.append(f"disallowed_domain:{url}")

    return sorted(set(blocking)), sorted(set(warnings))


def main() -> None:
    APPROVED_DIR.mkdir(parents=True, exist_ok=True)
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    for path in APPROVED_DIR.glob("*.json"):
        path.unlink()
    for path in REVIEW_DIR.glob("*.json"):
        path.unlink()

    source_index = load_json(SOURCE_INDEX_PATH)
    allowed_domains = set(source_index["allowed_domains"])
    draft_files = sorted(DRAFT_DIR.glob("*.json"))
    records = [load_json(path) for path in draft_files]
    all_codes = {record["visa_code"] for record in records if record.get("visa_code")}

    report_rows = []

    for path, record in zip(draft_files, records):
        blocking, warnings = validate_record(record, all_codes, allowed_domains)
        status = "approved" if not blocking else "human_review"
        report_rows.append(
            {
                "file": path.name,
                "visa_code": record.get("visa_code"),
                "status": status,
                "blocking_issues": blocking,
                "warnings": warnings,
            }
        )
        target_path = (
            APPROVED_DIR / path.name if status == "approved" else REVIEW_DIR / path.name
        )
        normalized_record = dict(record)
        normalized_record["validation_notes"] = sorted(
            set((normalized_record.get("validation_notes") or []) + blocking + warnings)
        )
        normalized_record["requires_human_review"] = status != "approved"
        target_path.write_text(
            json.dumps(normalized_record, indent=2, ensure_ascii=True) + "\n",
            encoding="utf-8",
        )

    LATEST_REPORT_PATH.write_text(
        json.dumps(
            {
                "generated_at": now_iso(),
                "draft_records": len(draft_files),
                "approved_records": sum(1 for row in report_rows if row["status"] == "approved"),
                "human_review_records": sum(1 for row in report_rows if row["status"] != "approved"),
                "results": report_rows,
            },
            indent=2,
            ensure_ascii=True,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
