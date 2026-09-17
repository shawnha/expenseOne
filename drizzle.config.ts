import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// 안전장치: drizzle-kit push/migrate는 운영 DB(ERP와 같은 Postgres를 공유)에 바로 쓴다.
// 이 프로젝트의 마이그레이션은 drizzle/*.sql을 사람이 검토해 수동 적용한다(drizzle/README.md).
// .env.local을 읽기 **전에** 막아서, 실수로 실행해도 DB 주소를 읽거나 연결하지 않는다.
// generate·check 등 DB에 쓰지 않는 명령은 그대로 쓸 수 있다.
const BLOCKED_COMMANDS = ["push", "migrate"];
const blockedCommand = process.argv.slice(2).find((arg) => BLOCKED_COMMANDS.includes(arg));
if (blockedCommand) {
  throw new Error(
    `drizzle-kit ${blockedCommand}는 이 프로젝트에서 막혀 있습니다. 운영 DB에 바로 쓰기 때문입니다. ` +
      "drizzle/ 아래 SQL 마이그레이션을 검토한 뒤 수동으로 적용하세요 (drizzle/README.md 참고). generate는 사용할 수 있습니다.",
  );
}

dotenv.config({ path: ".env.local" });

export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.SUPABASE_DB_URL!,
  },
});
