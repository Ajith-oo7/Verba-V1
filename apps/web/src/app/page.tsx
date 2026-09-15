import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect("/app");

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between">
        <span className="font-serif text-3xl">Verba</span>
        <div className="flex gap-3 text-sm">
          <Link href="/login" className="rounded-full px-4 py-2 hover:bg-sand">
            Sign in
          </Link>
          <Link href="/register" className="rounded-full bg-ink px-4 py-2 text-paper">
            Create account
          </Link>
        </div>
      </header>
      <section className="mt-24 max-w-3xl">
        <p className="text-sm uppercase tracking-[0.2em] text-cherry">Professional representative</p>
        <h1 className="mt-4 font-serif text-6xl leading-[1.05] tracking-tight md:text-7xl">
          Cherry takes the screening call. You take the real interview.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-mute">
          Recruiter screens are the same 12 questions, over and over. Cherry already knows your resume, visa,
          salary, and how you talk. She answers. You stay free for the conversations that actually matter.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/register" className="rounded-full bg-cherry px-6 py-3 text-white">
            Build Cherry
          </Link>
          <Link href="/login" className="rounded-full border border-ink px-6 py-3">
            Sign in
          </Link>
        </div>
      </section>
      <section className="mt-24 grid gap-6 md:grid-cols-3">
        {[
          ["Not a coach", "Cherry is not a teleprompter or a note-taker. She is on the call."],
          ["Sounds like you", "Upload your voice. Cherry matches gender and the way you actually speak."],
          ["Screens only", "Location, auth, salary, start date. If it becomes an interview, she stops."],
        ].map(([title, copy]) => (
          <div key={title} className="rounded-3xl border border-line bg-white p-6 shadow-card">
            <h2 className="font-serif text-2xl">{title}</h2>
            <p className="mt-2 text-mute">{copy}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
