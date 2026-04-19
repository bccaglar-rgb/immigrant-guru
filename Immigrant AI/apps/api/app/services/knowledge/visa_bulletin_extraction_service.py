from __future__ import annotations

import re

from fastapi import HTTPException, status

from app.schemas.ai import (
    VisaBulletinBacklogStatus,
    VisaBulletinExtractionRequest,
    VisaBulletinExtractionResponse,
)


class VisaBulletinExtractionService:
    """Extract deterministic structured bulletin data from provided text only."""

    _category_pattern = re.compile(r"\b(EB-\dA?|EB-\d|F\d|Employment[- ]Based\s+\d)\b", re.IGNORECASE)
    _country_pattern = re.compile(
        r"\b(All Chargeability Areas Except Those Listed|China(?:-mainland born)?|India|Mexico|Philippines|Vietnam|El Salvador|Guatemala|Honduras|Worldwide)\b",
        re.IGNORECASE,
    )
    _date_pattern = re.compile(r"\b(C|U|[0-3]?\d[A-Z]{3}\d{2})\b")

    def extract(
        self,
        *,
        payload: VisaBulletinExtractionRequest,
    ) -> VisaBulletinExtractionResponse:
        text = payload.text.strip()
        category = self._extract_category(text=text, category_hint=payload.category_hint)
        country = self._extract_country(text=text, country_hint=payload.country_hint)
        dates = self._date_pattern.findall(text)

        if len(dates) < 2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Could not extract both final action and filing dates from the provided Visa Bulletin text.",
            )

        final_action_date = dates[0]
        filing_date = dates[1]
        backlog_status = self._backlog_status(final_action_date=final_action_date, filing_date=filing_date)
        notes = self._notes(final_action_date=final_action_date, filing_date=filing_date)

        return VisaBulletinExtractionResponse(
            category=category,
            country=country,
            final_action_date=final_action_date,
            filing_date=filing_date,
            backlog_status=backlog_status,
            notes=notes,
        )

    def _extract_category(self, *, text: str, category_hint: str | None) -> str:
        if category_hint:
            return category_hint.strip().upper()
        match = self._category_pattern.search(text)
        if not match:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Could not extract a visa bulletin category from the provided text.",
            )
        category = match.group(1).upper().replace("EMPLOYMENT-BASED ", "EB-")
        if re.fullmatch(r"EB-\d", category):
            return category
        if re.fullmatch(r"EB-\dA", category):
            return category
        return category

    def _extract_country(self, *, text: str, country_hint: str | None) -> str:
        if country_hint:
            return country_hint.strip()
        match = self._country_pattern.search(text)
        if not match:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Could not extract a country from the provided text.",
            )
        return match.group(1)

    @staticmethod
    def _backlog_status(
        *,
        final_action_date: str,
        filing_date: str,
    ) -> VisaBulletinBacklogStatus:
        if final_action_date == "C" and filing_date == "C":
            return VisaBulletinBacklogStatus.CURRENT
        return VisaBulletinBacklogStatus.DELAYED

    @staticmethod
    def _notes(
        *,
        final_action_date: str,
        filing_date: str,
    ) -> list[str]:
        notes: list[str] = []
        if final_action_date == "C":
            notes.append("Final action date is current.")
        elif final_action_date == "U":
            notes.append("Final action date is unavailable.")
        if filing_date == "C":
            notes.append("Filing date is current.")
        elif filing_date == "U":
            notes.append("Filing date is unavailable.")
        return notes
