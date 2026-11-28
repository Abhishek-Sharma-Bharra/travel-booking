import { actor } from "@/lib/session";
import { manager } from "@/lib/commerce/documents";
import { redirect, notFound } from "next/navigation";
import CommunicationsWorkspace from "@/components/communications-workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  try {
    await manager(await actor(), false);
  } catch (e) {
    if ((e as Error).message === "Please sign in") redirect("/login");
    notFound();
  }
  return <CommunicationsWorkspace />;
}
