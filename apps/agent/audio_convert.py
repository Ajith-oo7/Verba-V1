from __future__ import annotations

from pathlib import Path


def ensure_wav_reference(path: str | None) -> str | None:
    """Convert webm/ogg/mp3 reference audio to mono 24k wav for voice cloning."""
    if not path:
        return None
    src = Path(path)
    if not src.exists():
        return None
    if src.suffix.lower() == ".wav":
        return str(src)

    out = src.with_suffix(".wav")
    if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
        return str(out)

    try:
        import av
        import numpy as np
        import soundfile as sf

        container = av.open(str(src))
        stream = next((s for s in container.streams if s.type == "audio"), None)
        if stream is None:
            return str(src)

        resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=24000)
        chunks: list[np.ndarray] = []
        for packet in container.demux(stream):
            for frame in packet.decode():
                for resampled in resampler.resample(frame):
                    arr = resampled.to_ndarray()
                    if arr.ndim > 1:
                        arr = arr[0]
                    chunks.append(np.asarray(arr, dtype=np.int16))
        for resampled in resampler.resample(None):
            arr = resampled.to_ndarray()
            if arr.ndim > 1:
                arr = arr[0]
            chunks.append(np.asarray(arr, dtype=np.int16))

        if not chunks:
            return str(src)

        pcm = np.concatenate(chunks)
        sf.write(str(out), pcm, 24000, subtype="PCM_16")
        return str(out)
    except Exception as exc:
        print(f"Reference wav conversion failed for {src}: {exc}")
        return str(src)
