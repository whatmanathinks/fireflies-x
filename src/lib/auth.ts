import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { DEMO_EMAIL, DEMO_NAME } from "@/lib/constants";
import { env, hasGoogle } from "@/lib/env";
import { ensureWorkspace } from "@/lib/workspace";

const providers: Provider[] = [];

if (hasGoogle()) {
  providers.push(
    Google({
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

providers.push(
  Credentials({
    id: "demo",
    name: "Demo",
    credentials: {},
    async authorize() {
      const existing = await db.query.users.findFirst({
        where: eq(users.email, DEMO_EMAIL),
      });
      if (existing) return { id: existing.id, email: existing.email, name: existing.name, image: existing.image };
      const [created] = await db
        .insert(users)
        .values({ email: DEMO_EMAIL, name: DEMO_NAME })
        .returning();
      return { id: created.id, email: created.email, name: created.name, image: created.image };
    },
  }),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers,
  session: { strategy: "jwt" },
  secret: env.authSecret || "insecure-dev-secret-change-me",
  pages: { signIn: "/login" },
  trustHost: true,
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      if (token.uid) {
        const ws = await ensureWorkspace(token.uid as string);
        token.wid = ws.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      if (token.wid) (session as { workspaceId?: string }).workspaceId = token.wid as string;
      return session;
    },
  },
});

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return {
    userId: session.user.id,
    workspaceId: (session as { workspaceId?: string }).workspaceId!,
    name: session.user.name ?? "Unknown",
    email: session.user.email ?? "",
    image: session.user.image ?? null,
  };
}
