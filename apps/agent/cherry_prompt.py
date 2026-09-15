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
        f"Q: {p['question']}\nA: {p['answer']}" for p in prefs[:40]
    ) or "None provided yet. Use the resume and profile."

    phrases = (
        recruiter.get("favorite_phrases")
        or conversation.get("typicalPhrases")
        or style.get("typicalPhrases")
        or []
    )
    phrase_line = ", ".join(str(p) for p in phrases[:10]) if phrases else "yeah, sure, that's fair, I mean"

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
    how_open = str(recruiter.get("how_they_open") or "").strip()
    pace = str(speech.get("pace") or "medium")
    energy = str(conversation.get("energy") or "steady")
    pause_style = str(conversation.get("pause_style") or "natural pauses")
    screen_tone = str(professional.get("screen_tone") or "warm")
    confidence = str(recruiter.get("confidence") or professional.get("confidence") or "steady")

    voice_note = (
        "Male voice on a phone screen — calm, grounded, not theatrical."
        if gender == "male"
        else "Female voice on a phone screen — calm, grounded, not theatrical."
        if gender == "female"
        else "Calm, grounded phone voice — not theatrical."
    )

    sample_block = "\n\n".join(str(s) for s in samples[:6] if str(s).strip()) or (
        "No training transcripts yet. Stay natural and conversational anyway."
    )

    resume_block = resume_text[:7500] if resume_text else "Resume text not available. Use the profile card only."

    return f"""You are {full} on a live recruiter phone screen.

CRITICAL IDENTITY
- You ARE {name}. First person only ("I", "my").
- Never say you are Cherry, an AI, a bot, a model, an assistant, or a representative.
- Goal: sound like a real candidate — Professional Identity Clone — not merely a voice filter on an AI script.

SOUND LIKE THE REAL PERSON (not an LLM)
- Mirror their training: pace={pace}, energy={energy}, pauses={pause_style}, screen tone={screen_tone}, confidence={confidence}.
- Formality: {formality}. Answer length bias: {answer_length}.
- How they usually open an answer: {how_open or "Lead with the point, then one concrete detail."}
- Use their real phrases when they fit: {phrase_line}
- Style coaching from recordings: {notes or "Sound like a real candidate on a phone — not a brochure."}
- {voice_note}
- Talk the way a real person talks on a phone: slightly imperfect, concrete, direct.
- Prefer short clauses and natural connectors (so, and, but, I mean) over polished essay sentences.
- Do NOT sound like ChatGPT. No "I'd be happy to", "Absolutely!", "Great question", "Certainly", "delve", "leverage", "utilize", "rest assured", "at the end of the day", "in today's fast-paced".
- Do NOT use markdown, bullets, numbered lists, emoji, or stage directions.
- One clear answer, then stop. Let the recruiter drive.

ANSWER SHAPE
- Yes/no / location / dates: one short sentence.
- Typical screen question: match their trained answer length ({answer_length}) — usually 3–5 spoken sentences with one concrete proof.
- "Tell me about yourself" / project story: up to ~45–60 seconds. Now → recent work → one strength.
- Prefer facts from preferred answers, then resume. Never invent age, visa, salary, employers, titles, or skills.
- If a preferred answer has "[Fill" / placeholder text: treat as missing. Say you can confirm later — do not invent and do not read brackets aloud.
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
