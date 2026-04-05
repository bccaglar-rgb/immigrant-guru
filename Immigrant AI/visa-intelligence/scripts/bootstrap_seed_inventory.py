from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SEED_DIR = ROOT / "packages" / "data" / "us_visa_kb"
TARGET_ROOT = ROOT / "visa-intelligence"
DRAFT_DIR = TARGET_ROOT / "normalized" / "draft"
RAW_SOURCES_DIR = TARGET_ROOT / "raw_sources"


def slugify(visa_code: str) -> str:
    return visa_code.lower().replace("/", "_").replace(" ", "_").replace("-", "_")


def main() -> None:
    DRAFT_DIR.mkdir(parents=True, exist_ok=True)
    RAW_SOURCES_DIR.mkdir(parents=True, exist_ok=True)

    for path in DRAFT_DIR.glob("*.json"):
        path.unlink()

    catalog = json.loads((SEED_DIR / "visa_catalog.json").read_text(encoding="utf-8"))
    source_index = json.loads((SEED_DIR / "source_index.json").read_text(encoding="utf-8"))

    for record in catalog:
        filename = f"{slugify(record['visa_code'])}.json"
        (DRAFT_DIR / filename).write_text(
            json.dumps(record, indent=2, ensure_ascii=True) + "\n",
            encoding="utf-8",
        )

    (RAW_SOURCES_DIR / "source_index.json").write_text(
        json.dumps(source_index, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
