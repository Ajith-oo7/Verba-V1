from __future__ import annotations

import asyncio
import io
import os
from typing import Any

import av
import numpy as np
from livekit.agents import APIConnectionError, tts, utils
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, APIConnectOptions

SAMPLE_RATE = 24000


def edge_voice_for_gender(gender: str | None) -> str:
    g = (gender or "").lower()
    if g == "male":
        return os.getenv("CHERRY_EDGE_MALE_VOICE", "en-US-GuyNeural")
    return os.getenv("CHERRY_EDGE_FEMALE_VOICE", "en-US-JennyNeural")


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
    # flush
    for resampled in resampler.resample(None):
        arr = resampled.to_ndarray()
        if arr.ndim > 1:
            arr = arr[0]
        frames.append(np.asarray(arr, dtype=np.int16).tobytes())
    return b"".join(frames), target_rate, 1


class EdgeTTS(tts.TTS):
    """Free Microsoft Edge neural voices — used when Groq Orpheus terms are blocked."""

    def __init__(self, *, voice: str = "en-US-JennyNeural") -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=SAMPLE_RATE,
            num_channels=1,
        )
        self._voice = voice

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> tts.ChunkedStream:
        return EdgeStream(tts=self, input_text=text, conn_options=conn_options)


class EdgeStream(tts.ChunkedStream):
    def __init__(self, *, tts: EdgeTTS, input_text: str, conn_options: APIConnectOptions) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._tts = tts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        text = (self._input_text or "").strip()
        if not text:
            return
        try:
            import edge_tts

            communicate = edge_tts.Communicate(text, self._tts._voice)
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
