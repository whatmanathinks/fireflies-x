import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Fireflies Clone — Never take meeting notes again",
  description:
    "Record, transcribe, summarize and search every meeting. Real speaker diarization, AI notes that cite the moment, and a notetaker bot for Meet, Zoom and Teams.",
};

export default async function LandingPage() {
  const session = await auth();
  return <Landing signedIn={!!session?.user} />;
}
