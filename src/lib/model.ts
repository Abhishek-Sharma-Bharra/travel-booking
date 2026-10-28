import model from "../../ml/model.json";
export function predict(inputs: number[]) {
  if (
    inputs.length !== 6 ||
    inputs.some(
      (x, i) =>
        !Number.isFinite(x) || x < model.ranges[i][0] || x > model.ranges[i][1],
    )
  )
    throw new Error("Inputs outside supported model ranges");
  const logit =
    model.intercept +
    inputs.reduce(
      (s, x, i) =>
        s + ((x - model.mean[i]) / model.scale[i]) * model.coefficients[i],
      0,
    );
  return 1 / (1 + Math.exp(-logit));
}
type Scorable = {
  budget: number;
  quotedPrice: number;
  enquiryDate: Date;
  travelStart: Date;
  travellers: number;
  firstResponseHours: number | null;
  repeatCustomer: boolean | null;
  itineraryRequested: boolean | null;
};
export function scoreLead(l: Scorable) {
  const missing = [];
  if (l.quotedPrice <= 0) missing.push("quoted price");
  if (l.firstResponseHours === null) missing.push("first response hours");
  if (l.repeatCustomer === null) missing.push("repeat customer");
  if (l.itineraryRequested === null) missing.push("itinerary request");
  const no = (reason: string) => ({
    score: null,
    scoreReason: `Not scored: ${reason}`,
    modelVersion: null,
    scoredAt: null,
  });
  if (missing.length) return no(`missing ${missing.join(", ")}`);
  const inputs = [
    l.budget / l.quotedPrice,
    (+l.travelStart - +l.enquiryDate) / 86400000,
    l.travellers,
    l.firstResponseHours!,
    Number(l.repeatCustomer),
    Number(l.itineraryRequested),
  ];
  const invalid = inputs.flatMap((x, i) =>
    x < model.ranges[i][0] || x > model.ranges[i][1]
      ? [
          `${model.features[i]} must be ${model.ranges[i][0]}–${model.ranges[i][1]}`,
        ]
      : [],
  );
  if (invalid.length) return no(invalid.join("; "));
  const terms = inputs
    .map((x, i) => ({
      name: model.features[i],
      weight: ((x - model.mean[i]) / model.scale[i]) * model.coefficients[i],
    }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 2);
  return {
    score: predict(inputs),
    scoreReason: terms
      .map(
        (t) =>
          `${({ budget_ratio: "Budget compared with quoted price", lead_days: "Time before travel", travellers: "Group size", first_response_hours: "Recorded response time", repeat_customer: "Repeat customer status", itinerary_requested: "Itinerary request" } as Record<string, string>)[t.name] || "Recorded travel information"}: ${t.weight >= 0 ? "increases" : "decreases"} this synthetic model output; not real-world evidence`,
      )
      .join("; "),
    modelVersion: model.version,
    scoredAt: new Date(),
  };
}
export const modelInfo = model;
