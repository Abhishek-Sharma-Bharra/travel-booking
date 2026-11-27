"use client";
import {
  ArrowUpRight,
  Check,
  Compass,
  FileText,
  Package,
  Users,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type { Dataset } from "@/lib/data";
export default function AgencyStudioWelcome({
  data,
  onPage,
  onEnquiry,
  onPackage,
}: {
  data: Dataset;
  onPage: (p: string) => void;
  onEnquiry: () => void;
  onPackage: () => void;
}) {
  const manager = data.actor.role !== "AGENT",
    name =
      data.users.find((u) => u.id === data.actor.id)?.name.split(" ")[0] ||
      "there",
    steps = [
      {
        title: "Shape your first journey",
        description: "Add a package with its itinerary, rates and terms.",
        complete: data.packages.length > 0,
        page: "Packages",
        icon: Package,
      },
      {
        title: "Start a customer conversation",
        description: "Capture requirements and plan the next follow-up.",
        complete: data.leads.length > 0,
        page: "Enquiries",
        icon: Users,
      },
      {
        title: "Make a considered proposal",
        description:
          "Review a quotation before sharing it with your traveller.",
        complete: data.quotes.length > 0,
        page: "Quotations",
        icon: FileText,
      },
    ];
  return (
    <section className="agency-studio-intro" aria-label="Your agency studio">
      <div className="studio-welcome">
        <div className="studio-welcome-copy">
          <span className="studio-eyebrow">
            <span /> YOUR AGENCY, IN FOCUS
          </span>
          <h2>
            {data.leads.length
              ? `A clearer day starts here, ${name}.`
              : `Welcome to your next chapter, ${name}.`}
          </h2>
          <p>
            From a first hello to the final itinerary. Your people, proposals
            and journeys, thoughtfully connected.
          </p>
          <div className="studio-welcome-actions">
            <button className="btn primary" onClick={onEnquiry}>
              <Users size={16} />
              Create enquiry
              <ArrowUpRight size={16} />
            </button>
            <button
              className="btn secondary"
              onClick={() => onPage("AI Travel Agent")}
            >
              <Sparkles size={16} />
              Open travel assistant
            </button>
          </div>
          <small>
            {data.demo
              ? "Fictional demo workspace · explore without changing records"
              : "Your agency workspace · records stay within your permitted team scope"}
          </small>
        </div>
        <div className="studio-journey-art" aria-hidden="true">
          <div className="studio-art-orbit" />
          <div className="studio-art-orbit second" />
          <div className="studio-art-compass">
            <Compass size={68} strokeWidth={1.1} />
          </div>
          <span className="studio-art-tag top">
            <Users size={17} />A conversation worth keeping
          </span>
          <span className="studio-art-tag bottom">
            <FileText size={17} />A journey, beautifully planned
          </span>
          <span className="studio-art-dot one" />
          <span className="studio-art-dot two" />
        </div>
      </div>
      <div className="studio-workflow-header">
        <div>
          <span className="studio-eyebrow">
            A LITTLE STRUCTURE. MORE POSSIBILITY.
          </span>
          <h3>
            {data.leads.length
              ? "Keep the next step moving"
              : "Make this workspace yours"}
          </h3>
        </div>
        <span>
          {steps.filter((s) => s.complete).length} of {steps.length} foundations
          in place
        </span>
      </div>
      <div className="studio-steps">
        {steps.map((s, i) => (
          <article key={s.page}>
            <div className="studio-step-icon">
              {s.complete ? <Check size={19} /> : <s.icon size={19} />}
            </div>
            <small>
              0{i + 1} · {s.complete ? "IN PLACE" : "NEXT STEP"}
            </small>
            <h4>{s.title}</h4>
            <p>{s.description}</p>
            <button
              onClick={() =>
                s.page === "Packages" && !s.complete && manager
                  ? onPackage()
                  : s.page === "Enquiries" && !s.complete
                    ? onEnquiry()
                    : onPage(s.page)
              }
            >
              {s.complete ? "Open " : "Start "}
              {s.page.toLowerCase()}
              <ArrowRight size={15} />
            </button>
          </article>
        ))}
      </div>
      <div
        className="studio-release-tools"
        role="region"
        aria-label="Available workspace tools"
      >
        <div>
          <span className="studio-eyebrow">EXPLORE YOUR WORKSPACE</span>
          <h3>Tools ready for your daily operations</h3>
          <p>
            Review records and drafts. Live paid AI, external messaging and
            automatic billing require separate setup.
          </p>
        </div>
        <div className="studio-welcome-actions">
          <button
            className="btn secondary"
            onClick={() => onPage("CRM review")}
          >
            CRM review centre <ArrowUpRight size={16} />
          </button>
          {manager && (
            <button
              className="btn secondary"
              onClick={() => onPage("Suppliers")}
            >
              Suppliers & contracts <ArrowUpRight size={16} />
            </button>
          )}
          <button
            className="btn secondary"
            onClick={() => onPage("Itineraries & costing")}
          >
            Itineraries & costing <ArrowUpRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
