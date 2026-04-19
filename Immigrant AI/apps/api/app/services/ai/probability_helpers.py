from __future__ import annotations

from collections.abc import Iterable


def deduplicate_strings(values: Iterable[str], *, limit: int) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []

    for raw_value in values:
        value = raw_value.strip()
        if not value:
            continue

        normalized = value.casefold()
        if normalized in seen:
            continue

        seen.add(normalized)
        result.append(value)
        if len(result) >= limit:
            break

    return result


def contains_any_keyword(value: str | None, keywords: tuple[str, ...]) -> bool:
    normalized = (value or "").strip().lower()
    return any(keyword in normalized for keyword in keywords)
