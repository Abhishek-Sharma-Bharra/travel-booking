import { MarketingHeader, MarketingFooter } from "@/components/marketing";
import MarketplaceSearch from "@/components/marketplace-search";
import { publicMetadata } from "@/lib/seo";
export const metadata = publicMetadata(
  "/marketplace",
  "Hotel, Bus & Car Partners | Vashisht TravelOS",
  "Search approved hotels, full bus charters and car rentals. Review backend-verified prices and policies before requesting a supplier booking.",
);
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <main className="landing">
      <MarketingHeader />
      <header className="marketing-intro">
        <span className="eyebrow">VERIFIED BUSINESS MARKETPLACE</span>
        <h1>Find your next travel partner.</h1>
        <p>
          Search hotels, full bus charters and car rentals. Review a verified
          quote before requesting a booking. Requests do not reserve inventory.
        </p>
      </header>
      <MarketplaceSearch />
      <MarketingFooter />
    </main>
  );
}
