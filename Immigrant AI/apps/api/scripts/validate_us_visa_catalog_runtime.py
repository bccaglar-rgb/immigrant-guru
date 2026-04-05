from __future__ import annotations

import json
import re
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

try:
    from urllib3.exceptions import NotOpenSSLWarning

    warnings.filterwarnings("ignore", category=NotOpenSSLWarning)
except Exception:
    pass


ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "packages" / "data" / "us_visa_kb"

CATALOG_PATH = DATA_DIR / "visa_catalog.json"
SOURCE_INDEX_PATH = DATA_DIR / "source_index.json"
RUNTIME_REPORT_PATH = DATA_DIR / "runtime_validation_report.json"
RUNTIME_REVIEW_QUEUE_PATH = DATA_DIR / "runtime_human_review_queue.json"

TIMEOUT = 20
USER_AGENT = "ImmigrantAI-USVisaValidator/1.0"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def host_allowed(url: str, allowed_domains: set[str]) -> bool:
    host = urlparse(url).netloc.lower()
    return any(host == domain or host.endswith(f".{domain}") for domain in allowed_domains)


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().lower()


def token_variants(record: dict[str, Any]) -> list[str]:
    tokens: list[str] = []
    visa_code = record.get("visa_code")
    official_name = record.get("official_name")
    purpose = record.get("purpose")
    if visa_code:
        tokens.extend(
            {
                visa_code.lower(),
                visa_code.lower().replace("-", " "),
                visa_code.lower().replace("-", ""),
            }
        )
    if official_name:
        tokens.append(normalize_text(official_name))
    if purpose:
        first_phrase = normalize_text(purpose).split(".")[0]
        if first_phrase:
            tokens.append(first_phrase)
    return [token for token in tokens if token]


def fetch_sources(urls: list[str]) -> dict[str, dict[str, Any]]:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    results: dict[str, dict[str, Any]] = {}
    for url in urls:
        try:
            response = session.get(url, timeout=TIMEOUT, allow_redirects=True)
            text = response.text if response.ok else ""
            results[url] = {
                "ok": response.ok,
                "status_code": response.status_code,
                "final_url": response.url,
                "text": normalize_text(text[:200000]),
            }
        except Exception as exc:  # pragma: no cover - network failure path
            results[url] = {
                "ok": False,
                "status_code": None,
                "final_url": url,
                "text": "",
                "error": str(exc),
            }
    return results


def detect_conflicts(record: dict[str, Any], source_payloads: list[dict[str, Any]]) -> list[str]:
    issues: list[str] = []
    texts = [payload["text"] for payload in source_payloads if payload.get("ok") and payload.get("text")]
    if not texts or len(texts) < 2:
        return issues

    if record.get("lottery_based") is True:
        has_positive = any("lottery" in text or "selection" in text for text in texts)
        has_negative = any("not subject to" in text and "lottery" in text for text in texts)
        if has_positive and has_negative:
            issues.append("source_conflict_lottery_signals")

    if record.get("treaty_required") is True:
        has_positive = any("treaty" in text for text in texts)
        has_negative = any("not a treaty" in text or "no treaty" in text for text in texts)
        if has_positive and has_negative:
            issues.append("source_conflict_treaty_signals")

    if record.get("sevis_required") is True:
        has_positive = any("sevis" in text or "i-20" in text or "ds-2019" in text for text in texts)
        has_negative = any("not sevis" in text for text in texts)
        if has_positive and has_negative:
            issues.append("source_conflict_sevis_signals")

    return issues


def validate_record(
    record: dict[str, Any],
    all_catalog_codes: set[str],
    allowed_domains: set[str],
    fetch_cache: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    issues: list[str] = []
    urls = record.get("official_source_urls") or []

    for field in [
        "visa_code",
        "official_name",
        "visa_family",
        "official_source_urls",
        "last_verified_at",
        "confidence_level",
    ]:
        value = record.get(field)
        if value in (None, "", []):
            issues.append(f"missing_required_field:{field}")

    if record.get("visa_family") == "immigrant" and record.get("visa_bulletin_applicable") is None:
        issues.append("immigrant_missing_explicit_visa_bulletin_flag")

    if record.get("lottery_based") is True and not (
        record.get("numerical_cap") is True or (record.get("lottery_notes") or "").strip()
    ):
        issues.append("lottery_requires_cap_or_notes")

    treaty_required = record.get("treaty_required")
    treaty_nationalities = record.get("treaty_nationalities") or []
    treaty_note = (record.get("treaty_nationality_note") or "").strip().lower()
    if treaty_required is True and not treaty_nationalities and treaty_note not in {"see source", "see official source"} and not treaty_note:
        issues.append("treaty_required_without_nationalities_or_note")

    if record.get("sevis_required") is True:
        category_group = (record.get("category_group") or "").lower()
        visa_code = (record.get("visa_code") or "").upper()
        if category_group not in {"study", "exchange"} and visa_code not in {"F-1", "M-1", "J-1"}:
            issues.append("sevis_required_for_non_student_exchange_category")

    petition_form = record.get("petition_form") or []
    if petition_form and record.get("petitioner_required") is not True:
        issues.append("petition_form_without_petitioner_required")

    derivative_visas = set(record.get("derivative_visas") or [])
    overlapping_derivatives = sorted(code for code in derivative_visas if code in all_catalog_codes)
    if overlapping_derivatives:
        issues.append(f"derivative_visa_modeled_as_primary:{','.join(overlapping_derivatives)}")

    if (record.get("confidence_level") or "").lower() == "low":
        issues.append("low_confidence_must_not_be_in_production_catalog")

    for url in urls:
        if not host_allowed(url, allowed_domains):
            issues.append(f"disallowed_domain:{url}")

    source_payloads = [fetch_cache[url] for url in urls]
    for url, payload in zip(urls, source_payloads):
        if not payload.get("ok"):
            issues.append(f"url_not_200:{url}")

    tokens = token_variants(record)
    matched_source = False
    for payload in source_payloads:
        text = payload.get("text") or ""
        if any(token in text for token in tokens):
            matched_source = True
            break
    if urls and not matched_source:
        issues.append("source_content_missing_category_signal")

    issues.extend(detect_conflicts(record, source_payloads))

    return {
        "visa_code": record.get("visa_code"),
        "official_name": record.get("official_name"),
        "status": "passed" if not issues else "human_review",
        "issues": sorted(set(issues)),
        "source_urls_checked": urls,
    }


def main() -> None:
    catalog: list[dict[str, Any]] = load_json(CATALOG_PATH)
    source_index = load_json(SOURCE_INDEX_PATH)
    allowed_domains = set(source_index["allowed_domains"])

    all_urls = sorted({url for record in catalog for url in (record.get("official_source_urls") or [])})
    fetch_cache = fetch_sources(all_urls)
    all_catalog_codes = {record["visa_code"] for record in catalog}

    results: list[dict[str, Any]] = []
    review_queue: list[dict[str, Any]] = []

    for record in catalog:
        result = validate_record(record, all_catalog_codes, allowed_domains, fetch_cache)
        results.append(result)
        if result["status"] != "passed":
            review_record = dict(record)
            review_record["requires_human_review"] = True
            review_record["validation_notes"] = sorted(set((review_record.get("validation_notes") or []) + result["issues"]))
            review_queue.append(review_record)

    report = {
        "generated_at": now_iso(),
        "validated_records": len(catalog),
        "passed_records": sum(1 for result in results if result["status"] == "passed"),
        "failed_records": sum(1 for result in results if result["status"] != "passed"),
        "url_checks": {
            "checked_urls": len(all_urls),
            "ok_urls": sum(1 for payload in fetch_cache.values() if payload.get("ok")),
            "failed_urls": sum(1 for payload in fetch_cache.values() if not payload.get("ok")),
        },
        "results": results,
    }

    RUNTIME_REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    RUNTIME_REVIEW_QUEUE_PATH.write_text(
        json.dumps(review_queue, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
