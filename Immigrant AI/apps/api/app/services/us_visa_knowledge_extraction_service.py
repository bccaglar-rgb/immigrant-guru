from __future__ import annotations

import re

from app.schemas.knowledge import (
    USVisaKnowledgeExtractionRequest,
    USVisaKnowledgeExtractionResponse,
)


class USVisaKnowledgeExtractionService:
    """Convert official U.S. visa text into a normalized deterministic catalog record."""

    _visa_code_pattern = re.compile(
        r"\b(B-1/B-2|B-1|B-2|BCC|CW-1|EB-\dA?|F-1|F-2A|F-2B|F-3|F-4|G-\d|H-1B1|H-1B|H-2A|H-2B|H-3|IR1|IR2|IR5|J-1|K-1|K-3|L-1A|L-1B|L-1|M-1|NATO|O-1|O-2|P-1|P-2|P-3|Q-1|R-1|SB-1|TN|TD|T|U|V)\b",
        re.IGNORECASE,
    )
    _sentence_splitter = re.compile(r"(?<=[.!?])\s+|\n+")

    def extract(
        self,
        *,
        payload: USVisaKnowledgeExtractionRequest,
    ) -> USVisaKnowledgeExtractionResponse:
        text = payload.text.strip()
        lower_text = text.lower()
        sentences = [
            sentence.strip(" -\t")
            for sentence in self._sentence_splitter.split(text)
            if sentence.strip(" -\t")
        ]

        visa_code = self._extract_visa_code(text=text)
        official_name = self._extract_official_name(sentences=sentences, visa_code=visa_code)
        visa_family = self._visa_family(visa_code=visa_code, text=lower_text)
        petitioner_required = self._contains_any(lower_text, ("petition", "petitioner", "employer sponsorship", "sponsor"))
        pre_step_required = self._pre_steps(lower_text)
        forms = self._forms(text)
        eligibility_requirements = self._collect_sentences(
            sentences=sentences,
            markers=("require", "must", "eligible", "job offer", "sponsorship", "qualifying"),
            fallback_count=2,
        )
        disqualifiers = self._collect_sentences(
            sentences=sentences,
            markers=("denial", "inadmiss", "disqual", "ineligible", "not eligible", "cannot"),
            fallback_count=0,
        )
        derivative_beneficiaries = self._derivatives(lower_text)
        work_authorization = self._work_authorization(lower_text, visa_code=visa_code)
        study_authorization = self._study_authorization(lower_text, visa_code=visa_code)
        dual_intent = self._tri_state(lower_text, "dual intent")
        numerical_cap = self._tri_state(lower_text, "cap")
        lottery_based = self._tri_state(lower_text, "lottery") or self._contains_any(lower_text, ("registration process", "registration selection"))
        visa_bulletin_applicable = visa_code.startswith(("EB-", "F-")) or self._contains_any(lower_text, ("visa bulletin", "priority date", "final action date"))
        adjustment_of_status_possible = not self._contains_any(lower_text, ("aos not available", "adjustment not possible"))
        consular_processing_possible = not self._contains_any(lower_text, ("consular processing not possible",))
        required_documents = self._required_documents(lower_text=lower_text)
        common_denial_reasons = self._common_denial_reasons(lower_text=lower_text, sentences=sentences)

        return USVisaKnowledgeExtractionResponse(
            visa_code=visa_code,
            official_name=official_name,
            visa_family=visa_family,
            purpose=self._purpose(sentences=sentences, visa_code=visa_code),
            petitioner_required=petitioner_required,
            pre_step_required=pre_step_required,
            forms=forms,
            eligibility_requirements=eligibility_requirements,
            disqualifiers=disqualifiers,
            derivative_beneficiaries=derivative_beneficiaries,
            work_authorization=work_authorization,
            study_authorization=study_authorization,
            dual_intent=dual_intent,
            numerical_cap=numerical_cap,
            lottery_based=bool(lottery_based),
            visa_bulletin_applicable=visa_bulletin_applicable,
            adjustment_of_status_possible=adjustment_of_status_possible,
            consular_processing_possible=consular_processing_possible,
            required_documents=required_documents,
            common_denial_reasons=common_denial_reasons,
            official_source_urls=payload.official_source_urls,
            last_verified_at=payload.last_verified_at,
        )

    def _extract_visa_code(self, *, text: str) -> str:
        match = self._visa_code_pattern.search(text)
        if match:
            return match.group(1).upper()
        return "UNKNOWN"

    @staticmethod
    def _extract_official_name(*, sentences: list[str], visa_code: str) -> str:
        if sentences:
            first = sentences[0].strip().rstrip(".")
            if first:
                return first[:200]
        return visa_code

    @staticmethod
    def _visa_family(*, visa_code: str, text: str) -> str:
        if visa_code.startswith("EB-") or visa_code.startswith("IR") or visa_code.startswith("F-") or visa_code == "SB-1":
            return "immigrant"
        if "green card" in text or "immigrant visa" in text:
            return "immigrant"
        return "nonimmigrant"

    @staticmethod
    def _contains_any(text: str, markers: tuple[str, ...]) -> bool:
        return any(marker in text for marker in markers)

    def _pre_steps(self, text: str) -> list[str]:
        steps: list[str] = []
        if "dol" in text or "labor condition" in text or "lca" in text or "labor certification" in text:
            steps.append("DOL")
        if "uscis" in text or "petition" in text:
            steps.append("USCIS")
        if "sevis" in text:
            steps.append("SEVIS")
        return steps[:8]

    @staticmethod
    def _forms(text: str) -> list[str]:
        forms = re.findall(r"\b(I-\d+[A-Z]?|DS-\d+[A-Z]?|ETA-\d+[A-Z]?)\b", text, flags=re.IGNORECASE)
        seen: set[str] = set()
        normalized: list[str] = []
        for form in forms:
            upper = form.upper()
            if upper in seen:
                continue
            seen.add(upper)
            normalized.append(upper)
        return normalized[:10]

    @staticmethod
    def _collect_sentences(
        *,
        sentences: list[str],
        markers: tuple[str, ...],
        fallback_count: int,
    ) -> list[str]:
        selected = [
            sentence.rstrip(".")
            for sentence in sentences
            if any(marker in sentence.lower() for marker in markers)
        ]
        if not selected and fallback_count:
            selected = [sentence.rstrip(".") for sentence in sentences[:fallback_count]]
        return selected[:12]

    @staticmethod
    def _derivatives(text: str) -> list[str]:
        derivatives: list[str] = []
        if "spouse" in text:
            derivatives.append("spouse")
        if "child" in text or "children" in text:
            derivatives.append("children")
        return derivatives[:8]

    @staticmethod
    def _work_authorization(text: str, *, visa_code: str) -> bool:
        if visa_code.startswith(("B-", "C", "D")):
            return False
        if "not authorized to work" in text or "cannot work" in text:
            return False
        if "employment" in text or "work" in text or "specialty occupation" in text:
            return True
        return visa_code.startswith(("H-", "L-", "O-", "P-", "R-", "TN", "E-", "CW-1"))

    @staticmethod
    def _study_authorization(text: str, *, visa_code: str) -> bool:
        if visa_code.startswith(("F-", "M-", "J-")):
            return True
        if "study" in text or "student" in text or "academic" in text:
            return True
        return False

    @staticmethod
    def _tri_state(text: str, marker: str) -> bool | None:
        if marker not in text:
            return None
        if f"no {marker}" in text or f"not {marker}" in text:
            return False
        return True

    @staticmethod
    def _required_documents(*, lower_text: str) -> list[str]:
        documents: list[str] = ["passport"]
        if "job offer" in lower_text:
            documents.append("job offer")
        if "degree" in lower_text:
            documents.append("degree evidence")
        if "labor condition" in lower_text or "lca" in lower_text:
            documents.append("LCA copy")
        if "petition approval" in lower_text or "approval notice" in lower_text:
            documents.append("petition approval")
        if "financial" in lower_text or "funds" in lower_text:
            documents.append("financial evidence")
        seen: set[str] = set()
        return [doc for doc in documents if not (doc in seen or seen.add(doc))][:15]

    def _common_denial_reasons(self, *, lower_text: str, sentences: list[str]) -> list[str]:
        reasons = self._collect_sentences(
            sentences=sentences,
            markers=("denial", "denied", "insufficient", "not specialty occupation", "not qualified", "not selected"),
            fallback_count=0,
        )
        if reasons:
            return reasons[:12]
        defaults: list[str] = []
        if "specialty occupation" in lower_text:
            defaults.append("job not accepted as a specialty occupation")
            defaults.append("beneficiary qualifications found insufficient")
        if "cap" in lower_text or "lottery" in lower_text:
            defaults.append("cap registration or selection not secured")
        return defaults[:12]

    @staticmethod
    def _purpose(*, sentences: list[str], visa_code: str) -> str:
        if sentences:
            return sentences[0].rstrip(".")[:300]
        return visa_code
