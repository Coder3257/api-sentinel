import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { getSupabaseClient } from "@/lib/supabase/client";

const handler = NextAuth({
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "github" && profile) {
        const supabase = getSupabaseClient();
        const githubId = parseInt(account.providerAccountId);
        const githubUsername = (profile as any).login || user.name || "";
        const email = user.email || null;

        // Upsert user to Supabase
        const { error } = await supabase.from("users").upsert(
          {
            github_id: githubId,
            github_username: githubUsername,
            email: email,
          },
          { onConflict: "github_id" }
        );

        if (error) {
          console.error("Error upserting user to Supabase:", error);
          return false;
        }
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as any).id = token.sub;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
