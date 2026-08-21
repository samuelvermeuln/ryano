import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";

import { prisma } from "@/server/db";
import { env, getAuthUrl, hasGoogleOAuthEnv } from "@/server/env";
import { verifyPassword } from "@/server/crypto/password";
import { assertRateLimit } from "@/server/rate-limit";
import { isOnboardingComplete } from "@/server/users/onboarding";

process.env.NEXTAUTH_URL ??= getAuthUrl();
process.env.NEXTAUTH_SECRET ??= env.AUTH_SECRET;

async function ensureUserScaffold(userId: string) {
  await prisma.userProfile.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  await prisma.address.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  await prisma.notificationPreference.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email?.trim().toLowerCase();
      const password = credentials?.password;

      if (!email || !password) {
        return null;
      }

      await assertRateLimit(email, 10, 1000 * 60 * 15, "credentials-login");

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user?.passwordHash || user.status === "BLOCKED") {
        return null;
      }

      const isValid = await verifyPassword(password, user.passwordHash);

      if (!isValid) {
        return null;
      }

      await ensureUserScaffold(user.id);

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      };
    },
  }),
];

if (hasGoogleOAuthEnv()) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers,
  session: {
    strategy: "database",
  },
  pages: {
    signIn: "/entrar",
  },
  secret: process.env.AUTH_SECRET,
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) {
        return false;
      }

      const dbUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (!dbUser) {
        return account?.provider === "google";
      }

      if (dbUser.status === "BLOCKED") {
        return false;
      }

      await ensureUserScaffold(dbUser.id);
      return true;
    },
    async session({ session, user }) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          profile: true,
          address: true,
          whatsappIdentity: true,
          notificationPreference: true,
        },
      });

      if (!session.user || !dbUser) {
        return session;
      }

      session.user.id = dbUser.id;
      session.user.role = dbUser.role;
      session.user.status = dbUser.status;
      session.user.onboardingComplete = isOnboardingComplete(dbUser);
      session.user.phoneE164 = dbUser.profile?.phoneE164 ?? null;
      session.user.whatsappVerified = Boolean(dbUser.whatsappIdentity?.verifiedAt);

      return session;
    },
  },
  events: {
    async createUser({ user }) {
      await prisma.user.update({
        where: { id: user.id },
        data: { status: "ACTIVE" },
      });

      await ensureUserScaffold(user.id);
    },
  },
};

export function auth() {
  return getServerSession(authOptions);
}
