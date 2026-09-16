import { eq } from "drizzle-orm";
import { SettingsForm } from "@/components/settings/settings-form";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { providerLabel } from "@/lib/ai/provider";
import { requireSession } from "@/lib/auth";
import {
  hasBlob,
  hasDeepgram,
  hasGoogle,
  hasRecall,
  isLocalHost,
  missingKeys,
} from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, session.workspaceId),
  });

  return (
    <SettingsForm
      user={{ name: session.name, email: session.email, image: session.image }}
      workspace={{
        id: workspace!.id,
        name: workspace!.name,
        defaultPrivacy: workspace!.defaultPrivacy,
        defaultTemplate: workspace!.defaultTemplate,
        language: workspace!.language,
        customVocabulary: workspace!.customVocabulary,
        autoJoinMode: workspace!.autoJoinMode,
      }}
      capabilities={{
        stt: hasDeepgram(),
        llm: providerLabel(),
        blob: hasBlob(),
        google: hasGoogle(),
        webhooks: !isLocalHost(),
        notetaker: hasRecall(),
        missing: missingKeys(),
      }}
    />
  );
}
