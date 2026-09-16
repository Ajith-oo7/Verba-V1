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
# LiveKit ElevenLabs plugin reads ELEVEN_API_KEY; accept project alias too.
if not os.getenv("ELEVEN_API_KEY"):
    _alias = (
        os.getenv("ELEVEN_LABS_KEY") or os.getenv("ELEVENLABS_API_KEY") or ""
    ).strip()
    if _alias:
        os.environ["ELEVEN_API_KEY"] = _alias

from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, function_tool
from livekit.agents.llm.chat_context import ChatMessage
from livekit.agents.voice.events import ConversationItemAddedEvent
from livekit.agents.voice.room_io import RoomOptions
from livekit.plugins import groq, silero

from cherry_prompt import build_instructions, build_listen_intro
from context_client import ContextClient
from eval_transcript import score_transcript
from elevenlabs_clone import ensure_elevenlabs_voice, eleven_api_key
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


async def build_tts(card: dict[str, Any], *, user_id: str = ""):
    from audio_convert import ensure_wav_reference
    from edge_tts_engine import EdgeTTS, default_edge_voice

    reference = ensure_wav_reference(card.get("referencePath"))
    engine = (os.getenv("CHERRY_TTS") or "auto").lower()
    eleven_key = eleven_api_key()
    eleven_voice = (card.get("elevenLabsVoiceId") or "").strip()

    # Core product path: ElevenLabs IVC of the user's samples.
    if engine in {"auto", "elevenlabs", "eleven", "clone"} and eleven_key:
        if not eleven_voice and user_id and reference:
            try:
                eleven_voice = await ensure_elevenlabs_voice(card, user_id=user_id)
            except Exception as exc:
                print(f"ElevenLabs on-demand clone failed: {exc}")

        if eleven_voice:
            try:
                from livekit.plugins import elevenlabs

                model = os.getenv("ELEVEN_MODEL", "eleven_turbo_v2_5")
                print(f"Cherry TTS engine: elevenlabs clone ({eleven_voice})")
                return elevenlabs.TTS(
                    voice_id=eleven_voice,
                    model=model,
                    api_key=eleven_key,
                    voice_settings=elevenlabs.VoiceSettings(
                        stability=float(os.getenv("ELEVEN_STABILITY", "0.45")),
                        similarity_boost=float(os.getenv("ELEVEN_SIMILARITY", "0.85")),
                        style=float(os.getenv("ELEVEN_STYLE", "0.35")),
                        use_speaker_boost=True,
                    ),
                )
            except Exception as exc:
                print(f"ElevenLabs TTS unavailable, falling back: {exc}")

    # Optional local Chatterbox if explicitly enabled and cached.
    want_chatterbox = bool(reference) and (
        engine in {"chatterbox"}
        or (engine == "auto" and not eleven_key and _chatterbox_model_cached())
    )
    if want_chatterbox:
        try:
            from chatterbox_tts import ChatterboxTTS

            nano = os.getenv("CHERRY_CHATTERBOX_NANO", "1") != "0"
            print(f"Cherry TTS engine: chatterbox clone ({reference})")
            return ChatterboxTTS(reference_wav=reference, nano=nano)
        except Exception as exc:
            print(f"Voice clone unavailable, falling back: {exc}")

    if engine in {"groq", "orpheus"}:
        try:
            return OrpheusTTS(voice=voice_for_gender(None))
        except Exception as exc:
            print(f"Orpheus unavailable, using Edge TTS: {exc}")

    voice = default_edge_voice()
    print(f"Cherry TTS engine: edge ({voice})")
    return EdgeTTS(voice=voice)


def _chatterbox_model_cached() -> bool:
    hub = Path.home() / ".cache" / "huggingface" / "hub"
    if not hub.exists():
        return False
    return any(hub.glob("models--ResembleAI--chatterbox*"))


def build_llm():
    # Groq retired several llama-* instant IDs; keep a model your key can access.
    model = os.getenv("GROQ_LLM_MODEL", "qwen/qwen3.8-27b")
    max_tokens = int(os.getenv("GROQ_MAX_COMPLETION_TOKENS", "350"))
    return groq.LLM(model=model, temperature=0.7, max_completion_tokens=max_tokens)


def opening_line(card: dict[str, Any]) -> str:
    name = card.get("firstName") or card.get("fullName") or "there"
    first = str(name).split()[0]
    return f"Hey, this is {first}."


def sanitize_spoken_text(text: str) -> str:
    """Never let API/stack errors get spoken out loud."""
    raw = (text or "").strip()
    if not raw:
        return raw
    if re.search(
        r"Error code:\s*\d+|invalid_request_error|APIStatusError|Traceback \(most recent|"
        r"minijinja|failed to template request|raise_exception|"
        r"xmlns[=:]|mstts:|</?(speak|prosody|voice)\b",
        raw,
        re.I,
    ):
        return "One second — let me catch that again."
    # Strip any leaked markup / SSML.
    cleaned = re.sub(r"<[^>]+>", " ", raw)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


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
    tts = await build_tts(card, user_id=user_id)

    # VAD-only turn handling — avoids the broken turn-detector onnx download on Windows.
    session = AgentSession(
        stt=groq.STT(model="whisper-large-v3-turbo", language="en"),
        llm=build_llm(),
        tts=tts,
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
        text = sanitize_spoken_text(item.text_content or "")
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
        intro = sanitize_spoken_text(build_listen_intro(card))
        state.turns.append(
            {
                "speaker": "cherry",
                "text": intro,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )
        await session.say(intro, allow_interruptions=False)
    else:
        # Use say() — Qwen chat templates reject generate_reply(instructions=...) with no user turn
        # and were causing "Error code: 400" text to leak into the call.
        line = opening_line(card)
        state.turns.append(
            {
                "speaker": "cherry",
                "text": line,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )
        await session.say(line, allow_interruptions=True)

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

    line = opening_line(state.card)
    await session.say(line, allow_interruptions=True)
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
