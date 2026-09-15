import Link from "next/link";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="font-serif text-3xl">
        Verba
      </Link>
      <h1 className="mt-8 font-serif text-4xl">{title}</h1>
      <p className="mt-2 text-mute">{subtitle}</p>
      <div className="mt-8">{children}</div>
    </div>
  );
}
