"""Profile-based immigration analysis — no case required.

Takes an authenticated user's profile and returns personalized
visa recommendations, risk flags, and a clear next step.
Fully deterministic — no AI calls needed.
"""

from __future__ import annotations

from app.models.user_profile import UserProfile


# Top visa pathways with simple rule-based matching
_VISA_PATHS = [
    {
        "visa_type": "EB-2 NIW",
        "country": "United States",
        "category": "work",
        "requires_employer": False,
        "min_education": "master",
        "min_experience": 5,
        "min_capital": 0,
        "description": "National Interest Waiver — self-petition, no employer sponsor needed.",
    },
    {
        "visa_type": "H-1B",
        "country": "United States",
        "category": "work",
        "requires_employer": True,
        "min_education": "bachelor",
        "min_experience": 0,
        "min_capital": 0,
        "description": "Specialty occupation visa — requires employer sponsorship and lottery selection.",
    },
    {
        "visa_type": "EB-1A",
        "country": "United States",
        "category": "work",
        "requires_employer": False,
        "min_education": "master",
        "min_experience": 10,
        "min_capital": 0,
        "description": "Extraordinary ability — for top professionals with major achievements.",
    },
    {
        "visa_type": "O-1A",
        "country": "United States",
        "category": "work",
        "requires_employer": False,
        "min_education": "bachelor",
        "min_experience": 8,
        "min_capital": 0,
        "description": "Extraordinary ability visa — for recognized experts in their field.",
    },
    {
        "visa_type": "Express Entry",
        "country": "Canada",
        "category": "work",
        "requires_employer": False,
        "min_education": "bachelor",
        "min_experience": 1,
        "min_capital": 0,
        "description": "Points-based immigration — fast processing, no employer needed.",
    },
    {
        "visa_type": "Provincial Nominee",
        "country": "Canada",
        "category": "work",
        "requires_employer": False,
        "min_education": "bachelor",
        "min_experience": 2,
        "min_capital": 0,
        "description": "Province-specific nomination with lower requirements than Express Entry.",
    },
    {
        "visa_type": "EU Blue Card",
        "country": "Germany",
        "category": "work",
        "requires_employer": True,
        "min_education": "bachelor",
        "min_experience": 0,
        "min_capital": 0,
        "description": "High-skilled worker permit for EU — requires job offer with minimum salary.",
    },
    {
        "visa_type": "Skilled Worker",
        "country": "United Kingdom",
        "category": "work",
        "requires_employer": True,
        "min_education": "bachelor",
        "min_experience": 0,
        "min_capital": 0,
        "description": "Points-based work visa — requires employer sponsor and minimum salary.",
    },
    {
        "visa_type": "EB-5 Investor",
        "country": "United States",
        "category": "investment",
        "requires_employer": False,
        "min_education": None,
        "min_experience": 0,
        "min_capital": 800000,
        "description": "Investor visa — $800K+ investment in a US business that creates 10 jobs.",
    },
    {
        "visa_type": "E-2 Treaty Investor",
        "country": "United States",
        "category": "investment",
        "requires_employer": False,
        "min_education": None,
        "min_experience": 0,
        "min_capital": 100000,
        "description": "Treaty investor visa — substantial investment in a US business.",
    },
    {
        "visa_type": "DV Lottery",
        "country": "United States",
        "category": "work",
        "requires_employer": False,
        "min_education": "high_school",
        "min_experience": 0,
        "min_capital": 0,
        "description": "Diversity Visa lottery — random selection, free to enter annually.",
    },
    {
        "visa_type": "F-1 Student",
        "country": "United States",
        "category": "study",
        "requires_employer": False,
        "min_education": "high_school",
        "min_experience": 0,
        "min_capital": 30000,
        "description": "Student visa — requires acceptance from a US university.",
    },
]

_EDUCATION_RANK = {
    "high_school": 1,
    "vocational": 2,
    "associate": 3,
    "bachelor": 4,
    "master": 5,
    "doctorate": 6,
    "other": 2,
}

_DV_INELIGIBLE_COUNTRIES = {
    "india", "china", "mexico", "philippines", "south korea",
    "united kingdom", "canada", "brazil", "colombia", "dominican republic",
    "el salvador", "haiti", "honduras", "jamaica", "pakistan", "vietnam",
    "bangladesh", "nigeria",
}


def _education_meets(user_level: str | None, required: str | None) -> bool:
    if required is None:
        return True
    if user_level is None:
        return False
    return _EDUCATION_RANK.get(user_level, 0) >= _EDUCATION_RANK.get(required, 0)


def _score_visa(profile: UserProfile, visa: dict) -> dict | None:
    """Return a match dict or None if disqualified."""

    target = (profile.target_country or "").strip().lower()
    visa_country = visa["country"].lower()

    # Filter by target country if user specified one
    if target and visa_country not in target and target not in visa_country:
        return None

    score = 50  # base
    user_rank = _EDUCATION_RANK.get(profile.education_level or "", 0)

    # Education
    if _education_meets(profile.education_level, visa.get("min_education")):
        score += 15
        # Bonus for advanced degree matching advanced visa requirement
        req_rank = _EDUCATION_RANK.get(visa.get("min_education") or "", 0)
        if user_rank >= 5 and req_rank >= 5:
            score += 8
    else:
        score -= 20

    # Experience
    exp = profile.years_of_experience or 0
    min_exp = visa.get("min_experience", 0)
    if exp >= min_exp:
        score += min(15, (exp - min_exp) * 2)
    else:
        score -= (min_exp - exp) * 5

    # Penalty for overqualified professionals on low-bar visas
    if visa["visa_type"] in ("F-1 Student", "DV Lottery") and user_rank >= 5 and exp >= 5:
        score -= 25

    # Capital
    capital = float(profile.available_capital or 0)
    min_cap = visa.get("min_capital", 0)
    if min_cap > 0:
        if capital >= min_cap:
            score += 10
        else:
            return None  # hard disqualifier for investment visas

    # English
    eng = profile.english_level or "none"
    eng_bonus = {"none": -10, "basic": -5, "intermediate": 0, "advanced": 5, "fluent": 10, "native": 12}
    score += eng_bonus.get(eng, 0)

    # Profession bonus
    if profile.profession:
        score += 5

    # Self-petition bonus for experienced professionals
    if not visa.get("requires_employer") and exp >= 5 and user_rank >= 5:
        score += 5

    # DV Lottery special rule
    if visa["visa_type"] == "DV Lottery":
        nat = (profile.nationality or "").strip().lower()
        if nat in _DV_INELIGIBLE_COUNTRIES:
            return None

    # Risk flags
    if profile.criminal_record_flag:
        score -= 15
    if profile.prior_visa_refusal_flag:
        score -= 10

    score = max(5, min(98, score))

    level = "high" if score >= 70 else "medium" if score >= 45 else "low"

    return {
        "visa_type": visa["visa_type"],
        "country": visa["country"],
        "category": visa["category"],
        "match_score": score,
        "match_level": level,
        "description": visa["description"],
        "requires_employer": visa["requires_employer"],
    }


def _build_profile_summary(profile: UserProfile) -> dict:
    parts = []
    if profile.nationality:
        parts.append(f"{profile.nationality} citizen")
    if profile.profession:
        exp = profile.years_of_experience or 0
        parts.append(f"{profile.profession} with {exp} years of experience")
    if profile.education_level:
        labels = {
            "high_school": "high school diploma",
            "vocational": "vocational training",
            "associate": "associate degree",
            "bachelor": "bachelor's degree",
            "master": "master's degree",
            "doctorate": "doctorate",
        }
        parts.append(labels.get(profile.education_level, profile.education_level))
    if profile.english_level and profile.english_level != "none":
        parts.append(f"{profile.english_level} English")
    if profile.available_capital:
        parts.append(f"${float(profile.available_capital):,.0f} available capital")

    summary_text = ", ".join(parts) if parts else "Profile incomplete"
    return {
        "text": summary_text,
        "nationality": profile.nationality,
        "profession": profile.profession,
        "education_level": profile.education_level,
        "english_level": profile.english_level,
        "years_of_experience": profile.years_of_experience,
        "available_capital": str(profile.available_capital) if profile.available_capital else None,
        "target_country": profile.target_country,
    }


def _detect_challenges(profile: UserProfile) -> list[dict]:
    challenges = []

    if not profile.education_level or _EDUCATION_RANK.get(profile.education_level, 0) < 4:
        challenges.append({
            "title": "Education level",
            "description": "Many skilled worker visas require at least a bachelor's degree.",
            "severity": "medium",
        })

    if not profile.english_level or profile.english_level in ("none", "basic"):
        challenges.append({
            "title": "English proficiency",
            "description": "Limited English may reduce eligibility for English-speaking countries.",
            "severity": "high",
        })

    capital = float(profile.available_capital or 0)
    if capital < 5000:
        challenges.append({
            "title": "Limited budget",
            "description": "Immigration filing fees, legal costs, and relocation expenses can add up quickly.",
            "severity": "medium",
        })

    if profile.criminal_record_flag:
        challenges.append({
            "title": "Criminal record",
            "description": "A criminal record may trigger inadmissibility. Legal review is strongly recommended.",
            "severity": "high",
        })

    if profile.prior_visa_refusal_flag:
        challenges.append({
            "title": "Prior visa refusal",
            "description": "Previous refusals may affect future applications. Strong documentation will be important.",
            "severity": "medium",
        })

    exp = profile.years_of_experience or 0
    if exp < 2:
        challenges.append({
            "title": "Limited work experience",
            "description": "Most skilled worker visas prefer 2+ years of relevant experience.",
            "severity": "low",
        })

    return challenges


def analyze_profile(profile: UserProfile) -> dict:
    """Run deterministic profile analysis and return structured result."""

    summary = _build_profile_summary(profile)

    # Score all visas
    matches = []
    for visa in _VISA_PATHS:
        result = _score_visa(profile, visa)
        if result:
            matches.append(result)

    # Sort by score descending, take top 3
    matches.sort(key=lambda m: m["match_score"], reverse=True)
    top_matches = matches[:3]

    # Build recommendation
    recommendation = None
    if top_matches:
        best = top_matches[0]
        reasons = []
        if best["match_score"] >= 70:
            reasons.append(f"strong profile alignment with {best['visa_type']} requirements")
        if not best["requires_employer"]:
            reasons.append("no employer sponsorship needed")
        if profile.education_level in ("master", "doctorate"):
            reasons.append("your advanced degree strengthens eligibility")
        if (profile.years_of_experience or 0) >= 5:
            reasons.append(f"your {profile.years_of_experience} years of experience is a strong signal")

        reason_text = ", ".join(reasons) if reasons else "it has the highest match with your profile"
        recommendation = {
            "visa_type": best["visa_type"],
            "country": best["country"],
            "match_score": best["match_score"],
            "reason": f"Your best option is {best['visa_type']} ({best['country']}) because {reason_text}.",
        }

    challenges = _detect_challenges(profile)

    return {
        "profile_summary": summary,
        "visa_matches": top_matches,
        "recommendation": recommendation,
        "challenges": challenges,
        "next_step": "Create your case to start this path. We'll guide you through documents, timeline, and strategy.",
    }
