from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps" / "agent"))

from eval_transcript import score_transcript  # noqa: E402
from cherry_prompt import load_corpus  # noqa: E402


def main() -> None:
    corpus = load_corpus()
    turns = []
    for item in corpus["dialogues"]:
        turns.append({"speaker": "recruiter", "text": item["recruiter"]})
        turns.append({"speaker": "cherry", "text": item["bad"]})
    bad = score_transcript(turns)
    good_turns = []
    for item in corpus["dialogues"]:
        good_turns.append({"speaker": "recruiter", "text": item["recruiter"]})
        good_turns.append({"speaker": "cherry", "text": item["good"]})
    good = score_transcript(good_turns)
    print(json.dumps({"badRepliesShouldFail": bad, "templatedGoods": good}, indent=2))
    if bad["pass"]:
        raise SystemExit("Expected canned bad replies to fail the rubric.")


if __name__ == "__main__":
    main()
