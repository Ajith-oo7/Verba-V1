"use client";

import { useEffect, useRef, useState } from "react";

type SlotId = "about" | "screen" | "style";

type SlotState = {
  blob: Blob | null;
  url: string | null;
  durationSec: number;
};

const SCRIPTS: Array<{
  id: SlotId;
  title: string;
  minutes: string;
  text: string;
}> = [
  {
    id: "about",
    title: "Passage 1 — About you",
    minutes: "~1 minute",
    text: `Okay, so… hi. This is me talking the way I normally would on a phone screen. I've been working in my field for a while now, and lately I've been thinking about what kind of team I want to grow with next. I'm not looking for a dramatic career reboot or anything — I just want work that feels a little bigger, a little more intentional. Day to day I like solving real problems with people who communicate clearly. I get energy from shipping things, not from endless process. When someone asks me to walk through my background, I usually keep it short: where I am now, what I've been focused on recently, and the kind of problems I enjoy. I don't need to recite every job from ten years ago. If a recruiter wants more detail, they'll ask, and I'm happy to go deeper then. Honestly, I sound better when I'm just talking, not performing. So yeah — this is my normal pace, my normal tone, the little pauses I take when I'm thinking. That's the version of me Cherry should learn.`,
  },
  {
    id: "screen",
    title: "Passage 2 — Screening answers",
    minutes: "~1 minute",
    text: `Alright, pretend this is a recruiter call. Where am I based? I'll just say my city normally, no speech about lifestyle. Work authorization — I'll state it plainly, no over-explaining. If they ask about sponsorship, yes or no, clean and calm. Salary? I give a range and leave room for the whole package, because that's how I actually talk about it. I'm not going to invent a number on the spot or sound desperate. Start date depends on notice, and I'll say that without padding it with filler. Hybrid or remote — I'll answer based on what I actually want, not what I think they want to hear. If they ask why I'm looking, I'll keep it honest and short: better problems, better team, room to grow. And if something isn't in my profile, I won't guess. I'd rather say I don't have that detail and follow up later. That's how I talk on real screens — casual, clear, no brochure language.`,
  },
  {
    id: "style",
    title: "Passage 3 — Your natural rhythm",
    minutes: "~1 minute",
    text: `One more for rhythm. Sometimes I trail off a little when I'm thinking. Sometimes I say “yeah,” “sure,” “that's fair.” I don't stack those on purpose — they just show up when I'm comfortable. I don't talk like a TED talk. I don't talk like an essay either. On the phone I keep answers tight, then stop and wait. If the other person jumps in, I let them. If they ask a technical or deep behavioral question, I'd rather schedule the real interview than fake my way through it on a screen. Quiet room helps. Natural volume helps. I'm not whispering, and I'm not projecting to a stage. Just me, mid-conversation, the way friends or recruiters actually hear me. Cherry should catch that: the pitch, the pace, the little vibrations when I emphasize a word, the way I breathe between thoughts. Read this like you're explaining something to a person you respect — not like you're competing in an English reading contest.`,
  },
];

const emptySlots = (): Record<SlotId, SlotState> => ({
  about: { blob: null, url: null, durationSec: 0 },
  screen: { blob: null, url: null, durationSec: 0 },
  style: { blob: null, url: null, durationSec: 0 },
});

export default function VoicePage() {
  const [gender, setGender] = useState("female");
  const [consent, setConsent] = useState(false);
  const [slots, setSlots] = useState(emptySlots);
  const [activeId, setActiveId] = useState<SlotId | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [playingId, setPlayingId] = useState<SlotId | null>(null);

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
      setStatus("Stop the current recording before starting another passage.");
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
            [id]: {
              blob,
              url: URL.createObjectURL(blob),
              durationSec,
            },
          };
        });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setStatus(`Passage saved (${formatTime(durationSec)}). Rehear it, or record the next one.`);
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
      setStatus("Recording… talk casually. Aim for about a minute.");
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
    const ready = SCRIPTS.filter((script) => slots[script.id].blob);
    if (ready.length < 3) {
      setOk(false);
      setStatus(`Record all 3 passages first. You have ${ready.length} of 3.`);
      return;
    }

    setBusy(true);
    setOk(null);
    setStatus("Training Cherry on your tone, pace, and speaking style…");
    try {
      const body = new FormData();
      body.set("consent", "true");
      body.set("gender", gender);
      for (const script of SCRIPTS) {
        const slot = slots[script.id];
        if (!slot.blob) continue;
        const file = new File([slot.blob], `${script.id}-${Date.now()}.webm`, {
          type: slot.blob.type || "audio/webm",
        });
        body.append("samples", file);
        body.append("labels", script.id);
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
      setProfile(data.conversation || null);
      setOk(true);
      setStatus(
        "Training complete. Cherry learned your voice from all 3 passages. Open Cherry to Listen to your intro.",
      );
    } catch {
      setOk(false);
      setStatus("Voice training failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const completed = SCRIPTS.filter((script) => slots[script.id].blob).length;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-5xl">Voice studio</h1>
      <p className="mt-3 text-mute">
        Record three casual passages so Cherry can learn your tone, pace, and natural rhythm — not a polished reading voice.
      </p>

      <div className="mt-5 rounded-2xl border border-cherry/30 bg-[#F8EDEA] px-4 py-3 text-sm text-ink">
        <p className="font-medium text-cherry">Record in a quiet place</p>
        <p className="mt-1 text-mute">
          Background noise (TV, fans, traffic, other people talking) can confuse Cherry&apos;s voice training. Use a quiet
          room, close windows if needed, and speak at a normal phone volume.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-white p-4 text-sm text-mute">
        <p className="font-medium text-ink">How to record</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Find a quiet place first — loud background noise can disrupt Cherry&apos;s training.</li>
          <li>Read each passage in a casual phone-call voice.</li>
          <li>Do not perform. Do not rush. Do not sound like an English paragraph contest.</li>
          <li>Normal volume and natural pauses are perfect.</li>
          <li>Each passage should take about one minute when you speak normally.</li>
        </ul>
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

      <div className="mt-8 grid gap-6">
        {SCRIPTS.map((script, index) => {
          const slot = slots[script.id];
          const isRecording = activeId === script.id;
          const isPlaying = playingId === script.id;
          return (
            <section key={script.id} className="rounded-3xl border border-line bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-serif text-2xl">{script.title}</h2>
                <span className="text-xs uppercase tracking-wide text-mute">
                  {script.minutes} · Passage {index + 1}/3
                </span>
              </div>
              <p className="mt-4 font-serif text-lg leading-relaxed text-ink">{script.text}</p>
              <p className="mt-4 rounded-xl bg-sand/70 px-3 py-2 text-sm text-mute">
                Note: Read this casually, like you&apos;re on a real recruiter call with someone you respect. Natural
                flow, natural vibrations, your normal pauses. Do not polish it into a contest reading.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {!isRecording ? (
                  <button
                    type="button"
                    disabled={busy || (activeId !== null && activeId !== script.id)}
                    onClick={() => void startRecording(script.id)}
                    className="rounded-full bg-ink px-5 py-2.5 text-paper disabled:opacity-50"
                  >
                    {slot.blob ? "Re-record" : "Start recording"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="rounded-full bg-cherry px-5 py-2.5 text-white"
                  >
                    Stop recording · {formatTime(elapsed)}
                  </button>
                )}

                <button
                  type="button"
                  disabled={!slot.url || busy || Boolean(activeId)}
                  onClick={() => (isPlaying ? stopPlayback() : rehear(script.id))}
                  className="rounded-full border border-ink px-5 py-2.5 disabled:opacity-40"
                >
                  {isPlaying ? "Stop rehear" : "Rehear"}
                </button>

                {slot.blob ? (
                  <button
                    type="button"
                    disabled={busy || Boolean(activeId)}
                    onClick={() => clearSlot(script.id)}
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
                    ? `Saved · ${formatTime(slot.durationSec)} · ready for training`
                    : "Not recorded yet"}
              </p>
            </section>
          );
        })}
      </div>

      <div className="mt-8 rounded-2xl bg-white p-5 shadow-card">
        <p className="text-sm text-mute">
          {completed} of 3 passages recorded
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand">
          <div
            className="h-full rounded-full bg-moss transition-all duration-300"
            style={{ width: `${(completed / 3) * 100}%` }}
          />
        </div>
        <button
          type="button"
          disabled={busy || Boolean(activeId) || completed < 3 || !consent}
          onClick={() => void save()}
          className="mt-5 w-full rounded-full bg-cherry py-3 text-white disabled:opacity-50"
        >
          {busy ? "Training Cherry…" : "Train Cherry on my voice"}
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

      {profile ? (
        <div className="mt-6 min-w-0 rounded-2xl bg-white p-5 shadow-card">
          <h2 className="font-serif text-2xl">Speaking style learned</h2>
          <dl className="mt-3 grid gap-2 text-sm text-mute">
            {profile.formality ? (
              <div>
                Tone: <span className="capitalize text-ink">{String(profile.formality)}</span>
              </div>
            ) : null}
            {profile.answerLength ? (
              <div>
                Answer length:{" "}
                <span className="capitalize text-ink">{String(profile.answerLength)}</span>
              </div>
            ) : null}
          </dl>
          {typeof profile.notes === "string" && profile.notes ? (
            <p className="mt-3 text-sm leading-relaxed text-ink">{profile.notes}</p>
          ) : null}
          {Array.isArray(profile.typicalPhrases) && profile.typicalPhrases.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.typicalPhrases.map((phrase) => (
                <span key={String(phrase)} className="rounded-full bg-sand px-3 py-1 text-sm text-ink">
                  {String(phrase)}
                </span>
              ))}
            </div>
          ) : null}
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
