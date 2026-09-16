import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { firstNameOf } from "@/lib/profile";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const first = firstNameOf(user.profile?.fullName || user.name);
  const ready = Boolean(user.profile?.resumeText || user.profile?.headline);
  const voiced = Boolean(user.voiceProfile?.consentAt);
  const active = Boolean(user.profile?.cherryActive);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm uppercase tracking-[0.18em] text-cherry">Home</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Hello, {first}.</h1>
      <p className="mt-3 max-w-xl text-mute">
        Cherry only takes recruiter screens. Finish setup, then open Cherry to listen to your intro and talk live.
      </p>
      <div className="mt-10 grid gap-4">
        <Step done={ready} href="/app/onboarding" title="1. Professional profile" copy="Resume, authorization, salary, start date." />
        <Step done={voiced} href="/app/voice" title="2. Voice studio" copy="Tasks 1–3 required (~9–11 min). Task 4 recruiter Q&A is optional." />
        <Step done={(user.preferences?.length || 0) > 0} href="/app/answers" title="3. Preferred answers" copy="Full phone-screen questionnaire — age, auth, salary, projects, in your words." />
        <Step done={active} href="/app/activate" title="4. Activate Cherry" copy="Phone number is a placeholder. Browser tests are live." />
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/app/edit?tab=listen" className="rounded-full bg-ink px-5 py-3 text-paper">
          Cherry
        </Link>
        <Link href="/app/edit?tab=talk" className="rounded-full border border-ink px-5 py-3">
          Talk with Cherry
        </Link>
      </div>
    </div>
  );
}

function Step({ done, href, title, copy }: { done: boolean; href: string; title: string; copy: string }) {
  return (
    <Link href={href} className="flex items-start justify-between rounded-2xl border border-line bg-white px-5 py-4 shadow-card">
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-mute">{copy}</p>
      </div>
      <span className={`text-sm ${done ? "text-moss" : "text-mute"}`}>{done ? "Ready" : "Open"}</span>
    </Link>
  );
}
