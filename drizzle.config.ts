import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// 안전장치: 운영 DB(ERP와 같은 Postgres를 공유)에 바로 쓰는 drizzle-kit 명령을 막는다.
// push·migrate는 스키마를 직접 바꾸고, studio는 브라우저에서 행을 고치고 지울 수 있는
// UI를 같은 DB에 열어 준다 — 셋 다 "실수로 운영 DB에 쓰기"의 경로다.
// 이 프로젝트의 마이그레이션은 drizzle/*.sql을 사람이 검토해 수동 적용한다(drizzle/README.md).
// .env.local을 읽기 **전에** 막아서, 실수로 실행해도 DB 주소를 읽거나 연결하지 않는다.
// generate·check 등 DB에 붙지 않는 명령은 그대로 쓸 수 있다.
const BLOCKED_COMMANDS = ["push", "migrate", "studio"];
// 명령 자리(첫 비플래그 토큰)만 본다. 값으로 들어온 단어까지 보면
// `drizzle-kit generate --name push`처럼 멀쩡한 명령이 엉뚱하게 막힌다.
const command = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
const blockedCommand = command && BLOCKED_COMMANDS.includes(command) ? command : undefined;
if (blockedCommand) {
  throw new Error(
    `drizzle-kit ${blockedCommand}는 이 프로젝트에서 막혀 있습니다. 운영 DB에 바로 쓰기 때문입니다. ` +
      "drizzle/ 아래 SQL 마이그레이션을 검토한 뒤 수동으로 적용하세요 (drizzle/README.md 참고). " +
      "조회만 하려면 psql로 `BEGIN READ ONLY;`를 쓰세요. generate는 그대로 사용할 수 있습니다.",
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
