export function GET() {
  return Response.json(
    {
      status: "up",
      release: /^[a-f0-9]{7,64}$/.test(process.env.TRAVELOS_RELEASE || "")
        ? process.env.TRAVELOS_RELEASE!.slice(0, 12)
        : "local",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
