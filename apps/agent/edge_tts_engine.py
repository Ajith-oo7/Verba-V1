from __future__ import annotations

import asyncio
import io
import os
import re
from typing import Any

import av
import numpy as np
from livekit.agents import APIConnectionError, tts, utils
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, APIConnectOptions

# Pre-import so the first spoken line doesn't stall the event loop.
import edge_tts  # noqa: F401

SAMPLE_RATE = 24000


def edge_voice_for_gender(gender: str | None) -> str:
    """Legacy helper — gender no longer drives product TTS."""
    return default_edge_voice()


def default_edge_voice() -> str:
    return os.getenv("CHERRY_EDGE_VOICE") or os.getenv("CHERRY_EDGE_FEMALE_VOICE", "en-US-JennyNeural")


def edge_style_for_gender(gender: str | None) -> str:
    return (os.getenv("CHERRY_EDGE_STYLE") or "friendly").strip() or "friendly"


def sanitize_tts_text(text: str) -> str:
    raw = (text or "").strip()
    if not raw:
        return raw
    # Never speak stack traces, API errors, or leaked SSML/XML markup.
    if re.search(
        r"Error code:\s*\d+|invalid_request_error|APIStatusError|Traceback \(most recent|"
        r"minijinja|failed to template request|raise_exception|"
        r"xmlns[=:]|mstts:|</?(speak|prosody|voice)\b",
        raw,
        re.I,
    ):
        return "One second — let me catch that again."
    cleaned = re.sub(r"<[^>]+>", " ", raw)
    return re.sub(r"\s+", " ", cleaned).strip()


def _mp3_to_pcm(data: bytes, target_rate: int = SAMPLE_RATE) -> tuple[bytes, int, int]:
    container = av.open(io.BytesIO(data), format="mp3")
    resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=target_rate)
    frames: list[bytes] = []
    for packet in container.demux():
        for frame in packet.decode():
            for resampled in resampler.resample(frame):
                arr = resampled.to_ndarray()
                if arr.ndim > 1:
                    arr = arr[0]
                frames.append(np.asarray(arr, dtype=np.int16).tobytes())
    for resampled in resampler.resample(None):
        arr = resampled.to_ndarray()
        if arr.ndim > 1:
            arr = arr[0]
        frames.append(np.asarray(arr, dtype=np.int16).tobytes())
    return b"".join(frames), target_rate, 1


class EdgeTTS(tts.TTS):
    """Microsoft Edge neural voices via edge-tts (plain text + prosody params)."""

    def __init__(self, *, voice: str | None = None, gender: str | None = None) -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=SAMPLE_RATE,
            num_channels=1,
        )
        self._voice = voice or default_edge_voice()
        self._style = edge_style_for_gender(gender)
        self._rate = os.getenv("CHERRY_EDGE_RATE", "-3%")
        self._pitch = os.getenv("CHERRY_EDGE_PITCH", "+2Hz")

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> tts.ChunkedStream:
        return EdgeStream(tts=self, input_text=sanitize_tts_text(text), conn_options=conn_options)


class EdgeStream(tts.ChunkedStream):
    def __init__(self, *, tts: EdgeTTS, input_text: str, conn_options: APIConnectOptions) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._tts = tts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        text = (self._input_text or "").strip()
        if not text:
            return
        try:
            # edge-tts wraps text in its own SSML — never pass raw <speak> markup or it gets read aloud.
            communicate = edge_tts.Communicate(
                text,
                self._tts._voice,
                rate=self._tts._rate,
                pitch=self._tts._pitch,
            )
            mp3 = bytearray()

            async def _collect() -> None:
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        mp3.extend(chunk["data"])

            await asyncio.wait_for(_collect(), timeout=self._conn_options.timeout)
        except Exception as exc:
            raise APIConnectionError(f"Edge TTS failed: {exc}") from exc

        if not mp3:
            raise APIConnectionError("Edge TTS returned empty audio")

        pcm, rate, channels = await asyncio.to_thread(_mp3_to_pcm, bytes(mp3), SAMPLE_RATE)
        output_emitter.initialize(
            request_id=utils.shortuuid(),
            sample_rate=rate,
            num_channels=channels,
            mime_type="audio/pcm",
        )
        output_emitter.push(pcm)
        output_emitter.flush()
