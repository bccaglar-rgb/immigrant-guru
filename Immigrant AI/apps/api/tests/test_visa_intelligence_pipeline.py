from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


ROOT = Path("/Users/burakcagdascaglar/Claude/Bitrium/Immigrant AI")


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_build_record_does_not_infer_petition_form_from_i_forms() -> None:
    module = load_module(
        "build_us_visa_catalog",
        ROOT / "apps" / "api" / "scripts" / "build_us_visa_catalog.py",
    )

    record = module.record(
        visa_code="TEST",
        official_name="Test Visa",
        visa_family="immigrant",
        purpose="Test purpose",
        official_forms=["I-485", "DS-260"],
        official_source_keys=["directory_of_visa_categories"],
    )

    assert record["petition_form"] == []


def test_validate_record_accepts_treaty_note_without_nationality_list() -> None:
    module = load_module(
        "validate_draft_records",
        ROOT / "visa-intelligence" / "scripts" / "validate_draft_records.py",
    )

    record = {
        "visa_code": "E-3",
        "official_name": "Australian Specialty Occupation Worker",
        "visa_family": "nonimmigrant",
        "official_source_urls": ["https://travel.state.gov/example"],
        "last_verified_at": "2026-04-05",
        "confidence_level": "high",
        "visa_bulletin_applicable": False,
        "lottery_based": False,
        "numerical_cap": True,
        "treaty_required": True,
        "treaty_nationalities": [],
        "treaty_nationality_note": "Available only to Australian nationals.",
        "sevis_required": False,
        "petition_form": [],
        "petitioner_required": False,
        "derivative_visas": [],
    }

    blocking, warnings = module.validate_record(
        record,
        all_codes={"E-3"},
        allowed_domains={"travel.state.gov"},
    )

    assert blocking == []
    assert "treaty_required_without_explicit_nationalities" not in warnings


def test_validate_main_clears_stale_outputs(tmp_path: Path) -> None:
    module = load_module(
        "validate_draft_records_stale",
        ROOT / "visa-intelligence" / "scripts" / "validate_draft_records.py",
    )

    draft_dir = tmp_path / "draft"
    approved_dir = tmp_path / "approved"
    review_dir = tmp_path / "review"
    report_dir = tmp_path / "reports"
    raw_dir = tmp_path / "raw"

    draft_dir.mkdir()
    approved_dir.mkdir()
    review_dir.mkdir()
    report_dir.mkdir()
    raw_dir.mkdir()

    (approved_dir / "stale.json").write_text("{}", encoding="utf-8")
    (review_dir / "stale.json").write_text("{}", encoding="utf-8")
    (raw_dir / "source_index.json").write_text(
        json.dumps({"allowed_domains": ["travel.state.gov"]}),
        encoding="utf-8",
    )
    (draft_dir / "sample.json").write_text(
        json.dumps(
            {
                "visa_code": "B-1",
                "official_name": "Visitor",
                "visa_family": "nonimmigrant",
                "official_source_urls": [
                    "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/all-visa-categories.html"
                ],
                "last_verified_at": "2026-04-05",
                "confidence_level": "high",
                "visa_bulletin_applicable": False,
                "lottery_based": False,
                "treaty_required": False,
                "sevis_required": False,
                "petition_form": [],
                "petitioner_required": False,
                "derivative_visas": [],
                "validation_notes": [],
            }
        ),
        encoding="utf-8",
    )

    module.DRAFT_DIR = draft_dir
    module.APPROVED_DIR = approved_dir
    module.REVIEW_DIR = review_dir
    module.REPORT_DIR = report_dir
    module.SOURCE_INDEX_PATH = raw_dir / "source_index.json"
    module.LATEST_REPORT_PATH = report_dir / "latest.json"

    module.main()

    assert not (approved_dir / "stale.json").exists()
    assert not (review_dir / "stale.json").exists()
    assert (approved_dir / "sample.json").exists()


def test_publish_skips_runtime_failed_records(tmp_path: Path, monkeypatch) -> None:
    module = load_module(
        "publish_approved_records",
        ROOT / "visa-intelligence" / "scripts" / "publish_approved_records.py",
    )

    approved_dir = tmp_path / "approved"
    report_dir = tmp_path / "reports"
    runtime_report = tmp_path / "runtime_validation_report.json"
    import_log = report_dir / "import_log.json"

    approved_dir.mkdir()
    report_dir.mkdir()

    (approved_dir / "ir1.json").write_text(
        json.dumps(
            {
                "visa_code": "IR1/CR1",
                "official_name": "Immediate Relative / Conditional Resident Spouse of a U.S. Citizen",
                "visa_family": "immigrant",
                "source_version": "2026-04",
            }
        ),
        encoding="utf-8",
    )

    runtime_report.write_text(
        json.dumps(
            {
                "results": [
                    {
                        "visa_code": "IR1/CR1",
                        "status": "human_review",
                        "issues": ["source_content_missing_category_signal"],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    module.APPROVED_DIR = approved_dir
    module.REPORT_DIR = report_dir
    module.IMPORT_LOG_PATH = import_log
    module.RUNTIME_REPORT_PATH = runtime_report
    monkeypatch.setattr(sys, "argv", ["publish_approved_records.py"])

    module.main()

    data = json.loads(import_log.read_text(encoding="utf-8"))
    assert data["imported_records"] == []
    assert data["skipped_records"][0]["reason"].startswith("runtime_validation_failed:")
