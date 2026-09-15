from __future__ import annotations

import asyncio
import json
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env", override=False)

from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, function_tool
from livekit.agents.llm.chat_context import ChatMessage
from livekit.agents.voice.events import ConversationItemAddedEvent
from livekit.agents.voice.room_io import RoomOptions
from livekit.plugins import groq, silero

from cherry_prompt import build_instructions, build_listen_intro
from context_client import ContextClient
from eval_transcript import score_transcript
from orpheus_tts import OrpheusTTS, voice_for_gender


@dataclass
class CallState:
    user_id: str
    call_id: str
    mode: str
    card: dict[str, Any]
    turns: list[dict[str, Any]] = field(default_factory=list)
    started_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def parse_metadata(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return {str(k): str(v) for k, v in data.items()}
    except json.JSONDecodeError:
        pass
    return {}


def compact_unknown(name: str) -> str:
    return "I don't have that detail on hand — I can follow up."


class Cherry(Agent):
    def __init__(self, state: CallState) -> None:
        super().__init__(instructions=build_instructions(state.card))
        self._state = state

    @function_tool()
    async def missing_fact(self, topic: str) -> str:
        """Call this only when the recruiter asks for a fact that is truly not in the resume, profile, or preferred answers."""
        return compact_unknown(self._state.card.get("firstName") or "me")


def build_tts(card: dict[str, Any]):
    from audio_convert import ensure_wav_reference
    from edge_tts_engine import EdgeTTS, edge_voice_for_gender

    gender = card.get("gender")
    reference = ensure_wav_reference(card.get("referencePath"))
    engine = (os.getenv("CHERRY_TTS") or "edge").lower()

    # Clone is optional and heavy on CPU. Default to Edge so calls stay responsive.
    # Set CHERRY_TTS=chatterbox (or auto) only after the model is cached.
    want_clone = engine in {"chatterbox", "clone"} or (
        engine == "auto" and os.getenv("CHERRY_CLONE_ENABLED", "0") == "1"
    )
    if want_clone and reference:
        try:
            from chatterbox_tts import ChatterboxTTS

            nano = os.getenv("CHERRY_CHATTERBOX_NANO", "1") != "0"
            print(f"Cherry TTS engine: chatterbox clone ({reference})")
            return ChatterboxTTS(reference_wav=reference, gender=gender, nano=nano)
        except Exception as exc:
            print(f"Voice clone unavailable, falling back: {exc}")

    if engine in {"groq", "orpheus"}:
        try:
            return OrpheusTTS(voice=voice_for_gender(gender))
        except Exception as exc:
            print(f"Orpheus unavailable, using Edge TTS: {exc}")

    print(f"Cherry TTS engine: edge ({edge_voice_for_gender(gender)})")
    return EdgeTTS(voice=edge_voice_for_gender(gender))


def build_llm():
    model = os.getenv("GROQ_LLM_MODEL", "qwen/qwen3.8-27b")
    return groq.LLM(model=model, temperature=0.8)


async def resolve_session_meta(ctx: JobContext) -> dict[str, str]:
    """Room metadata is often empty on the RTC room object; job proto + room name are reliable."""
    candidates = [
        getattr(getattr(ctx, "job", None), "room", None) and getattr(ctx.job.room, "metadata", ""),
        getattr(ctx.room, "metadata", ""),
    ]
    for raw in candidates:
        meta = parse_metadata(raw if isinstance(raw, str) else "")
        if meta.get("userId"):
            return meta

    room_name = getattr(ctx.room, "name", "") or getattr(getattr(ctx.job, "room", None), "name", "")
    # Room name format: verba-{mode}-{userPrefix}-{callPrefix}
    match = re.match(
        r"^verba-(practice|simulator|edit|listen)-([a-z0-9]+)-([a-z0-9]+)$",
        room_name or "",
    )
    mode = match.group(1) if match else "practice"

    looked_up = await context_client.lookup_room(room_name)
    if looked_up.get("userId"):
        return {
            "userId": str(looked_up["userId"]),
            "callId": str(looked_up.get("callId") or ""),
            "mode": str(looked_up.get("mode") or mode),
        }

    raise RuntimeError(f"Could not resolve userId for room {room_name!r}")


server = AgentServer()
context_client = ContextClient()


@server.rtc_session()
async def cherry_session(ctx: JobContext) -> None:
    await ctx.connect()
    meta = await resolve_session_meta(ctx)
    user_id = meta.get("userId") or ""
    call_id = meta.get("callId") or ""
    mode = meta.get("mode") or "practice"
    if not user_id:
        raise RuntimeError("Room metadata is missing userId")

    card = await context_client.load(user_id)
    state = CallState(user_id=user_id, call_id=call_id, mode=mode, card=card)

    # VAD-only turn handling — avoids the broken turn-detector onnx download on Windows.
    session = AgentSession(
        stt=groq.STT(model="whisper-large-v3-turbo", language="en"),
        llm=build_llm(),
        tts=build_tts(card),
        vad=silero.VAD.load(),
        turn_detection="vad",
        allow_interruptions=True,
        min_endpointing_delay=0.45,
        max_endpointing_delay=2.8,
        tts_text_transforms=["filter_markdown", "filter_emoji"],
    )

    @session.on("conversation_item_added")
    def _on_item(ev: ConversationItemAddedEvent) -> None:
        item = ev.item
        if not isinstance(item, ChatMessage):
            return
        text = (item.text_content or "").strip()
        if not text:
            return
        speaker = "cherry" if item.role == "assistant" else "recruiter"
        state.turns.append(
            {
                "speaker": speaker,
                "text": text,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )

    await session.start(
        room=ctx.room,
        agent=Cherry(state),
        room_options=RoomOptions(text_output=True),
    )

    if mode == "simulator":
        asyncio.create_task(_run_simulator(session, state))
    elif mode == "listen":
        intro = build_listen_intro(card)
        state.turns.append(
            {
                "speaker": "cherry",
                "text": intro,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )
        await session.say(intro, allow_interruptions=False)
    else:
        await session.generate_reply(
            instructions=(
                "Give a short first-person opening as yourself — just greet and say your first name, then wait. "
                "Do not mention Cherry, AI, or being a representative."
            )
        )

    async def _persist() -> None:
        await asyncio.sleep(0.4)
        if not state.call_id:
            return
        eval_result = score_transcript(state.turns, state.card)
        try:
            await context_client.save_call(
                {
                    "callId": state.call_id,
                    "userId": state.user_id,
                    "mode": state.mode,
                    "turns": state.turns,
                    "eval": eval_result,
                    "startedAt": state.started_at,
                    "endedAt": datetime.now(timezone.utc).isoformat(),
                }
            )
        except Exception as exc:
            print(f"Failed to persist call: {exc}")

    ctx.add_shutdown_callback(_persist)


async def _run_simulator(session: AgentSession, state: CallState) -> None:
    from cherry_prompt import load_corpus

    await session.generate_reply(instructions="Give a short first-person opening as yourself, then wait.")
    await asyncio.sleep(3.5)
    corpus = load_corpus()
    questions = [
        d["recruiter"]
        for d in corpus["dialogues"]
        if d["intent"]
        in {
            "tell_me_about_yourself",
            "location",
            "work_auth",
            "salary",
            "why_looking",
            "start_date",
            "technologies",
            "next_steps",
        }
    ][:8]
    for question in questions:
        state.turns.append(
            {
                "speaker": "recruiter",
                "text": question,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )
        handle = session.generate_reply(user_input=question)
        await handle
        await asyncio.sleep(1.8)


if __name__ == "__main__":
    agents.cli.run_app(server)
