import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const links = [
    ["/app", "Home"],
    ["/app/onboarding", "Profile"],
    ["/app/voice", "Voice"],
    ["/app/answers", "Answers"],
    ["/app/activate", "Activate"],
    ["/app/edit?tab=listen", "Cherry"],
    ["/app/calls", "Call inbox"],
  ];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="border-b border-line bg-[#EFE8DB] px-5 py-6 lg:border-b-0 lg:border-r">
        <Link href="/app" className="font-serif text-3xl tracking-tight">
          Verba
        </Link>
        <p className="mt-1 text-sm text-mute">Cherry is listening for screens, not interviews.</p>
        <nav className="mt-8 grid gap-1 text-sm">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-lg px-3 py-2 hover:bg-white">
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-10">
          <LogoutButton />
        </div>
      </aside>
      <main className="min-w-0 overflow-x-hidden px-5 py-8 lg:px-12">{children}</main>
    </div>
  );
}
