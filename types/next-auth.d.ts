import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: "USER" | "ADMIN";
      status: "ACTIVE" | "BLOCKED" | "PENDING";
      onboardingComplete: boolean;
      phoneE164: string | null;
      whatsappVerified: boolean;
    };
  }
}
