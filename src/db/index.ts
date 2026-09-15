import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

declare global {
  var __ff_sql: ReturnType<typeof postgres> | undefined;
}

const client =
  globalThis.__ff_sql ??
  postgres(env.databaseUrl, {
    max: 5,
    idle_timeout: 20,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalThis.__ff_sql = client;

export const db = drizzle(client, { schema });
export { schema };
