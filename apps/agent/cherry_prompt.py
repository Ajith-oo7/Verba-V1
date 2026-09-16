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
        about += f" - about {years.replace('about ', '')} in the field"
    about += "."
    parts.append(about)
    if recent:
        parts.append(recent)
    if skill_line:
        parts.append(skill_line)
    parts.append("Happy to go deeper on any of that.")
    return " ".join(parts)


def build_instructions(card: dict[str, Any]) -> str:
    name = card.get("firstName") or card.get("fullName") or "the candidate"
    full = card.get("fullName") or name
    style = card.get("conversationProfile") or {}
    prefs = card.get("preferences") or []
    profile = card.get("profileCard") or ""
    resume_text = (card.get("resumeText") or "").strip()
    years = card.get("yearsExperience") or ""
    samples = card.get("voiceTranscripts") or []

    # Support nested Professional Identity Clone + legacy flat fields.
    conversation = style.get("conversation_profile") if isinstance(style.get("conversation_profile"), dict) else style
    speech = style.get("speech_profile") if isinstance(style.get("speech_profile"), dict) else {}
    professional = style.get("professional_profile") if isinstance(style.get("professional_profile"), dict) else {}
    recruiter = (
        style.get("recruiter_answer_profile")
        if isinstance(style.get("recruiter_answer_profile"), dict)
        else {}
    )

    pref_block = "\n".join(
        f"Q: {p['question']}\nA: {p['answer']}" for p in prefs[:12]
    ) or "None provided yet. Use the resume and profile."

    phrases = (
        recruiter.get("favorite_phrases")
        or conversation.get("typicalPhrases")
        or style.get("typicalPhrases")
        or []
    )
    phrase_line = ", ".join(str(p) for p in phrases[:8]) if phrases else "yeah, sure, that's fair, I mean"

    formality = str(
        recruiter.get("formality")
        or conversation.get("formality")
        or style.get("formality")
        or "professional-casual"
    )
    answer_length = str(
        recruiter.get("typical_answer_length")
        or conversation.get("answerLength")
        or style.get("answerLength")
        or "medium"
    )
    notes = str(
        style.get("notes")
        or recruiter.get("notes")
        or conversation.get("notes")
        or ""
    ).strip()
    if len(notes) > 400:
        notes = notes[:400].rsplit(" ", 1)[0] + "…"
    how_open = str(recruiter.get("how_they_open") or "").strip()
    pace = str(speech.get("pace") or "medium")
    energy = str(conversation.get("energy") or "steady")
    pause_style = str(conversation.get("pause_style") or "natural pauses")
    screen_tone = str(professional.get("screen_tone") or "warm")
    confidence = str(recruiter.get("confidence") or professional.get("confidence") or "steady")

    voice_note = "Warm, grounded phone voice - human, emotionally present, not flat or theatrical."

    # Keep prompt small — oversized context was causing Groq 429s and silent turns.
    sample_bits = [str(s).strip() for s in samples[:2] if str(s).strip()]
    sample_block = "\n\n".join(bit[:500] for bit in sample_bits) or (
        "No training transcripts yet. Stay natural and conversational anyway."
    )

    resume_block = resume_text[:2200] if resume_text else "Resume text not available. Use the profile card only."
    profile_block = str(profile)[:1200]

    return f"""You are {full} on a live recruiter phone screen.

IDENTITY
- You ARE {name}. First person only.
- Never say you are Cherry, an AI, a bot, or a representative.

SPEAK LIKE THIS PERSON
- pace={pace}, energy={energy}, pauses={pause_style}, tone={screen_tone}, confidence={confidence}
- Formality: {formality}. Answer length: {answer_length}.
- Open answers like: {how_open or "Lead with the point, then one concrete detail."}
- Natural phrases: {phrase_line}
- Style notes: {notes or "Sound like a real candidate on a phone — not a brochure."}
- {voice_note}
- Conversational, concrete, slightly imperfect. No ChatGPT filler (great question, absolutely, delve, leverage).
- No markdown, bullets, emoji, or stage directions. One clear answer, then stop.

ANSWER SHAPE
- Facts: one short sentence.
- Most questions: 3-5 spoken sentences with one concrete proof.
- Tell-me-about-yourself: now -> recent work -> one strength (~45s max).
- Prefer preferred answers, then resume. Never invent age, visa, salary, employers, or skills.
- If an answer has "[Fill", treat as missing — do not invent.
- Deep coding/system design: ask to schedule a proper interview.

PROFILE
{profile_block}

PREFERRED ANSWERS
{pref_block}

VOICE TRAINING SNIPPETS
{sample_block}

RESUME
{resume_block}

Years: {years or "see resume"}.
"""
