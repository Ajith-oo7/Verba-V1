"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function ActivatePage() {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => setActive(Boolean(data.profile?.cherryActive)))
      .catch(() => undefined);
  }, []);

  async function toggle(next: boolean) {
    if (busy) return;
    setBusy(true);
    setOk(null);
    setStatus(next ? "Activating…" : "Pausing…");
    try {
      const response = await fetch("/api/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cherryActive: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setOk(false);
        setStatus(
          response.status === 401
            ? "Session expired. Sign in again."
            : data.error || "Could not update Cherry.",
        );
        return;
      }
      setActive(next);
      setOk(true);
      setStatus(next ? "Cherry is on for browser screens." : "Cherry is paused.");
    } catch {
      setOk(false);
      setStatus("Could not update Cherry. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-5xl">Activate Cherry</h1>
      <p className="mt-3 text-mute">
        Recruiter phone numbers and call forwarding are not wired yet. Everything else — profile, voice, live browser
        screens — is.
      </p>
      <div className="mt-8 rounded-3xl bg-white p-6 shadow-card">
        <p className="text-sm uppercase tracking-wide text-mute">Assigned number</p>
        <p className="mt-2 font-serif text-4xl">+1 (XXX) XXX-XXXX</p>
        <p className="mt-2 text-sm text-mute">Placeholder. Forwarding stays off until telephony is connected.</p>
        <button
          type="button"
          disabled={busy}
          className={`mt-6 rounded-full px-5 py-3 text-white disabled:opacity-60 ${active ? "bg-moss" : "bg-cherry"}`}
          onClick={() => void toggle(!active)}
        >
          {busy ? "Updating…" : active ? "Cherry is live — click to pause" : "Activate Cherry"}
        </button>
        {status ? (
          <p className={`mt-3 text-sm ${ok === false ? "text-cherry" : ok ? "text-moss" : "text-mute"}`}>{status}</p>
        ) : null}
      </div>
      <ol className="mt-8 list-decimal space-y-2 pl-5 text-sm text-mute">
        <li>Finish profile, voice, and preferred answers.</li>
        <li>
          Open{" "}
          <Link href="/app/edit?tab=listen" className="underline text-ink">
            Cherry
          </Link>{" "}
          and interrogate her like a recruiter.
        </li>
        <li>When phone forwarding ships, this number is what recruiters dial.</li>
      </ol>
      <Link
        href="/app/edit?tab=listen"
        className="mt-6 inline-flex rounded-full bg-ink px-5 py-3 text-paper"
      >
        Open Cherry
      </Link>
    </div>
  );
}
