import { redirect } from "next/navigation";

export default function CallRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; tab?: string }>;
}) {
  return <Redirector searchParams={searchParams} />;
}

async function Redirector({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; tab?: string }>;
}) {
  const params = await searchParams;
  if (params.tab) {
    const tab =
      params.tab === "simulator" || params.tab === "test" ? "talk" : params.tab;
    redirect(`/app/edit?tab=${tab}`);
  }
  redirect("/app/edit?tab=listen");
}
