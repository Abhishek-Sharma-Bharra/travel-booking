import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { operatorEmailAllowed } from "@/lib/admin-overview";
import { mailReady } from "@/lib/mail";
import AdminOnboarding from "@/components/admin-onboarding";
export const dynamic = "force-dynamic";
export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login?next=admin");
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.disabled || !operatorEmailAllowed(user.email)) notFound();
  return (
    <main className="page-content admin-studio">
      <span className="eyebrow">SECURE PLATFORM ONBOARDING</span>
      <h1>Set up your administrator account</h1>
      <p>
        Complete identity and authenticator checks before managing client
        businesses.
      </p>
      <AdminOnboarding
        email={user.email}
        verified={user.emailVerified}
        emailConfigured={mailReady()}
      />
      <a href="/workspace" className="btn secondary">
        Back to your workspace
      </a>
    </main>
  );
}
