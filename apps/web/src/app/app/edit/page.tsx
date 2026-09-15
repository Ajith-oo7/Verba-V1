"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarVisualizer,
  LiveKitRoom,
  MediaDeviceMenu,
  RoomAudioRenderer,
  TrackToggle,
  useLocalParticipant,
  useMediaDeviceSelect,
  useRoomContext,
  useTranscriptions,
  useVoiceAssistant,
} from "@livekit/components-react";
import type { AgentState } from "@livekit/components-react";
import { RoomEvent, Track, type TranscriptionSegment } from "livekit-client";
import "@livekit/components-styles";

type Sample = {
  id: string;
  label: string;
  duration: number;
  transcript: string;
  createdAt: string;
  playUrl: string;
};

type ConversationStyle = {
  formality?: string;
  answerLength?: string;
  typicalPhrases?: string[];
  notes?: string;
};

type VoiceInfo = {
  voiceProfile: {
    gender: string;
    cloneReady: boolean;
    ttsVoice: string;
    consentAt: string | null;
    conversation: ConversationStyle;
    hasReference: boolean;
  } | null;
  samples: Sample[];
};

type Tab = "listen" | "recordings" | "talk" | "retrain";

type LiveTurn = {
  id: string;
  role: "you" | "cherry";
  text: string;
  at: number;
};

const TAB_IDS: Tab[] = ["listen", "recordings", "talk", "retrain"];

function normalizeTab(raw: string | null): Tab {
  if (raw === "test" || raw === "simulator") return "talk";
  if (raw && TAB_IDS.includes(raw as Tab)) return raw as Tab;
  return "listen";
}

export default function CherryPage() {
  return (
    <Suspense fallback={<p>Loading Cherry…</p>}>
      <CherryInner />
    </Suspense>
  );
}

function CherryInner() {
  const params = useSearchParams();
  const tabParam = params.get("tab");
  const [tab, setTab] = useState<Tab>(() => normalizeTab(tabParam));
  const [info, setInfo] = useState<VoiceInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setTab(normalizeTab(tabParam));
  }, [tabParam]);

  function selectTab(next: Tab) {
    setTab(next);
    setStatus("");
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", `${url.pathname}?tab=${next}`);
  }

  async function refresh() {
    setLoadError("");
    try {
      const response = await fetch("/api/voice/samples");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load voice data.");
      setInfo(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load voice data.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const latestThree = useMemo(() => {
    if (!info?.samples?.length) return [];
    const seen = new Set<string>();
    const picked: Sample[] = [];
    for (const sample of info.samples) {
      const key = sample.label;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(sample);
      if (picked.length >= 8) break;
    }
    return picked;
  }, [info]);

  const style = info?.voiceProfile?.conversation;
  const cloneReady = Boolean(info?.voiceProfile?.cloneReady && info?.voiceProfile?.hasReference);

  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl">
      <p className="text-sm uppercase tracking-[0.18em] text-cherry">Voice agent</p>
      <h1 className="mt-2 font-serif text-4xl tracking-tight sm:text-5xl">Cherry</h1>
      <p className="mt-3 text-mute">
        Listen to your intro, talk with Cherry, and retrain if she does not sound like you yet.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {(
          [
            ["listen", "Listen to Cherry"],
            ["recordings", "Your recordings"],
            ["talk", "Talk with Cherry"],
            ["retrain", "Retrain"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => selectTab(id)}
            className={`rounded-full px-4 py-2 text-sm ${
              tab === id ? "bg-ink text-paper" : "border border-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loadError ? <p className="mt-4 text-sm text-cherry">{loadError}</p> : null}

      {tab === "listen" ? (
        <section className="mt-8 grid gap-4">
          <div className="rounded-2xl bg-white p-5 shadow-card">
            <h2 className="font-serif text-2xl">Listen to Cherry</h2>
            <p className="mt-3 text-mute">
              Cherry introduces you from your resume — a quick way to hear whether she is using your trained
              voice or the default voice.
            </p>
            <dl className="mt-4 grid gap-2 text-sm text-mute">
              <div>
                Voice source:{" "}
                <span className="text-ink">
                  {cloneReady
                    ? "Trained clone (your recordings)"
                    : info?.voiceProfile
                      ? `Default TTS (${info.voiceProfile.ttsVoice || "Edge"})`
                      : "Default TTS — train voice first for your clone"}
                </span>
              </div>
            </dl>
            {!cloneReady ? (
              <p className="mt-3 rounded-2xl border border-line bg-sand/60 px-4 py-3 text-sm text-ink">
                Clone is not active yet, so this preview uses the default voice. Train in Voice studio, then
                listen again.
              </p>
            ) : null}
          </div>
          <CallPanel mode="listen" onStatus={setStatus} />
          {status ? <p className="mt-1 break-words text-sm text-mute">{status}</p> : null}
        </section>
      ) : null}

      {tab === "recordings" ? (
        <section className="mt-8 grid gap-4">
          <div className="rounded-2xl bg-white p-5 shadow-card">
            <h2 className="font-serif text-2xl">Voice profile</h2>
            {info?.voiceProfile ? (
              <dl className="mt-3 grid gap-2 text-sm text-mute">
                <div>
                  Gender: <span className="text-ink">{info.voiceProfile.gender}</span>
                </div>
                <div>
                  TTS voice: <span className="text-ink">{info.voiceProfile.ttsVoice}</span>
                </div>
                <div>
                  Status:{" "}
                  <span className="text-ink">
                    {info.voiceProfile.cloneReady ? "Trained and ready" : "Needs training"}
                  </span>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-mute">No voice profile yet. Complete Voice studio training first.</p>
            )}

            {style && (style.formality || style.notes || style.typicalPhrases?.length) ? (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="font-medium text-ink">How Cherry will speak</h3>
                <dl className="mt-3 grid gap-2 text-sm text-mute">
                  {style.formality ? (
                    <div>
                      Tone: <span className="capitalize text-ink">{String(style.formality)}</span>
                    </div>
                  ) : null}
                  {style.answerLength ? (
                    <div>
                      Answer length:{" "}
                      <span className="capitalize text-ink">{String(style.answerLength)}</span>
                    </div>
                  ) : null}
                </dl>
                {style.notes ? <p className="mt-3 text-sm leading-relaxed text-ink">{style.notes}</p> : null}
                {style.typicalPhrases?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {style.typicalPhrases.map((phrase) => (
                      <span key={phrase} className="rounded-full bg-sand px-3 py-1 text-sm text-ink">
                        {phrase}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {latestThree.length === 0 ? (
            <p className="text-mute">
              No recordings found.{" "}
              <Link href="/app/voice" className="underline">
                Open Voice studio
              </Link>
            </p>
          ) : (
            latestThree.map((sample) => (
              <article key={sample.id} className="rounded-2xl border border-line bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">{sample.label}</h3>
                  <span className="text-xs text-mute">
                    {sample.duration ? `${Math.round(sample.duration)}s` : "saved"} ·{" "}
                    {new Date(sample.createdAt).toLocaleString()}
                  </span>
                </div>
                <audio className="mt-4 w-full" controls src={sample.playUrl} preload="metadata" />
                {sample.transcript ? (
                  <p className="mt-3 break-words text-sm text-mute">{sample.transcript}</p>
                ) : null}
              </article>
            ))
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            className="justify-self-start rounded-full border border-ink px-4 py-2 text-sm"
          >
            Refresh recordings
          </button>
        </section>
      ) : null}

      {tab === "talk" ? (
        <section className="mt-8">
          <p className="text-mute">
            Speak as a recruiter. Watch the orb and the live transcript to see what Cherry heard and said.
          </p>
          <CallPanel mode="edit" onStatus={setStatus} />
          {status ? <p className="mt-3 break-words text-sm text-mute">{status}</p> : null}
        </section>
      ) : null}

      {tab === "retrain" ? (
        <section className="mt-8 rounded-3xl bg-white p-6 shadow-card">
          <h2 className="font-serif text-3xl">Retrain Cherry</h2>
          <p className="mt-3 text-mute">
            Record the three casual passages again in a quiet place. New training replaces the active voice profile.
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-mute">
            <li>Open Voice studio and complete all 4 tasks (~11–14 minutes).</li>
            <li>Rehear clips before training.</li>
            <li>Click Train professional identity clone, then Listen to Cherry.</li>
          </ol>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/app/voice" className="rounded-full bg-cherry px-5 py-3 text-white">
              Open Voice studio
            </Link>
            <button
              type="button"
              onClick={() => selectTab("listen")}
              className="rounded-full border border-ink px-5 py-3"
            >
              Back to Listen
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function CallPanel({
  mode,
  onStatus,
}: {
  mode: "edit" | "listen";
  onStatus: (message: string) => void;
}) {
  const [token, setToken] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const isListen = mode === "listen";

  async function startSession() {
    setConnecting(true);
    setError("");
    onStatus(isListen ? "Starting intro…" : "Starting Cherry…");
    try {
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start the room.");
      setToken(data.token);
      setUrl(data.url);
      setSessionKey((value) => value + 1);
      onStatus(
        isListen
          ? "Connected. Cherry will introduce you from your resume."
          : "Connected. Allow microphone access.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not start Cherry.";
      setError(message);
      onStatus(message);
    } finally {
      setConnecting(false);
    }
  }

  function endSession() {
    setToken("");
    setUrl("");
    onStatus(isListen ? "Intro ended." : "Session ended. Check Call inbox for the summary.");
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={connecting}
          onClick={() => void startSession()}
          className="rounded-full bg-ink px-5 py-3 text-paper disabled:opacity-60"
        >
          {connecting
            ? "Connecting…"
            : token
              ? isListen
                ? "Play again"
                : "Restart session"
              : isListen
                ? "Play introduction"
                : "Start session"}
        </button>
        {token ? (
          <button type="button" onClick={endSession} className="rounded-full border border-ink px-5 py-3">
            End
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-3 break-words text-sm text-cherry">{error}</p> : null}

      {token && url ? (
        <div className="cherry-call mt-5 overflow-hidden rounded-3xl bg-[#1a1512]">
          <LiveKitRoom
            key={sessionKey}
            token={token}
            serverUrl={url}
            connect
            audio
            video={false}
            className="cherry-room"
            data-lk-theme="default"
            onDisconnected={endSession}
            onError={(err) => setError(err.message)}
          >
            <CherryStage listenOnly={isListen} />
            <RoomAudioRenderer />
          </LiveKitRoom>
        </div>
      ) : (
        <p className="mt-4 text-sm text-mute">
          {isListen ? "Click Play introduction when you are ready." : "Click Start session when you are ready."}
        </p>
      )}
    </div>
  );
}

function CherryStage({ listenOnly = false }: { listenOnly?: boolean }) {
  const { state, audioTrack, agent } = useVoiceAssistant();
  const showBars = state === "listening" || state === "thinking" || state === "speaking";

  return (
    <div className="flex w-full flex-col">
      <div className="flex flex-col items-center px-5 pb-4 pt-8 text-center">
        <div className="cherry-orb-wrap">
          <div className={`cherry-orb cherry-orb--${orbTone(state)}`} aria-hidden>
            <div className="cherry-orb__core">
              {showBars ? (
                <BarVisualizer
                  state={state}
                  trackRef={audioTrack}
                  barCount={14}
                  options={{ minHeight: 14, maxHeight: 70 }}
                  className="cherry-bars"
                />
              ) : (
                <span className="block h-2.5 w-2.5 rounded-full bg-white/75" />
              )}
            </div>
          </div>
        </div>

        <p className="mt-5 font-serif text-3xl text-[#F6F0E6]">Cherry</p>
        <p className={`mt-1 text-sm font-medium ${toneClass(state)}`}>
          {listenOnly && state === "idle" ? "Ready to introduce you" : stateLabel(state)}
        </p>
        <p className="mt-1 text-xs text-white/45">
          {agent ? "Connected" : "Waiting for Cherry…"}
        </p>

        {!listenOnly ? (
          <>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <TrackToggle
                source={Track.Source.Microphone}
                className="cherry-mic rounded-full bg-white/10 px-5 py-2.5 text-sm text-[#F6F0E6]"
              />
              <MediaDeviceMenu
                kind="audioinput"
                requestPermissions
                className="cherry-device-btn rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-[#F6F0E6]"
              />
              <MediaDeviceMenu
                kind="audiooutput"
                requestPermissions
                className="cherry-device-btn rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-[#F6F0E6]"
              />
            </div>
            <AudioDeviceHints />
          </>
        ) : (
          <div className="mt-5 w-full max-w-md">
            <label className="grid gap-1 text-left text-xs text-white/70">
              Speaker / headphones
              <SpeakerSelect />
            </label>
            <p className="mt-2 text-left text-xs text-white/45">
              No mic needed — just listen for your voice vs the default voice.
            </p>
          </div>
        )}
      </div>

      <LiveTranscriptPanel emptyHint={listenOnly ? "Cherry’s introduction will show here." : undefined} />
    </div>
  );
}

function SpeakerSelect() {
  const speaker = useMediaDeviceSelect({ kind: "audiooutput", requestPermissions: true });
  return (
    <select
      className="rounded-lg border border-white/15 bg-[#1a1512] px-2 py-1.5 text-sm text-[#F6F0E6]"
      value={speaker.activeDeviceId}
      onChange={(e) => void speaker.setActiveMediaDevice(e.target.value)}
    >
      {speaker.devices.map((device) => (
        <option key={device.deviceId} value={device.deviceId}>
          {device.label || "Speaker"}
        </option>
      ))}
    </select>
  );
}

function AudioDeviceHints() {
  const mic = useMediaDeviceSelect({ kind: "audioinput", requestPermissions: true });
  const speaker = useMediaDeviceSelect({ kind: "audiooutput", requestPermissions: true });
  const micLabel = mic.devices.find((d) => d.deviceId === mic.activeDeviceId)?.label || "Default mic";
  const speakerLabel =
    speaker.devices.find((d) => d.deviceId === speaker.activeDeviceId)?.label || "Default speaker";

  return (
    <div className="mt-4 w-full max-w-md rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-xs text-white/65">
      <p>
        Mic: <span className="text-white/90">{micLabel}</span>
      </p>
      <p className="mt-1">
        Speaker: <span className="text-white/90">{speakerLabel}</span>
      </p>
      <p className="mt-2 text-white/45">
        Using Bluetooth? Open the device buttons above and pick your headset for both mic and speaker.
      </p>
      <div className="mt-3 grid gap-2">
        <label className="grid gap-1 text-white/70">
          Microphone
          <select
            className="rounded-lg border border-white/15 bg-[#1a1512] px-2 py-1.5 text-sm text-[#F6F0E6]"
            value={mic.activeDeviceId}
            onChange={(e) => void mic.setActiveMediaDevice(e.target.value)}
          >
            {mic.devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || "Microphone"}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-white/70">
          Speaker / headphones
          <select
            className="rounded-lg border border-white/15 bg-[#1a1512] px-2 py-1.5 text-sm text-[#F6F0E6]"
            value={speaker.activeDeviceId}
            onChange={(e) => void speaker.setActiveMediaDevice(e.target.value)}
          >
            {speaker.devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || "Speaker"}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function LiveTranscriptPanel({ emptyHint }: { emptyHint?: string }) {
  const turns = useLiveTurns();
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns]);

  return (
    <div className="border-t border-white/10">
      <div className="px-5 py-3">
        <p className="text-xs uppercase tracking-[0.16em] text-white/45">Live transcript</p>
      </div>
      <div ref={listRef} className="cherry-transcript h-56 space-y-3 overflow-y-auto px-5 pb-5">
        {turns.length === 0 ? (
          <p className="text-sm text-white/40">
            {emptyHint || "Your words and Cherry’s replies will show here."}
          </p>
        ) : (
          turns.map((turn) => (
            <div
              key={turn.id}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                turn.role === "you"
                  ? "ml-auto bg-white/10 text-[#F6F0E6]"
                  : "mr-auto bg-[#B42318]/85 text-white"
              }`}
            >
              <p className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
                {turn.role === "you" ? "You" : "Cherry"}
              </p>
              <p className="break-words whitespace-pre-wrap">{turn.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function useLiveTurns() {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const { agent, agentTranscriptions } = useVoiceAssistant();
  const streams = useTranscriptions();
  const [legacy, setLegacy] = useState<LiveTurn[]>([]);

  useEffect(() => {
    const onTranscription = (
      segments: TranscriptionSegment[],
      participant?: { identity?: string } | null,
    ) => {
      const identity = participant?.identity || "";
      const localId = localParticipant?.identity || "";
      const agentId = agent?.identity || "";
      const role: "you" | "cherry" =
        identity && identity === localId
          ? "you"
          : identity && agentId && identity === agentId
            ? "cherry"
            : identity.startsWith("user-")
              ? "you"
              : "cherry";

      setLegacy((current) => {
        const next = [...current];
        for (const segment of segments) {
          const text = (segment.text || "").trim();
          if (!text) continue;
          const id = segment.id || `${role}-${segment.firstReceivedTime || Date.now()}`;
          const existing = next.findIndex((item) => item.id === id);
          const turn: LiveTurn = {
            id,
            role,
            text,
            at: segment.firstReceivedTime || Date.now(),
          };
          if (existing >= 0) next[existing] = turn;
          else next.push(turn);
        }
        return next.sort((a, b) => a.at - b.at).slice(-40);
      });
    };

    room.on(RoomEvent.TranscriptionReceived, onTranscription);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, onTranscription);
    };
  }, [room, localParticipant?.identity, agent?.identity]);

  return useMemo(() => {
    const localId = localParticipant?.identity || "";
    const agentId = agent?.identity || "";
    const map = new Map<string, LiveTurn>();

    for (const turn of legacy) map.set(turn.id, turn);

    for (const stream of streams) {
      const text = (stream.text || "").trim();
      if (!text) continue;
      const identity = stream.participantInfo?.identity || "";
      const role: "you" | "cherry" =
        identity === localId || identity.startsWith("user-")
          ? "you"
          : identity === agentId || identity.includes("agent") || !identity
            ? "cherry"
            : "you";
      const id = stream.streamInfo?.id || `${role}-${stream.streamInfo?.timestamp || text}`;
      map.set(id, {
        id,
        role,
        text,
        at: stream.streamInfo?.timestamp || Date.now(),
      });
    }

    for (const segment of agentTranscriptions || []) {
      const text = (segment.text || "").trim();
      if (!text) continue;
      const id = segment.id || `cherry-${segment.firstReceivedTime || text}`;
      map.set(id, {
        id,
        role: "cherry",
        text,
        at: segment.firstReceivedTime || Date.now(),
      });
    }

    return Array.from(map.values())
      .sort((a, b) => a.at - b.at)
      .slice(-40);
  }, [legacy, streams, agentTranscriptions, localParticipant?.identity, agent?.identity]);
}

function stateLabel(state: AgentState) {
  switch (state) {
    case "disconnected":
      return "Disconnected";
    case "connecting":
      return "Connecting…";
    case "initializing":
      return "Waking up…";
    case "listening":
      return "Listening";
    case "thinking":
      return "Thinking";
    case "speaking":
      return "Speaking";
    case "idle":
      return "Ready";
    default:
      return String(state).replace(/-/g, " ");
  }
}

function orbTone(state: AgentState) {
  if (state === "speaking") return "speaking";
  if (state === "listening") return "listening";
  if (state === "thinking" || state === "connecting" || state === "initializing") return "thinking";
  return "idle";
}

function toneClass(state: AgentState) {
  if (state === "speaking") return "text-[#F0C9C4]";
  if (state === "listening") return "text-[#9AD0B4]";
  if (state === "thinking" || state === "connecting" || state === "initializing") return "text-[#E7C98A]";
  return "text-white/55";
}
