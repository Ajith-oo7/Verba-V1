"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ALL_REQUIRED_SLOTS,
  OPEN_PROMPTS,
  OPEN_TASK,
  PROFESSIONAL_PASSAGE,
  READING_PASSAGE,
  RECRUITER_QUESTIONS,
  RECRUITER_TASK,
  type SlotId,
} from "@/lib/voice-training";

type SlotState = {
  blob: Blob | null;
  url: string | null;
  durationSec: number;
};

type Step = 1 | 2 | 3 | 4;

function emptySlots(): Record<SlotId, SlotState> {
  return ALL_REQUIRED_SLOTS.reduce(
    (acc, id) => {
      acc[id] = { blob: null, url: null, durationSec: 0 };
      return acc;
    },
    {} as Record<SlotId, SlotState>,
  );
}

export default function VoicePage() {
  const [gender, setGender] = useState("female");
  const [consent, setConsent] = useState(false);
  const [slots, setSlots] = useState(emptySlots);
  const [step, setStep] = useState<Step>(1);
  const [activeId, setActiveId] = useState<SlotId | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [playingId, setPlayingId] = useState<SlotId | null>(null);
  const [recruiterIndex, setRecruiterIndex] = useState(0);
  const openPrompt = useMemo(
    () => OPEN_PROMPTS[Math.floor(Math.random() * OPEN_PROMPTS.length)],
    [],
  );

  const recorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const tick = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      stopTicker();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      Object.values(slots).forEach((slot) => {
        if (slot.url) URL.revokeObjectURL(slot.url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTicker() {
    if (tick.current != null) {
      window.clearInterval(tick.current);
      tick.current = null;
    }
  }

  async function startRecording(id: SlotId) {
    if (busy) return;
    if (activeId && activeId !== id) {
      setOk(false);
      setStatus("Stop the current recording before starting another.");
      return;
    }
    if (playingId) stopPlayback();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const media = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      media.onstop = () => {
        const blob = new Blob(chunks.current, { type: media.mimeType || "audio/webm" });
        const durationSec = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
        setSlots((current) => {
          const prev = current[id];
          if (prev.url) URL.revokeObjectURL(prev.url);
          return {
            ...current,
            [id]: { blob, url: URL.createObjectURL(blob), durationSec },
          };
        });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setStatus(`Saved (${formatTime(durationSec)}). Rehear it, or continue.`);
        setOk(null);
      };
      recorder.current = media;
      startedAt.current = Date.now();
      setElapsed(0);
      stopTicker();
      tick.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
      }, 250);
      media.start(250);
      setActiveId(id);
      setOk(null);
      setStatus("Recording… speak naturally, at phone-call volume.");
    } catch {
      setOk(false);
      setStatus("Microphone permission denied. Allow mic access and try again.");
    }
  }

  function stopRecording() {
    stopTicker();
    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.stop();
    }
    setActiveId(null);
    setElapsed(0);
  }

  function clearSlot(id: SlotId) {
    if (activeId === id) return;
    if (playingId === id) stopPlayback();
    setSlots((current) => {
      const prev = current[id];
      if (prev.url) URL.revokeObjectURL(prev.url);
      return { ...current, [id]: { blob: null, url: null, durationSec: 0 } };
    });
  }

  function rehear(id: SlotId) {
    const slot = slots[id];
    if (!slot.url) return;
    if (activeId) {
      setOk(false);
      setStatus("Stop recording before rehearing.");
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    audio.pause();
    audio.src = slot.url;
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      setPlayingId(null);
      setOk(false);
      setStatus("Could not play that recording. Try recording again.");
    };
    void audio.play();
    setPlayingId(id);
    setStatus("Playing your recording…");
    setOk(null);
  }

  function stopPlayback() {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setPlayingId(null);
  }

  async function save() {
    if (busy || activeId) return;
    if (!consent) {
      setOk(false);
      setStatus("Consent is required before Cherry can learn your voice.");
      return;
    }
    const missing = ALL_REQUIRED_SLOTS.filter((id) => !slots[id].blob);
    if (missing.length) {
      setOk(false);
      setStatus(`Finish all 4 tasks first. ${missing.length} recording${missing.length === 1 ? "" : "s"} still missing.`);
      return;
    }

    setBusy(true);
    setOk(null);
    setStatus("Building your professional identity clone — voice, speech, and recruiter style…");
    try {
      const body = new FormData();
      body.set("consent", "true");
      body.set("gender", gender);
      body.set("openPrompt", openPrompt.prompt);
      for (const id of ALL_REQUIRED_SLOTS) {
        const slot = slots[id];
        if (!slot.blob) continue;
        const file = new File([slot.blob], `${id}-${Date.now()}.webm`, {
          type: slot.blob.type || "audio/webm",
        });
        body.append("samples", file);
        body.append("labels", id);
        body.append("durations", String(slot.durationSec));
      }
      const response = await fetch("/api/voice", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setOk(false);
        setStatus(
          response.status === 401
            ? "Session expired. Sign in again."
            : data.error || "Voice training failed.",
        );
        return;
      }
      setProfile((data.identityProfile || data.conversation || null) as Record<string, unknown> | null);
      setOk(true);
      setStatus(
        "Training complete. Cherry learned your voice and how you answer on screens. Open Cherry to Listen.",
      );
    } catch {
      setOk(false);
      setStatus("Voice training failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const completed = ALL_REQUIRED_SLOTS.filter((id) => slots[id].blob).length;
  const total = ALL_REQUIRED_SLOTS.length;
  const recruiterQ = RECRUITER_QUESTIONS[recruiterIndex];
  const recruiterDone = RECRUITER_QUESTIONS.every((q) => slots[q.id].blob);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-5xl">Voice studio</h1>
      <p className="mt-3 text-mute">
        Build a professional identity clone — not just a voice clone. Four tasks, about 11–14 minutes once.
      </p>

      <div className="mt-5 rounded-2xl border border-cherry/30 bg-[#F8EDEA] px-4 py-3 text-sm text-ink">
        <p className="font-medium text-cherry">Record in a quiet place</p>
        <p className="mt-1 text-mute">
          Background noise confuses training. Quiet room, normal phone volume, natural pauses.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {([1, 2, 3, 4] as Step[]).map((n) => (
          <button
            key={n}
            type="button"
            disabled={Boolean(activeId) || busy}
            onClick={() => setStep(n)}
            className={`rounded-full px-4 py-2 text-sm ${
              step === n ? "bg-ink text-paper" : "border border-ink disabled:opacity-40"
            }`}
          >
            Task {n}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-3 text-sm">
        <label className="grid gap-1">
          Voice gender for Cherry
          <select value={gender} onChange={(e) => setGender(e.target.value)} disabled={busy || Boolean(activeId)}>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 w-auto"
            checked={consent}
            disabled={busy}
            onChange={(e) => setConsent(e.target.checked)}
          />
          I own this voice and authorize Verba to use these recordings so Cherry can represent me on recruiter screening calls.
        </label>
      </div>

      {step === 1 ? (
        <TaskCard
          title={READING_PASSAGE.title}
          purpose={READING_PASSAGE.purpose}
          minutes={READING_PASSAGE.minutes}
          guidance={READING_PASSAGE.guidance}
        >
          <p className="mt-4 font-serif text-lg leading-relaxed text-ink">{READING_PASSAGE.text}</p>
          <RecordControls
            id="reading"
            slot={slots.reading}
            activeId={activeId}
            playingId={playingId}
            busy={busy}
            elapsed={elapsed}
            onStart={() => void startRecording("reading")}
            onStop={stopRecording}
            onRehear={() => rehear("reading")}
            onStopPlayback={stopPlayback}
            onClear={() => clearSlot("reading")}
          />
          <StepNav
            canNext={Boolean(slots.reading.blob)}
            onNext={() => setStep(2)}
            disabled={Boolean(activeId) || busy}
          />
        </TaskCard>
      ) : null}

      {step === 2 ? (
        <TaskCard
          title={PROFESSIONAL_PASSAGE.title}
          purpose={PROFESSIONAL_PASSAGE.purpose}
          minutes={PROFESSIONAL_PASSAGE.minutes}
          guidance={PROFESSIONAL_PASSAGE.guidance}
        >
          <p className="mt-4 font-serif text-lg leading-relaxed text-ink">{PROFESSIONAL_PASSAGE.text}</p>
          <RecordControls
            id="professional"
            slot={slots.professional}
            activeId={activeId}
            playingId={playingId}
            busy={busy}
            elapsed={elapsed}
            onStart={() => void startRecording("professional")}
            onStop={stopRecording}
            onRehear={() => rehear("professional")}
            onStopPlayback={stopPlayback}
            onClear={() => clearSlot("professional")}
          />
          <StepNav
            canBack
            canNext={Boolean(slots.professional.blob)}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            disabled={Boolean(activeId) || busy}
          />
        </TaskCard>
      ) : null}

      {step === 3 ? (
        <TaskCard
          title={OPEN_TASK.title}
          purpose={OPEN_TASK.purpose}
          minutes={OPEN_TASK.minutes}
          guidance={OPEN_TASK.guidance}
        >
          <p className="mt-4 rounded-2xl bg-sand/70 px-4 py-3 text-lg leading-relaxed text-ink">
            {openPrompt.prompt}
          </p>
          <p className="mt-3 text-sm text-mute">
            Talk for a few minutes. Content does not matter — fillers, pauses, and rhythm do.
          </p>
          <RecordControls
            id="open"
            slot={slots.open}
            activeId={activeId}
            playingId={playingId}
            busy={busy}
            elapsed={elapsed}
            onStart={() => void startRecording("open")}
            onStop={stopRecording}
            onRehear={() => rehear("open")}
            onStopPlayback={stopPlayback}
            onClear={() => clearSlot("open")}
          />
          <StepNav
            canBack
            canNext={Boolean(slots.open.blob)}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
            disabled={Boolean(activeId) || busy}
          />
        </TaskCard>
      ) : null}

      {step === 4 ? (
        <TaskCard
          title={RECRUITER_TASK.title}
          purpose={RECRUITER_TASK.purpose}
          minutes={RECRUITER_TASK.minutes}
          guidance={RECRUITER_TASK.guidance}
        >
          <div className="mt-4 flex flex-wrap gap-2">
            {RECRUITER_QUESTIONS.map((q, index) => (
              <button
                key={q.id}
                type="button"
                disabled={Boolean(activeId) || busy}
                onClick={() => setRecruiterIndex(index)}
                className={`rounded-full px-3 py-1.5 text-xs ${
                  recruiterIndex === index
                    ? "bg-ink text-paper"
                    : slots[q.id].blob
                      ? "border border-moss text-moss"
                      : "border border-line text-mute"
                }`}
              >
                Q{index + 1}
                {slots[q.id].blob ? " ✓" : ""}
              </button>
            ))}
          </div>

          <p className="mt-5 text-xs uppercase tracking-wide text-mute">
            Question {recruiterIndex + 1} of {RECRUITER_QUESTIONS.length}
          </p>
          <p className="mt-2 font-serif text-2xl text-ink">{recruiterQ.question}</p>
          <p className="mt-2 text-sm text-mute">Answer out loud like a real screen. Then stop and move to the next.</p>

          <RecordControls
            id={recruiterQ.id}
            slot={slots[recruiterQ.id]}
            activeId={activeId}
            playingId={playingId}
            busy={busy}
            elapsed={elapsed}
            onStart={() => void startRecording(recruiterQ.id)}
            onStop={stopRecording}
            onRehear={() => rehear(recruiterQ.id)}
            onStopPlayback={stopPlayback}
            onClear={() => clearSlot(recruiterQ.id)}
          />

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={Boolean(activeId) || busy || recruiterIndex === 0}
              onClick={() => setRecruiterIndex((i) => Math.max(0, i - 1))}
              className="rounded-full border border-ink px-4 py-2 text-sm disabled:opacity-40"
            >
              Previous question
            </button>
            {recruiterIndex < RECRUITER_QUESTIONS.length - 1 ? (
              <button
                type="button"
                disabled={Boolean(activeId) || busy || !slots[recruiterQ.id].blob}
                onClick={() => setRecruiterIndex((i) => Math.min(RECRUITER_QUESTIONS.length - 1, i + 1))}
                className="rounded-full bg-ink px-4 py-2 text-sm text-paper disabled:opacity-40"
              >
                Next question
              </button>
            ) : null}
            <button
              type="button"
              disabled={Boolean(activeId) || busy}
              onClick={() => setStep(3)}
              className="rounded-full px-4 py-2 text-sm text-mute hover:text-ink"
            >
              Back to Task 3
            </button>
          </div>

          {!recruiterDone ? (
            <p className="mt-4 text-sm text-mute">
              Answer all {RECRUITER_QUESTIONS.length} questions to unlock training.
            </p>
          ) : null}
        </TaskCard>
      ) : null}

      <div className="mt-8 rounded-2xl bg-white p-5 shadow-card">
        <p className="text-sm text-mute">
          {completed} of {total} recordings · ~11–14 minutes total
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand">
          <div
            className="h-full rounded-full bg-moss transition-all duration-300"
            style={{ width: `${(completed / total) * 100}%` }}
          />
        </div>
        <button
          type="button"
          disabled={busy || Boolean(activeId) || completed < total || !consent}
          onClick={() => void save()}
          className="mt-5 w-full rounded-full bg-cherry py-3 text-white disabled:opacity-50"
        >
          {busy ? "Training Cherry…" : "Train professional identity clone"}
        </button>
        {status ? (
          <p className={`mt-3 text-sm ${ok === false ? "text-cherry" : ok ? "text-moss" : "text-mute"}`}>{status}</p>
        ) : null}
        {ok ? (
          <a
            href="/app/edit?tab=listen"
            className="mt-4 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm text-paper"
          >
            Open Cherry
          </a>
        ) : null}
      </div>

      {profile ? <IdentitySummary profile={profile} /> : null}
    </div>
  );
}

function TaskCard({
  title,
  purpose,
  minutes,
  guidance,
  children,
}: {
  title: string;
  purpose: string;
  minutes: string;
  guidance: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 rounded-3xl border border-line bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl">{title}</h2>
        <span className="text-xs uppercase tracking-wide text-mute">{minutes}</span>
      </div>
      <p className="mt-2 text-sm text-mute">{purpose}</p>
      <p className="mt-4 rounded-xl bg-sand/70 px-3 py-2 text-sm text-mute">{guidance}</p>
      {children}
    </section>
  );
}

function RecordControls({
  id,
  slot,
  activeId,
  playingId,
  busy,
  elapsed,
  onStart,
  onStop,
  onRehear,
  onStopPlayback,
  onClear,
}: {
  id: SlotId;
  slot: SlotState;
  activeId: SlotId | null;
  playingId: SlotId | null;
  busy: boolean;
  elapsed: number;
  onStart: () => void;
  onStop: () => void;
  onRehear: () => void;
  onStopPlayback: () => void;
  onClear: () => void;
}) {
  const isRecording = activeId === id;
  const isPlaying = playingId === id;
  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!isRecording ? (
          <button
            type="button"
            disabled={busy || (activeId !== null && activeId !== id)}
            onClick={onStart}
            className="rounded-full bg-ink px-5 py-2.5 text-paper disabled:opacity-50"
          >
            {slot.blob ? "Re-record" : "Start recording"}
          </button>
        ) : (
          <button type="button" onClick={onStop} className="rounded-full bg-cherry px-5 py-2.5 text-white">
            Stop recording · {formatTime(elapsed)}
          </button>
        )}
        <button
          type="button"
          disabled={!slot.url || busy || Boolean(activeId)}
          onClick={() => (isPlaying ? onStopPlayback() : onRehear())}
          className="rounded-full border border-ink px-5 py-2.5 disabled:opacity-40"
        >
          {isPlaying ? "Stop rehear" : "Rehear"}
        </button>
        {slot.blob ? (
          <button
            type="button"
            disabled={busy || Boolean(activeId)}
            onClick={onClear}
            className="rounded-full px-4 py-2.5 text-sm text-mute hover:text-ink disabled:opacity-40"
          >
            Clear
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-mute">
        {isRecording
          ? "Recording in progress…"
          : slot.blob
            ? `Saved · ${formatTime(slot.durationSec)}`
            : "Not recorded yet"}
      </p>
    </>
  );
}

function StepNav({
  canBack,
  canNext,
  onBack,
  onNext,
  disabled,
}: {
  canBack?: boolean;
  canNext?: boolean;
  onBack?: () => void;
  onNext?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      {canBack && onBack ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onBack}
          className="rounded-full border border-ink px-4 py-2 text-sm disabled:opacity-40"
        >
          Back
        </button>
      ) : null}
      {onNext ? (
        <button
          type="button"
          disabled={disabled || !canNext}
          onClick={onNext}
          className="rounded-full bg-ink px-4 py-2 text-sm text-paper disabled:opacity-40"
        >
          Continue
        </button>
      ) : null}
    </div>
  );
}

function IdentitySummary({ profile }: { profile: Record<string, unknown> }) {
  const conversation =
    (profile.conversation_profile as Record<string, unknown> | undefined) || profile;
  const recruiter = profile.recruiter_answer_profile as Record<string, unknown> | undefined;
  const speech = profile.speech_profile as Record<string, unknown> | undefined;

  return (
    <div className="mt-6 min-w-0 rounded-2xl bg-white p-5 shadow-card">
      <h2 className="font-serif text-2xl">Identity profiles learned</h2>
      <dl className="mt-3 grid gap-2 text-sm text-mute">
        {conversation.formality ? (
          <div>
            Tone: <span className="capitalize text-ink">{String(conversation.formality)}</span>
          </div>
        ) : null}
        {conversation.answerLength || recruiter?.typical_answer_length ? (
          <div>
            Answer length:{" "}
            <span className="capitalize text-ink">
              {String(recruiter?.typical_answer_length || conversation.answerLength)}
            </span>
          </div>
        ) : null}
        {speech?.pace ? (
          <div>
            Pace: <span className="capitalize text-ink">{String(speech.pace)}</span>
          </div>
        ) : null}
        {recruiter?.confidence ? (
          <div>
            Screen confidence:{" "}
            <span className="capitalize text-ink">{String(recruiter.confidence)}</span>
          </div>
        ) : null}
      </dl>
      {typeof conversation.notes === "string" && conversation.notes ? (
        <p className="mt-3 text-sm leading-relaxed text-ink">{conversation.notes}</p>
      ) : null}
      {Array.isArray(conversation.typicalPhrases) && conversation.typicalPhrases.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {conversation.typicalPhrases.map((phrase) => (
            <span key={String(phrase)} className="rounded-full bg-sand px-3 py-1 text-sm text-ink">
              {String(phrase)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatTime(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
