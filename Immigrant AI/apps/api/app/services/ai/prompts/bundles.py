from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Sequence

from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.ai import StrategyContextMode
from app.schemas.immigration_case import ImmigrationCaseRead
from app.schemas.user_profile import UserProfileRead

@dataclass(frozen=True)
class StrategyPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class PathwayProbabilityPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class TimelineSimulationPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class CountryComparisonPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class AlternativeStrategiesPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class ActionPrioritizationPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class ProfileWeaknessPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class DocumentAnalysisPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class CopilotPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class GroundingPromptReference:
    source_id: str
    source_name: str
    source_type: str
    country: str | None
    visa_type: str | None
    language: str | None
    authority_level: str
    published_at: str | None
    verified_at: str | None
    relevance_score: float
    match_reason: str
    excerpt: str

