from __future__ import annotations

import asyncio
import os
import threading
import time
from typing import Any

from livekit.agents import tts, utils
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, APIConnectOptions

SAMPLE_RATE = 24000
_LOAD_LOCK = threading.Lock()
_MODEL: Any = None
_MODEL_ERROR: str | None = None


def _load_timeout_sec() -> float:
    return float(os.getenv("CHERRY_CLONE_LOAD_TIMEOUT", "8"))


def _synth_timeout_sec() -> float:
    return float(os.getenv("CHERRY_CLONE_SYNTH_TIMEOUT", "20"))


class ChatterboxTTS(tts.TTS):
    """Local voice clone from the user's reference recording."""

    def __init__(self, *, reference_wav: str, gender: str | None = None, nano: bool = True) -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=SAMPLE_RATE,
            num_channels=1,
        )
        self._reference_wav = reference_wav
        self._nano = nano
        self._failed = False

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> tts.ChunkedStream:
        from edge_tts_engine import sanitize_tts_text

        return ChatterboxStream(
            tts=self,
            input_text=sanitize_tts_text(text),
            conn_options=conn_options,
        )


class ChatterboxStream(tts.ChunkedStream):
    def __init__(self, *, tts: ChatterboxTTS, input_text: str, conn_options: APIConnectOptions) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._tts = tts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        text = (self._input_text or "").strip()
        if not text:
            return

        if self._tts._failed or _MODEL_ERROR:
            await self._edge_fallback(output_emitter, text)
            return

        try:
            pcm, rate = await asyncio.wait_for(
                asyncio.to_thread(self._clone_sync, text),
                timeout=_load_timeout_sec() + _synth_timeout_sec(),
            )
            output_emitter.initialize(
                request_id=utils.shortuuid(),
                sample_rate=rate,
                num_channels=1,
                mime_type="audio/pcm",
            )
            output_emitter.push(pcm)
            output_emitter.flush()
            return
        except Exception as exc:
            print(f"Chatterbox timed out/failed, using Edge TTS: {exc}")
            self._tts._failed = True
            await self._edge_fallback(output_emitter, text)

    def _clone_sync(self, text: str) -> tuple[bytes, int]:
        global _MODEL, _MODEL_ERROR
        with _LOAD_LOCK:
            if _MODEL is None and _MODEL_ERROR is None:
                started = time.time()
                try:
                    import torch
                    from chatterbox.tts import ChatterboxTTS as CBModel

                    device = "cuda" if torch.cuda.is_available() else "cpu"
                    print(f"Loading Chatterbox voice clone on {device}…")
                    _MODEL = CBModel.from_pretrained(device)
                    print(f"Chatterbox ready in {time.time() - started:.1f}s")
                except Exception as exc:
                    _MODEL_ERROR = str(exc)
                    raise

            if _MODEL_ERROR:
                raise RuntimeError(_MODEL_ERROR)
            model = _MODEL

        wav = model.generate(
            text,
            audio_prompt_path=self._tts._reference_wav,
            exaggeration=float(os.getenv("CHERRY_CLONE_EXAGGERATION", "0.55")),
            cfg_weight=float(os.getenv("CHERRY_CLONE_CFG", "0.5")),
            temperature=float(os.getenv("CHERRY_CLONE_TEMP", "0.75")),
        )
        tensor = wav.detach().cpu()
        if tensor.ndim > 1:
            tensor = tensor.squeeze(0)
        pcm = (tensor.clamp(-1, 1).numpy() * 32767).astype("int16").tobytes()
        sr = int(getattr(model, "sr", SAMPLE_RATE))
        return pcm, sr

    async def _edge_fallback(self, output_emitter: tts.AudioEmitter, text: str) -> None:
        from edge_tts_engine import EdgeTTS

        edge = EdgeTTS()
        stream = edge.synthesize(text, conn_options=self._conn_options)
        await stream._run(output_emitter)
