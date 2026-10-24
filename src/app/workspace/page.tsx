import { actor } from "@/lib/session";
import { workspaceData } from "@/lib/data";
import { redirect } from "next/navigation";
import Workspace from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function App() {
  const a = await actor().catch(() => null);
  if (!a) redirect("/login");
  const data = await workspaceData(a);
  return <Workspace initial={JSON.parse(JSON.stringify(data))} />;
}
