"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_PREFERENCES } from "@/lib/profile";

type Pref = { question: string; answer: string };

export default function AnswersPage() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [status, setStatus] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        const existing = (data.preferences || []) as Pref[];
        setPrefs(existing.length ? existing : DEFAULT_PREFERENCES.map((p) => ({ ...p })));
      })
      .catch(() => undefined);
  }, []);

  const missingCount = useMemo(() => {
    const have = new Set(prefs.map((p) => p.question.trim().toLowerCase()));
    return DEFAULT_PREFERENCES.filter((p) => !have.has(p.question.trim().toLowerCase())).length;
  }, [prefs]);

  const unfilled = useMemo(
    () => prefs.filter((p) => /\[fill/i.test(p.answer) || /replace with/i.test(p.answer)).length,
    [prefs],
  );

  function addMissingScreeningQuestions() {
    const have = new Set(prefs.map((p) => p.question.trim().toLowerCase()));
    const extras = DEFAULT_PREFERENCES.filter((p) => !have.has(p.question.trim().toLowerCase())).map((p) => ({
      ...p,
    }));
    if (!extras.length) {
      setOk(null);
      setStatus("You already have the full screening pack.");
      return;
    }
    setPrefs((current) => [...current, ...extras]);
    setOk(null);
    setStatus(`Added ${extras.length} screening questions. Fill any [Fill…] answers, then save.`);
  }

  async function save() {
    if (saving) return;
    if (prefs.length === 0) {
      setOk(false);
      setStatus("Add at least one preferred answer.");
      return;
    }
    const invalid = prefs.find((p) => !p.question.trim() || !p.answer.trim());
    if (invalid) {
      setOk(false);
      setStatus("Every question and answer needs text.");
      return;
    }

    setSaving(true);
    setOk(null);
    setStatus("Saving…");
    try {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: prefs }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setOk(false);
        setStatus(
          response.status === 401
            ? "Session expired. Sign in again, then save."
            : data.error || "Save failed.",
        );
        return;
      }
      setOk(true);
      setStatus(
        unfilled
          ? "Saved. Fill the remaining [Fill…] placeholders before your next test — Cherry will not invent those."
          : "Saved. Cherry will use these as source of truth on screens.",
      );
    } catch {
      setOk(false);
      setStatus("Save failed. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-5xl">Preferred answers</h1>
      <p className="mt-3 text-mute">
        This is your phone-screen questionnaire. Write answers in first person — professional, specific, and in your
        words. These beat the resume when they conflict.
      </p>
      {unfilled > 0 ? (
        <p className="mt-3 rounded-2xl border border-cherry/25 bg-[#F8EDEA] px-4 py-3 text-sm text-ink">
          {unfilled} answer{unfilled === 1 ? "" : "s"} still need your details (look for{" "}
          <span className="font-medium">[Fill…]</span>). Age, authorization, salary, and similar facts must come from
          you.
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-full border border-ink px-4 py-2 text-sm"
          onClick={addMissingScreeningQuestions}
        >
          {missingCount > 0 ? `Add ${missingCount} missing screening questions` : "Screening pack complete"}
        </button>
        <button
          type="button"
          className="rounded-full border border-ink px-4 py-2 text-sm"
          onClick={() => setPrefs((current) => [...current, { question: "New question", answer: "Your answer" }])}
        >
          Add custom question
        </button>
      </div>

      <div className="mt-8 grid gap-6">
        {prefs.map((item, index) => (
          <div key={`${item.question}-${index}`} className="rounded-2xl border border-line bg-white p-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-mute">Q{index + 1}</p>
            <input
              className="font-medium"
              value={item.question}
              onChange={(e) =>
                setPrefs((current) =>
                  current.map((row, i) => (i === index ? { ...row, question: e.target.value } : row)),
                )
              }
            />
            <textarea
              className="mt-2"
              rows={4}
              value={item.answer}
              onChange={(e) =>
                setPrefs((current) =>
                  current.map((row, i) => (i === index ? { ...row, answer: e.target.value } : row)),
                )
              }
            />
          </div>
        ))}
      </div>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          disabled={saving}
          className="rounded-full bg-ink px-5 py-2 text-paper disabled:opacity-60"
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save answers"}
        </button>
      </div>
      {status ? (
        <p className={`mt-3 text-sm ${ok === false ? "text-cherry" : ok ? "text-moss" : "text-mute"}`}>{status}</p>
      ) : null}
      {ok ? (
        <p className="mt-4 text-sm">
          Next:{" "}
          <a href="/app/edit?tab=listen" className="underline">
            Listen to Cherry
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}
