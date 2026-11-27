// An explicit option for a newly created enquiry, not a persisted user ID.
export const AUTO_ASSIGNEE = "__AUTO_LOWEST_OPEN__";
export const openLeadStages = [
  "New",
  "Contacted",
  "Qualified",
  "Quoted",
] as const;
export function leastOpenAssignee(rows: { id: string; open: number }[]) {
  const selected = [...rows].sort(
    (a, b) => a.open - b.open || a.id.localeCompare(b.id),
  )[0];
  if (!selected)
    throw new Error("No active teammate is available for assignment");
  return selected.id;
}
