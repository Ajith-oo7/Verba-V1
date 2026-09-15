"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    const data = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(data.error || "Could not create the account.");
      return;
    }
    router.push("/app/onboarding");
    router.refresh();
  }

  return (
    <AuthShell title="Create Cherry" subtitle="Start with your name. Resume and voice come next.">
      <form onSubmit={onSubmit} className="grid gap-4">
        <label className="grid gap-1 text-sm">
          Full name
          <input name="name" required autoComplete="name" />
        </label>
        <label className="grid gap-1 text-sm">
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label className="grid gap-1 text-sm">
          Password
          <input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </label>
        {error ? <p className="text-sm text-cherry">{error}</p> : null}
        <button disabled={pending} className="rounded-full bg-cherry py-3 text-white">
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-mute">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
