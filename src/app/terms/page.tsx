import { publicMetadata } from "@/lib/seo";
import Policy from "@/components/service-policy";
export const metadata = publicMetadata(
  "/terms",
  "Service Terms | Vashisht TravelOS",
  "Read the TravelOS pilot service terms, subscription responsibilities and operational limits before onboarding your agency.",
);
export const dynamic = "force-dynamic";
export default function Page() {
  return <Policy kind="terms" />;
}
