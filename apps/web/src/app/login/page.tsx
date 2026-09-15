"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    const data = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(data.error || "Could not sign in.");
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <AuthShell title="Welcome back" subtitle="Cherry is already briefed. Sign in to continue.">
      <form onSubmit={onSubmit} className="grid gap-4">
        <label className="grid gap-1 text-sm">
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label className="grid gap-1 text-sm">
          Password
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        {error ? <p className="text-sm text-cherry">{error}</p> : null}
        <button disabled={pending} className="rounded-full bg-ink py-3 text-paper">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-mute">
        New here? <Link href="/register">Create an account</Link>
      </p>
    </AuthShell>
  );
}
