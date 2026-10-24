import { db } from "../src/lib/db";
import { quoteTotal } from "../src/lib/money";
import { scoreLead } from "../src/lib/model";
import { sources } from "../src/lib/validation";
async function seed() {
  if (await db.agency.findUnique({ where: { id: "demo-agency" } })) {
    console.log("Demo already exists; left unchanged.");
    return;
  }
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1),
  );
  const dests = ["Bali", "Kashmir", "Dubai", "Kerala", "Thailand", "Himachal"];
  const names = [
    "Bali Island Escape",
    "Kashmir Valley Retreat",
    "Dubai City & Desert",
    "Kerala Backwater Trail",
    "Thailand Discovery",
    "Himalayan Hideaway",
  ];
  const prices = [5200000, 2800000, 4800000, 2400000, 3800000, 2200000];
  await db.$transaction(
    async (tx) => {
      await tx.agency.create({
        data: {
          id: "demo-agency",
          name: "Evergreen Holidays · Demo",
          demo: true,
          contact: "Fictional agency · India",
          plan: "Growth",
          subscription: "Demo",
          footer:
            "Illustrative quotation only. Fictional data; no booking or payment service.",
        },
      });
      await tx.user.createMany({
        data: ["Aarav Mehta", "Priya Kapoor", "Rohan Shah"].map((name, i) => ({
          id: `demo-user-${i}`,
          agencyId: "demo-agency",
          name,
          email: `sales${i}@demo.invalid`,
          role: i === 0 ? "MANAGER" : "AGENT",
        })),
      });
      await tx.package.createMany({
        data: dests.map((destination, i) => ({
          id: `demo-package-${i}`,
          agencyId: "demo-agency",
          name: names[i],
          destination,
          days: 5 + (i % 4),
          inclusions:
            "Accommodation, daily breakfast, airport transfers and listed sightseeing.",
          exclusions:
            "Flights unless specified, personal expenses, visas and travel insurance.",
          price: prices[i],
          estimatedCost: Math.round(prices[i] * 0.69),
        })),
      });
      const leads = [],
        quotes = [],
        bookings = [],
        transactions = [],
        activities = [],
        spends = [];
      for (let m = 0; m < 6; m++) {
        const monthDate = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 1),
        );
        const month = monthDate.toISOString().slice(0, 7);
        for (let c = 0; c < 2; c++)
          spends.push({
            id: `demo-ad-${m}-${c}`,
            agencyId: "demo-agency",
            month,
            kind: "Advertising",
            channel: sources[c],
            amount: (90000 + m * 3500 + c * 20000) * 100,
            memo: "Fictional monthly spend",
          });
        spends.push({
          id: `demo-op-${m}`,
          agencyId: "demo-agency",
          month,
          kind: "Operating",
          channel: "Office & team",
          amount: (150000 + m * 2000) * 100,
          memo: "Fictional operating expense, separate from contribution",
        });
        for (let j = 0; j < 250; j++) {
          const i = m * 250 + j,
            d = (i * 7 + m) % 6;
          const enquiryDate = new Date(
            Date.UTC(
              monthDate.getUTCFullYear(),
              monthDate.getUTCMonth(),
              1 + (j % 24),
            ),
          );
          const created = new Date(+enquiryDate + 2 * 86400000);
          const travelStart = new Date(
            +enquiryDate + (30 + (i % 90)) * 86400000,
          );
          const travelEnd = new Date(+travelStart + (4 + (d % 4)) * 86400000);
          const won = j < 55,
            quoted = j >= 55 && j < 90,
            lost = j >= 90 && j < 165;
          const travellers = 2 + (i % 5),
            unit = prices[d],
            discount = (i % 3) * 50000,
            taxBps = 500,
            total = quoteTotal(unit, travellers, discount, taxBps),
            estimatedCost = Math.round(unit * 0.69) * travellers;
          const lead = {
            id: `demo-lead-${i}`,
            agencyId: "demo-agency",
            externalId: `VT-${String(i + 1).padStart(4, "0")}`,
            customer: `Demo Traveller ${String(i + 1).padStart(4, "0")}`,
            destination: dests[d],
            enquiryDate,
            travelStart,
            travelEnd,
            travellers,
            budget: Math.round(unit * (0.65 + (i % 10) * 0.065)),
            quotedPrice: unit,
            source: sources[(i + m) % 6],
            assignedId: `demo-user-${i % 3}`,
            stage: won
              ? "Won"
              : quoted
                ? "Quoted"
                : lost
                  ? "Lost"
                  : ["New", "Contacted", "Qualified"][i % 3],
            notes:
              "Fictional enquiry for demonstration. No real customer details.",
            lostReason: lost
              ? ["Budget mismatch", "Travel postponed", "Chose another agency"][
                  i % 3
                ]
              : "",
            followUp:
              won || lost
                ? null
                : new Date(+enquiryDate + ((i % 12) + 2) * 86400000),
            firstResponseHours: i % 9 === 0 ? null : i % 80,
            repeatCustomer: i % 5 === 0,
            itineraryRequested: i % 3 !== 0,
          };
          leads.push({ ...lead, ...scoreLead(lead) });
          if (i % 4 === 0)
            activities.push({
              id: `demo-activity-${i}`,
              agencyId: "demo-agency",
              leadId: lead.id,
              actor: lead.assignedId,
              action: "Follow-up completed: discussed itinerary preferences",
              createdAt: new Date(+enquiryDate + 86400000),
            });
          if (won || quoted)
            quotes.push({
              id: `demo-quote-${i}`,
              agencyId: "demo-agency",
              leadId: lead.id,
              packageId: `demo-package-${d}`,
              travellers,
              unitPrice: unit,
              travelStart,
              travelEnd,
              packageName: names[d],
              destination: dests[d],
              duration: 5 + (d % 4),
              inclusions:
                "Accommodation, daily breakfast, airport transfers and listed sightseeing.",
              exclusions:
                "Flights unless specified, personal expenses, visas and travel insurance.",
              discount,
              taxBps,
              total,
              estimatedCost,
              status: won ? "Accepted" : "Draft",
              createdAt: created,
            });
          if (!won) continue;
          const cancelled = j % 11 === 0,
            cancellationFee = cancelled ? Math.round(total * 0.1) : 0;
          const b = {
            id: `demo-booking-${i}`,
            agencyId: "demo-agency",
            leadId: lead.id,
            quoteId: `demo-quote-${i}`,
            total,
            cancellationFee,
            status: cancelled
              ? "Cancelled"
              : +travelEnd < +now
                ? "Completed"
                : "Confirmed",
            supplierStatus: cancelled
              ? "Pending"
              : j % 4 === 0
                ? "Part confirmed"
                : "Confirmed",
            dueDate: new Date(+travelStart - 14 * 86400000),
            travelStart,
            travelEnd,
            createdAt: created,
          };
          bookings.push(b);
          const received = cancelled
            ? Math.round(total * 0.5)
            : Math.round(total * [0.3, 0.6, 1][j % 3]);
          const cost = Math.round(estimatedCost * (0.94 + (j % 7) * 0.02));
          const base = {
            agencyId: "demo-agency",
            bookingId: b.id,
            date: created,
            memo: "Fictional manual transaction",
          };
          transactions.push({
            ...base,
            id: `demo-receipt-${i}`,
            kind: "Receipt",
            amount: received,
          });
          if (cancelled)
            transactions.push({
              ...base,
              id: `demo-refund-${i}`,
              kind: "Refund",
              amount: received - cancellationFee,
              date: new Date(+created + 5 * 86400000),
            });
          for (let s = 0; s < 2; s++) {
            const amount =
                s === 0
                  ? Math.floor(cost * 0.6)
                  : cost - Math.floor(cost * 0.6),
              supplier =
                s === 0 ? "Demo Hotel Partners" : "Demo Ground Services";
            transactions.push({
              ...base,
              id: `demo-expense-${i}-${s}`,
              kind: "Expense",
              supplier,
              amount,
              dueDate: new Date(+travelStart - 7 * 86400000),
            });
            const credit = cancelled ? Math.floor(amount * 0.85) : 0;
            if (credit)
              transactions.push({
                ...base,
                id: `demo-credit-${i}-${s}`,
                kind: "Supplier credit",
                supplier,
                amount: credit,
                date: new Date(+created + 5 * 86400000),
              });
            transactions.push({
              ...base,
              id: `demo-payment-${i}-${s}`,
              kind: "Supplier payment",
              supplier,
              amount: Math.floor((amount - credit) * (j % 3 === 0 ? 0.5 : 1)),
              date: new Date(+created + 6 * 86400000),
            });
          }
        }
      }
      await tx.lead.createMany({ data: leads });
      await tx.quote.createMany({ data: quotes });
      await tx.booking.createMany({ data: bookings });
      await tx.transaction.createMany({ data: transactions });
      await tx.activity.createMany({ data: activities });
      await tx.spend.createMany({ data: spends });
    },
    { timeout: 60000 },
  );
  console.log(
    "Seeded isolated read-only demo: 1,500 enquiries, 330 bookings, six completed months.",
  );
}
seed()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
