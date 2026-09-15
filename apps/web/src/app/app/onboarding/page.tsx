"use client";

import { FormEvent, useEffect, useState } from "react";

type ProfileState = {
  fullName: string;
  headline: string;
  location: string;
  linkedinUrl: string;
  portfolioUrl: string;
  workAuthorization: string;
  requiresSponsorship: boolean;
  salaryMin: string;
  salaryMax: string;
  startDate: string;
  openToRelocation: boolean;
  openToHybrid: boolean;
  openToRemote: boolean;
  availability: string;
  skills: string;
};

type UploadPhase = "idle" | "uploading" | "parsing" | "saving" | "done" | "error";

const empty: ProfileState = {
  fullName: "",
  headline: "",
  location: "",
  linkedinUrl: "",
  portfolioUrl: "",
  workAuthorization: "",
  requiresSponsorship: false,
  salaryMin: "",
  salaryMax: "",
  startDate: "",
  openToRelocation: false,
  openToHybrid: true,
  openToRemote: true,
  availability: "",
  skills: "",
};

const PHASE_COPY: Record<UploadPhase, string> = {
  idle: "",
  uploading: "Uploading PDF…",
  parsing: "Reading resume with Gemini…",
  saving: "Saving extracted fields…",
  done: "Resume parsed. Confirm every field — Cherry will not invent facts.",
  error: "Resume parse failed.",
};

const PHASE_PCT: Record<UploadPhase, number> = {
  idle: 0,
  uploading: 22,
  parsing: 70,
  saving: 92,
  done: 100,
  error: 100,
};

export default function OnboardingPage() {
  const [form, setForm] = useState<ProfileState>(empty);
  const [uploadStatus, setUploadStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [saveOk, setSaveOk] = useState<boolean | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [fileName, setFileName] = useState("");
  const [errorDetail, setErrorDetail] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        const p = data.profile;
        if (!p) return;
        setForm({
          fullName: p.fullName || "",
          headline: p.headline || "",
          location: p.location || "",
          linkedinUrl: p.linkedinUrl || "",
          portfolioUrl: p.portfolioUrl || "",
          workAuthorization: p.workAuthorization || "",
          requiresSponsorship: Boolean(p.requiresSponsorship),
          salaryMin: p.salaryMin != null ? String(p.salaryMin) : "",
          salaryMax: p.salaryMax != null ? String(p.salaryMax) : "",
          startDate: p.startDate || "",
          openToRelocation: Boolean(p.openToRelocation),
          openToHybrid: p.openToHybrid !== false,
          openToRemote: p.openToRemote !== false,
          availability: p.availability || "",
          skills: safeSkills(p.skillsJson),
        });
      })
      .catch(() => undefined);
  }, []);

  async function uploadResume(file: File) {
    setParsing(true);
    setFileName(file.name);
    setErrorDetail("");
    setSaveStatus("");
    setSaveOk(null);
    setPhase("uploading");
    setUploadStatus(PHASE_COPY.uploading);

    const controller = new AbortController();
    const watchdog = window.setTimeout(() => controller.abort(), 90_000);

    try {
      const body = new FormData();
      body.set("resume", file);

      window.setTimeout(() => {
        setPhase((current) => (current === "uploading" ? "parsing" : current));
        setUploadStatus((current) => (current === PHASE_COPY.uploading ? PHASE_COPY.parsing : current));
      }, 400);

      const response = await fetch("/api/profile", {
        method: "POST",
        body,
        signal: controller.signal,
      });

      let data: { profile?: Record<string, unknown>; error?: string } = {};
      try {
        data = await response.json();
      } catch {
        data = { error: `Server returned ${response.status}. Try again or fill the form manually.` };
      }

      if (!response.ok) {
        setPhase("error");
        setErrorDetail(data.error || "Could not parse the resume.");
        setUploadStatus(data.error || PHASE_COPY.error);
        return;
      }

      setPhase("saving");
      setUploadStatus(PHASE_COPY.saving);
      const p = data.profile || {};
      setForm((current) => ({
        ...current,
        fullName: String(p.fullName || current.fullName),
        headline: String(p.headline || current.headline),
        location: String(p.location || current.location),
        linkedinUrl: String(p.linkedinUrl || current.linkedinUrl),
        workAuthorization: String(p.workAuthorization || current.workAuthorization),
        skills: Array.isArray(p.skills) ? p.skills.map(String).join(", ") : current.skills,
      }));
      setPhase("done");
      setUploadStatus(PHASE_COPY.done);
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      const message = aborted
        ? "Timed out after 90 seconds. Check your Gemini API key, then try again or fill the form manually."
        : error instanceof Error
          ? error.message
          : "Upload failed.";
      setPhase("error");
      setErrorDetail(message);
      setUploadStatus(message);
    } finally {
      window.clearTimeout(watchdog);
      setParsing(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (parsing || saving) return;

    if (!form.fullName.trim()) {
      setSaveOk(false);
      setSaveStatus("Full name is required before saving.");
      return;
    }

    setSaving(true);
    setSaveOk(null);
    setSaveStatus("Saving profile…");

    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          headline: form.headline,
          location: form.location,
          linkedinUrl: form.linkedinUrl,
          portfolioUrl: form.portfolioUrl,
          workAuthorization: form.workAuthorization,
          requiresSponsorship: form.requiresSponsorship,
          salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
          salaryMax: form.salaryMax ? Number(form.salaryMax) : null,
          salaryCurrency: "USD",
          startDate: form.startDate,
          openToRelocation: form.openToRelocation,
          openToHybrid: form.openToHybrid,
          openToRemote: form.openToRemote,
          availability: form.availability,
          skillsJson: JSON.stringify(
            form.skills
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        }),
      });

      let data: { error?: string } = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        setSaveOk(false);
        if (response.status === 401) {
          setSaveStatus("Session expired. Sign in again, then save.");
          return;
        }
        setSaveStatus(data.error || `Save failed (${response.status}).`);
        return;
      }

      setSaveOk(true);
      setSaveStatus("Saved. Cherry will only use what you confirmed.");
    } catch {
      setSaveOk(false);
      setSaveStatus("Save failed. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof ProfileState>(key: K, value: ProfileState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (saveOk !== null) {
      setSaveOk(null);
      setSaveStatus("");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-5xl">Professional profile</h1>
      <p className="mt-3 text-mute">
        Upload a resume, then correct anything Gemini guessed. Empty is better than a lie — Cherry refuses to invent.
      </p>
      <label className="mt-8 block rounded-2xl border border-dashed border-ink/30 bg-white p-6 text-sm">
        Resume PDF
        <input
          className="mt-3 border-0 p-0 ring-0"
          type="file"
          accept="application/pdf"
          disabled={parsing || saving}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadResume(file);
            e.target.value = "";
          }}
        />
      </label>

      {phase !== "idle" ? (
        <div className="mt-4 rounded-2xl border border-line bg-white p-4 shadow-card">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium truncate">{fileName || "Resume"}</span>
            <span
              className={
                phase === "error" ? "text-cherry" : phase === "done" ? "text-moss" : "text-mute"
              }
            >
              {phase === "error" ? "Failed" : phase === "done" ? "Done" : `${PHASE_PCT[phase]}%`}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                phase === "error" ? "bg-cherry" : phase === "done" ? "bg-moss" : "bg-ink"
              } ${parsing && phase !== "error" ? "animate-pulse" : ""}`}
              style={{ width: `${PHASE_PCT[phase]}%` }}
            />
          </div>
          <p className={`mt-3 text-sm ${phase === "error" ? "text-cherry" : "text-mute"}`}>
            {uploadStatus}
          </p>
          {phase === "error" && errorDetail ? (
            <p className="mt-1 text-xs text-mute">You can still fill the fields below and save manually.</p>
          ) : null}
          <ol className="mt-4 grid gap-1 text-xs text-mute">
            <StepRow label="Upload PDF" active={phase === "uploading"} done={["parsing", "saving", "done"].includes(phase)} failed={phase === "error"} />
            <StepRow label="Parse with Gemini" active={phase === "parsing"} done={["saving", "done"].includes(phase)} failed={phase === "error"} />
            <StepRow label="Fill profile fields" active={phase === "saving"} done={phase === "done"} failed={false} />
          </ol>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-8 grid gap-4">
        <Field label="Full name" value={form.fullName} onChange={(v) => set("fullName", v)} required />
        <Field label="Headline" value={form.headline} onChange={(v) => set("headline", v)} />
        <Field label="Location" value={form.location} onChange={(v) => set("location", v)} />
        <Field label="LinkedIn URL" value={form.linkedinUrl} onChange={(v) => set("linkedinUrl", v)} />
        <Field label="Portfolio URL" value={form.portfolioUrl} onChange={(v) => set("portfolioUrl", v)} />
        <Field label="Work authorization" value={form.workAuthorization} onChange={(v) => set("workAuthorization", v)} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="w-auto"
            checked={form.requiresSponsorship}
            onChange={(e) => set("requiresSponsorship", e.target.checked)}
          />
          Requires sponsorship
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Salary min" value={form.salaryMin} onChange={(v) => set("salaryMin", v)} inputMode="numeric" />
          <Field label="Salary max" value={form.salaryMax} onChange={(v) => set("salaryMax", v)} inputMode="numeric" />
        </div>
        <Field label="Start date / notice" value={form.startDate} onChange={(v) => set("startDate", v)} />
        <div className="grid gap-2 text-sm">
          <Toggle label="Open to relocation" checked={form.openToRelocation} onChange={(v) => set("openToRelocation", v)} />
          <Toggle label="Open to hybrid" checked={form.openToHybrid} onChange={(v) => set("openToHybrid", v)} />
          <Toggle label="Open to remote" checked={form.openToRemote} onChange={(v) => set("openToRemote", v)} />
        </div>
        <Field label="Skills (comma separated)" value={form.skills} onChange={(v) => set("skills", v)} />
        <label className="grid gap-1 text-sm">
          Availability notes
          <textarea rows={3} value={form.availability} onChange={(e) => set("availability", e.target.value)} />
        </label>
        <button
          type="submit"
          disabled={parsing || saving}
          className="rounded-full bg-ink py-3 text-paper disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
        {saveStatus ? (
          <p className={`text-sm ${saveOk === false ? "text-cherry" : saveOk ? "text-moss" : "text-mute"}`}>
            {saveStatus}
          </p>
        ) : null}
        {saveOk ? (
          <p className="text-sm text-mute">
            Next:{" "}
            <a href="/app/voice" className="underline text-ink">
              Voice studio
            </a>
            .
          </p>
        ) : null}
      </form>
    </div>
  );
}

function StepRow({
  label,
  active,
  done,
  failed,
}: {
  label: string;
  active: boolean;
  done: boolean;
  failed: boolean;
}) {
  const mark = failed && !done ? "!" : done ? "✓" : active ? "…" : "○";
  return (
    <li className={`flex items-center gap-2 ${active ? "text-ink" : ""}`}>
      <span className="w-4 text-center">{mark}</span>
      {label}
    </li>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <input
        value={value}
        required={required}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" className="w-auto" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function safeSkills(raw: string) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.join(", ") : "";
  } catch {
    return "";
  }
}
