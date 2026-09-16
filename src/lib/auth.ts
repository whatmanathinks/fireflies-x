import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { createDemoSandbox } from "@/lib/demo";
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
      const user = await createDemoSandbox();
      return { id: user.id, email: user.email, name: user.name, image: user.image };
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
