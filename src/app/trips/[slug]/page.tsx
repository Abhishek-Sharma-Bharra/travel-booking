import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicCampaign } from "@/lib/campaigns/service";
import { HttpError } from "@/lib/http";
import PublicTrip from "@/components/public-trip";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Plan your journey | Vashisht TravelOS",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    return <PublicTrip campaign={await getPublicCampaign(slug)} />;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
}
