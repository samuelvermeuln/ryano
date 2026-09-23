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
import { syncGoogleAvatarForUser } from "@/server/users/avatar";

process.env.NEXTAUTH_URL ??= getAuthUrl();
process.env.NEXTAUTH_SECRET ??= env.AUTH_SECRET;

const PRIMARY_ADMIN_EMAIL = "samuelvermeuln@gmail.com";

function isPrimaryAdminEmail(email: string) {
  return email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL;
}

async function ensurePrimaryAdmin(email: string) {
  if (!isPrimaryAdminEmail(email)) {
    return;
  }

  await prisma.user.updateMany({
    where: {
      email,
      role: {
        not: "ADMIN",
      },
    },
    data: {
      role: "ADMIN",
    },
  });
}

export async function ensureUserScaffold(userId: string) {
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
    create: {
      userId,
      timezone: "UTC",
    },
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
    async signIn({ user, account, profile }) {
      if (!user.email) {
        return false;
      }

      const normalizedEmail = user.email.trim().toLowerCase();

      if (account?.provider === "google") {
        const googleProfile = profile as { email?: string; email_verified?: boolean; picture?: string } | undefined;

        if (!googleProfile?.email || googleProfile.email.toLowerCase() !== normalizedEmail || googleProfile.email_verified !== true) {
          return false;
        }

        const dbUser = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: {
            id: true,
            status: true,
          },
        });

        if (!dbUser) {
          return true;
        }

        if (dbUser.status === "BLOCKED") {
          return false;
        }

        const linkedAccount = await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            },
          },
          select: {
            userId: true,
          },
        });

        if (!linkedAccount) {
          return "/entrar?error=OAuthAccountNotLinked";
        }

        if (linkedAccount.userId !== dbUser.id) {
          return false;
        }

        await ensurePrimaryAdmin(normalizedEmail);
        await ensureUserScaffold(dbUser.id);
        await syncGoogleAvatarForUser({
          userId: dbUser.id,
          imageUrl: googleProfile.picture ?? user.image,
        });
        return true;
      }

      const dbUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!dbUser) {
        return false;
      }

      if (dbUser.status === "BLOCKED") {
        return false;
      }

      await ensurePrimaryAdmin(normalizedEmail);
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
      session.user.name = dbUser.name;
      session.user.email = dbUser.email;
      session.user.image = dbUser.image;
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
        data: {
          role: user.email && isPrimaryAdminEmail(user.email) ? "ADMIN" : undefined,
          status: "ACTIVE",
          emailVerified: new Date(),
        },
      });

      await ensureUserScaffold(user.id);
      await syncGoogleAvatarForUser({ userId: user.id, imageUrl: user.image });
    },
  },
};

export function auth() {
  return getServerSession(authOptions);
}
