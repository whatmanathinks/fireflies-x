import { sql } from "drizzle-orm";
import { db } from "@/db";

async function main() {
  await db.execute(sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  console.log("Schema dropped. Run: pnpm db:push && pnpm db:seed");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
