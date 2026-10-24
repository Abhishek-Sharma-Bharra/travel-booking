export type Actor = {
  id: string;
  agencyId: string;
  role: string;
  demo?: boolean;
};
export function scope(a: Actor) {
  return {
    agencyId: a.agencyId,
    ...(a.role === "AGENT" ? { assignedId: a.id } : {}),
  };
}
export function canManage(a: Actor) {
  if (!["OWNER", "MANAGER"].includes(a.role))
    throw new Error("Manager or owner permission required");
}
export function requireOwner(a: Actor) {
  if (a.role !== "OWNER")
    throw new Error(
      "Only the owner can manage team access and agency settings",
    );
}
export function writable(a: Actor) {
  if (a.demo) throw new Error("Demo workspace is read-only");
}
