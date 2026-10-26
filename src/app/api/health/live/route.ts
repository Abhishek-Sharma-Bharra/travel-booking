export function GET() {
  return Response.json(
    { status: "up" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
