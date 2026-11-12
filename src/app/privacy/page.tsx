import { publicMetadata } from "@/lib/seo";
import Policy from "@/components/service-policy";
export const metadata = publicMetadata(
  "/privacy",
  "Privacy Information | Vashisht TravelOS",
  "Understand the customer and agency records TravelOS stores, access controls and how to contact support about privacy requests.",
);
export const dynamic = "force-dynamic";
export default function Page() {
  return <Policy kind="privacy" />;
}
