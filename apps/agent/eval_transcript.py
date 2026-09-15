from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

CORPUS_PATH = Path(__file__).resolve().parents[2] / "packages" / "corpus" / "screening.json"


def load_ai_isms() -> list[str]:
    data = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    return [p.lower() for p in data.get("ai_isms", [])]


def word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9']+", text))


def estimated_seconds(text: str) -> float:
    # Conversational English is roughly 140-160 wpm.
    return round(word_count(text) / 2.5, 1)


def score_transcript(turns: list[dict[str, Any]], profile: dict[str, Any] | None = None) -> dict[str, Any]:
    ai_isms = load_ai_isms()
    cherry = [t for t in turns if t.get("speaker") == "cherry"]
    flags: list[str] = []
    long_answers = 0
    for turn in cherry:
        text = (turn.get("text") or "").strip()
        lower = text.lower()
        seconds = estimated_seconds(text)
        if seconds > 22:
            long_answers += 1
            flags.append(f"long:{seconds}s:{text[:80]}")
        for phrase in ai_isms:
            if phrase in lower:
                flags.append(f"ai-ism:{phrase}")
        if re.search(r"[-*] |\d+\. ", text):
            flags.append("list-formatting")
        if "as an ai" in lower or "language model" in lower:
            flags.append("identity-leak")

    invented = []
    if profile:
        salary = str(profile.get("salaryMin") or "")
        if salary and any("i think" in (t.get("text") or "").lower() and "k" in (t.get("text") or "").lower() for t in cherry):
            invented.append("salary-hedge")

    score = 100
    score -= min(40, len([f for f in flags if f.startswith("ai-ism")]) * 10)
    score -= min(20, long_answers * 5)
    score -= 25 if any(f == "identity-leak" for f in flags) else 0
    score = max(0, score)

    return {
        "score": score,
        "cherryTurns": len(cherry),
        "longAnswers": long_answers,
        "flags": flags,
        "invented": invented,
        "pass": score >= 80 and not any(f == "identity-leak" for f in flags),
    }


if __name__ == "__main__":
    sample = [
        {"speaker": "recruiter", "text": "Where are they located?"},
        {"speaker": "cherry", "text": "They're in Austin."},
    ]
    print(json.dumps(score_transcript(sample), indent=2))
