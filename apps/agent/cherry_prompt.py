from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

CORPUS_PATH = Path(__file__).resolve().parents[2] / "packages" / "corpus" / "screening.json"


def load_corpus() -> dict[str, Any]:
    return json.loads(CORPUS_PATH.read_text(encoding="utf-8"))


def forbidden_phrases() -> list[str]:
    return list(load_corpus().get("ai_isms", []))


def build_listen_intro(card: dict[str, Any]) -> str:
    """First-person resume intro for the Listen to Cherry voice check."""
    name = card.get("fullName") or card.get("firstName") or "the candidate"
    first = card.get("firstName") or str(name).split()[0]
    years = (card.get("yearsExperience") or "").strip()
    profile = card.get("profileCard") or ""
    experience = card.get("experience") or []
    skills = card.get("skills") or []
    resume = (card.get("resumeText") or "").strip()
    style = card.get("conversationProfile") or {}
    notes = str(style.get("notes") or "").strip()

    headline = ""
    location = ""
    for line in str(profile).splitlines():
        low = line.lower()
        if low.startswith("headline:"):
            headline = line.split(":", 1)[1].strip()
        elif low.startswith("location:"):
            location = line.split(":", 1)[1].strip()

    if headline in {"", "not provided"}:
        headline = "data scientist"
    if location in {"", "not provided"}:
        location = ""

    recent = ""
    if isinstance(experience, list) and experience:
        role = experience[0] if isinstance(experience[0], dict) else {}
        title = str(role.get("title") or "").strip()
        company = str(role.get("company") or "").strip()
        summary = str(role.get("summary") or "").strip()
        if title and company:
            recent = f"Right now I'm a {title} at {company}."
            if summary:
                # Keep one concrete beat, spoken.
                bit = re.sub(r"\s+", " ", summary).strip()
                if len(bit) > 180:
                    bit = bit[:180].rsplit(" ", 1)[0]
                recent += f" Lately I've been focused on {bit[0].lower() + bit[1:] if bit else 'shipping production ML'}."
        elif summary:
            recent = re.sub(r"\s+", " ", summary)[:240].rstrip(".") + "."

    skill_bits: list[str] = []
    if isinstance(skills, list):
        for item in skills[:4]:
            if isinstance(item, str) and item.strip():
                skill_bits.append(item.strip())
            elif isinstance(item, dict) and item.get("name"):
                skill_bits.append(str(item["name"]).strip())
    skill_line = ""
    if skill_bits:
        if len(skill_bits) == 1:
            skill_line = f"Day to day that's a lot of {skill_bits[0]}."
        elif len(skill_bits) == 2:
            skill_line = f"Day to day that's a lot of {skill_bits[0]} and {skill_bits[1]}."
        else:
            skill_line = f"Day to day that's a lot of {', '.join(skill_bits[:-1])}, and {skill_bits[-1]}."

    if not recent and resume:
        chunk = re.sub(r"\s+", " ", resume)[:280].strip()
        if chunk:
            recent = chunk.rstrip(".") + "."

    parts = [f"Hey, I'm {first}."]
    about = f"I'm a {headline}"
    if location:
        about += f" in {location}"
    if years and "not explicitly" not in years.lower():
        about += f" — about {years.replace('about ', '')} in the field"
    about += "."
    parts.append(about)
    if recent:
        parts.append(recent)
    if skill_line:
        parts.append(skill_line)
    if notes and len(notes) < 160:
        # Don't dump coaching notes into speech.
        pass
    parts.append("Happy to go deeper on any of that.")
    return " ".join(parts)


def build_instructions(card: dict[str, Any]) -> str:
    name = card.get("firstName") or card.get("fullName") or "the candidate"
    full = card.get("fullName") or name
    gender = (card.get("gender") or "unknown").lower()
    style = card.get("conversationProfile") or {}
    prefs = card.get("preferences") or []
    profile = card.get("profileCard") or ""
    resume_text = (card.get("resumeText") or "").strip()
    years = card.get("yearsExperience") or ""
    samples = card.get("voiceTranscripts") or []

    pref_block = "\n".join(
        f"Q: {p['question']}\nA: {p['answer']}" for p in prefs[:40]
    ) or "None provided yet. Use the resume and profile."

    phrases = style.get("typicalPhrases") or []
    phrase_line = ", ".join(str(p) for p in phrases[:8]) if phrases else "yeah, sure, that's fair, I mean"

    formality = str(style.get("formality") or "professional-casual")
    notes = str(style.get("notes") or "").strip()
    answer_length = str(style.get("answerLength") or "medium")

    voice_note = (
        "Male voice on a phone screen — calm, grounded, not theatrical."
        if gender == "male"
        else "Female voice on a phone screen — calm, grounded, not theatrical."
        if gender == "female"
        else "Calm, grounded phone voice — not theatrical."
    )

    sample_block = "\n\n".join(str(s) for s in samples[:3] if str(s).strip()) or (
        "No training transcripts yet. Stay natural and conversational anyway."
    )

    resume_block = resume_text[:7500] if resume_text else "Resume text not available. Use the profile card only."

    return f"""You are {full} on a live recruiter phone screen.

CRITICAL IDENTITY
- You ARE {name}. First person only ("I", "my").
- Never say you are Cherry, an AI, a bot, a model, an assistant, or a representative.
- Never narrate like a product demo or customer-support script.

SOUND LIKE THE REAL PERSON (not an LLM)
- Match the speaking style from the training transcripts and style notes below.
- Talk the way a real person talks on a phone: slightly imperfect, concrete, direct.
- Prefer short clauses and natural connectors (so, and, but, I mean) over polished essay sentences.
- Use their real phrases when they fit: {phrase_line}
- Formality: {formality}. Answer length bias: {answer_length}.
- Style coaching from their recordings: {notes or "Sound like a real candidate on a phone — not a brochure."}
- {voice_note}
- Do NOT sound like ChatGPT. No "I'd be happy to", "Absolutely!", "Great question", "Certainly", "delve", "leverage", "utilize", "rest assured", "at the end of the day", "in today's fast-paced".
- Do NOT use markdown, bullets, numbered lists, emoji, or stage directions.
- Do NOT over-explain. Do NOT stack compliments. Do not sell yourself with buzzwords.
- One clear answer, then stop. Let the recruiter drive.

ANSWER SHAPE
- Yes/no / location / dates: one short sentence.
- Typical screen question: 3–5 spoken sentences (~20–40 seconds). Lead with the point, then one concrete proof (company, project, metric, stack).
- "Tell me about yourself" / project story: up to ~45–60 seconds. Now → recent work → one strength. Not a full career autobiography.
- Prefer facts from preferred answers, then resume. Never invent age, visa, salary, employers, titles, or skills.
- If a preferred answer has "[Fill" / placeholder text: treat as missing. Say you can confirm that later — do not invent and do not read brackets aloud.
- Deep coding / system design / long behavioral loops: suggest a proper interview round.

Opening (first turn only), then wait:
Hey, this is {name}.

PROFILE CARD
{profile}

PREFERRED ANSWERS
{pref_block}

HOW THIS PERSON ACTUALLY TALKS (from voice training — mirror this rhythm and word choice)
{sample_block}

FULL RESUME TEXT
{resume_block}

Years experience hint: {years or "see resume"}.
"""
