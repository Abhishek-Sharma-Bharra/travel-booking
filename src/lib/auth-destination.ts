// Fixed internal destinations only: never redirect to a supplied URL.
export function loginDestination(next: string | null) {
  return next === "operator"
    ? "/operator"
    : next === "marketplace"
      ? "/marketplace"
      : next === "marketplace-admin"
        ? "/admin/marketplace"
        : next === "hotelier"
          ? "/hotelier"
          : next === "hotel-admin"
            ? "/admin/hotels"
            : "/workspace";
}
export function mfaDestination(next: string | null) {
  return next === "admin" ? "/admin" : loginDestination(next);
}
