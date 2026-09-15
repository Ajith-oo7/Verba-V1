from __future__ import annotations

import io
import os
import re
import wave
from typing import Any

import httpx
from livekit.agents import APIConnectionError, APIStatusError, tts, utils
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, APIConnectOptions

ORPHEUS_MODEL = "canopylabs/orpheus-v1-english"
MAX_CHARS = 180
SAMPLE_RATE = 24000

FEMALE_VOICES = ("hannah", "autumn", "diana")
MALE_VOICES = ("troy", "austin", "daniel")


def voice_for_gender(gender: str | None) -> str:
    g = (gender or "").lower()
    if g == "male":
        return os.getenv("CHERRY_MALE_VOICE", "troy")
    return os.getenv("CHERRY_FEMALE_VOICE", "hannah")


def split_spoken_text(text: str) -> list[str]:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return []
    parts = re.split(r"(?<=[.!?])\s+", cleaned)
    chunks: list[str] = []
    buf = ""
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if len(part) > MAX_CHARS:
            if buf:
                chunks.append(buf.strip())
                buf = ""
            words = part.split(" ")
            acc = ""
            for word in words:
                trial = f"{acc} {word}".strip()
                if len(trial) > MAX_CHARS and acc:
                    chunks.append(acc)
                    acc = word
                else:
                    acc = trial
            if acc:
                chunks.append(acc)
            continue
        trial = f"{buf} {part}".strip()
        if len(trial) > MAX_CHARS and buf:
            chunks.append(buf.strip())
            buf = part
        else:
            buf = trial
    if buf:
        chunks.append(buf.strip())
    return chunks


def _pcm_from_wav(data: bytes) -> tuple[bytes, int, int]:
    with wave.open(io.BytesIO(data), "rb") as wav:
        return wav.readframes(wav.getnframes()), wav.getframerate(), wav.getnchannels()


class OrpheusTTS(tts.TTS):
    def __init__(self, *, voice: str = "hannah", api_key: str | None = None) -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=SAMPLE_RATE,
            num_channels=1,
        )
        self._voice = voice
        self._api_key = api_key or os.environ["GROQ_API_KEY"]

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> tts.ChunkedStream:
        return OrpheusStream(tts=self, input_text=text, conn_options=conn_options)


class OrpheusStream(tts.ChunkedStream):
    def __init__(self, *, tts: OrpheusTTS, input_text: str, conn_options: APIConnectOptions) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._tts = tts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        chunks = split_spoken_text(self._input_text)
        initialized = False
        async with httpx.AsyncClient(timeout=self._conn_options.timeout) as client:
            for chunk in chunks:
                try:
                    response = await client.post(
                        "https://api.groq.com/openai/v1/audio/speech",
                        headers={
                            "Authorization": f"Bearer {self._tts._api_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": ORPHEUS_MODEL,
                            "voice": self._tts._voice,
                            "input": chunk,
                            "response_format": "wav",
                        },
                    )
                except httpx.TimeoutException as exc:
                    raise APIConnectionError("Orpheus TTS timed out") from exc
                if response.status_code >= 400:
                    raise APIStatusError(
                        f"Orpheus TTS failed: {response.text[:300]}",
                        status_code=response.status_code,
                    )
                pcm, rate, channels = _pcm_from_wav(response.content)
                if not initialized:
                    output_emitter.initialize(
                        request_id=utils.shortuuid(),
                        sample_rate=rate,
                        num_channels=channels,
                        mime_type="audio/pcm",
                    )
                    initialized = True
                output_emitter.push(pcm)
        if initialized:
            output_emitter.flush()
