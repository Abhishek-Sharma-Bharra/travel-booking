import { demoData } from "@/lib/data";
import Workspace from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Demo() {
  const data = await demoData();
  return <Workspace initial={JSON.parse(JSON.stringify(data))} />;
}
