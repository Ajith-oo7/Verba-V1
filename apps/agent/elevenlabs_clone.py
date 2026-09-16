from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

import httpx


def eleven_api_key() -> str:
    return (
        os.getenv("ELEVEN_LABS_KEY")
        or os.getenv("ELEVENLABS_API_KEY")
        or os.getenv("ELEVEN_API_KEY")
        or ""
    ).strip()


def create_instant_clone(*, name: str, file_paths: list[str], description: str = "") -> str:
    key = eleven_api_key()
    if not key:
        raise RuntimeError("ELEVEN_LABS_KEY is missing")

    files: list[tuple[str, tuple[str, bytes, str]]] = []
    for path in file_paths:
        p = Path(path)
        if not p.exists():
            continue
        mime = "audio/wav" if p.suffix.lower() == ".wav" else "audio/webm"
        files.append(("files", (p.name, p.read_bytes(), mime)))

    if not files:
        raise RuntimeError("No audio files available for ElevenLabs clone")

    data = {
        "name": (name or "Verba clone")[:100],
        "description": description or "Verba Cherry voice clone",
        "remove_background_noise": "false",
    }
    with httpx.Client(timeout=120) as client:
        response = client.post(
            "https://api.elevenlabs.io/v1/voices/add",
            headers={"xi-api-key": key, "Accept": "application/json"},
            data=data,
            files=files,
        )
    payload = response.json() if response.content else {}
    if response.status_code >= 400 or not payload.get("voice_id"):
        raise RuntimeError(f"ElevenLabs clone failed ({response.status_code}): {payload}")
    return str(payload["voice_id"])


async def ensure_elevenlabs_voice(card: dict[str, Any], *, user_id: str) -> str:
    """Return a usable ElevenLabs voice id, creating one from reference audio if needed."""
    existing = (card.get("elevenLabsVoiceId") or "").strip()
    if existing:
        return existing

    key = eleven_api_key()
    if not key:
        return ""

    # Free / starter keys often lack Instant Voice Cloning — fail fast, don't stall the call.
    if os.getenv("ELEVEN_SKIP_CLONE", "").strip().lower() in {"1", "true", "yes"}:
        return ""

    from audio_convert import ensure_wav_reference

    reference = ensure_wav_reference(card.get("referencePath"))
    if not reference:
        return ""

    name = f"Verba {(card.get('fullName') or card.get('firstName') or user_id)}"
    try:
        voice_id = await asyncio.to_thread(
            create_instant_clone,
            name=name[:80],
            file_paths=[reference],
            description="Auto-created Cherry clone for live screening calls",
        )
    except Exception as exc:
        message = str(exc)
        if "paid_plan_required" in message or "instant_voice_cloning" in message:
            print(
                "ElevenLabs Instant Voice Cloning requires a paid plan; "
                "using Edge TTS until IVC is available."
            )
            os.environ["ELEVEN_SKIP_CLONE"] = "1"
        raise

    # Persist so later calls skip re-cloning.
    base = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000").rstrip("/")
    secret = os.getenv("INTERNAL_API_SECRET", "")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            await client.post(
                f"{base}/api/internal/voice",
                headers={"x-verba-internal": secret},
                json={"userId": user_id, "elevenLabsVoiceId": voice_id},
            )
    except Exception as exc:
        print(f"Could not persist ElevenLabs voice id: {exc}")

    card["elevenLabsVoiceId"] = voice_id
    return voice_id
