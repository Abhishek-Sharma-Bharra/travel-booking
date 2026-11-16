import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db, authDatabase, withAuthDatabase, d1Binding } from "./db";
import { sendMail, verificationRequired } from "./mail";
export function createTravelAuth(
  provider: "postgresql" | "sqlite" = process.env.TRAVELOS_DATABASE_ENGINE ===
  "d1"
    ? "sqlite"
    : "postgresql",
) {
  const base = betterAuth({
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (
          ![
            "/two-factor/verify-totp",
            "/two-factor/verify-backup-code",
          ].includes(ctx.path)
        )
          return;
        const returned = ctx.context.returned as { token?: string } | undefined;
        if (!returned || typeof returned.token !== "string") return;
        const token = ctx.context.newSession?.session.token || returned.token;
        if (d1Binding()) {
          const session = await db.session.findUnique({ where: { token } });
          const user =
            session &&
            (await db.user.findUnique({ where: { id: session.userId } }));
          if (user?.twoFactorEnabled)
            await db.session.updateMany({
              where: { token, userId: user.id },
              data: { mfaVerifiedAt: new Date() },
            });
        } else
          await db.session.updateMany({
            where: { token, user: { twoFactorEnabled: true } },
            data: { mfaVerifiedAt: new Date() },
          });
      }),
    },
    plugins: [twoFactor({ issuer: "Vashisht TravelOS" })],
    logger: {
      level: "warn",
      log: (level) => console.warn("Authentication event", { level }),
    },
    database: prismaAdapter(authDatabase, { provider, transaction: true }),
    baseURL: process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: verificationRequired(),
      resetPasswordTokenExpiresIn: 1800,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        sendMail(
          user.email,
          "Reset your TravelOS password",
          `You requested a password reset. This one-time link expires in 30 minutes:\n\n${url}\n\nIf you did not request this, ignore this email. Never share this link.`,
        ),
    },
    emailVerification: {
      sendOnSignUp: verificationRequired(),
      sendOnSignIn: verificationRequired(),
      autoSignInAfterVerification: true,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) =>
        sendMail(
          user.email,
          "Verify your TravelOS email",
          `Verify your email to access TravelOS. This link expires in one hour:\n\n${url}\n\nIf you did not create this account, ignore this email.`,
        ),
    },
    user: {
      additionalFields: {
        agencyId: { type: "string", required: false, input: false },
        role: {
          type: "string",
          required: false,
          input: false,
          defaultValue: "OWNER",
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 12,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await db.user.findUnique({
              where: { id: session.userId },
              select: { disabled: true },
            });
            if (user?.disabled)
              throw new APIError("FORBIDDEN", {
                code: "ACCOUNT_DISABLED",
                message: "This account is disabled. Contact your agency owner.",
              });
            return { data: session };
          },
        },
      },
      user: {
        create: {
          before: async (user) => {
            const agency = await db.agency.create({
              data: { name: `${user.name}'s agency` },
            });
            return { data: { ...user, agencyId: agency.id, role: "OWNER" } };
          },
        },
      },
    },
  });

  const api = new Proxy(base.api, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (typeof value !== "function") return value;
      return new Proxy(value, {
        apply(endpoint, thisArg, args) {
          return withAuthDatabase(async () =>
            Reflect.apply(endpoint, thisArg, args),
          );
        },
      });
    },
  });
  return new Proxy(base, {
    get(target, property) {
      if (property === "api") return api;
      if (property === "handler")
        return (...args: Parameters<typeof base.handler>) =>
          withAuthDatabase(() => base.handler(...args));
      return Reflect.get(target, property);
    },
  });
}
export const auth = createTravelAuth();
