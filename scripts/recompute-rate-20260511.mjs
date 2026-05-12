// One-shot: re-fetch Korea Exim rate for 2026-05-11 (data corrected by bank
// at ~09:20 KST 2026-05-12) and repair any non-KRW expenses whose stored
// exchangeRate/amount were derived from the bad data.
//
// Run dry-run:  node scripts/recompute-rate-20260511.mjs
// Apply fixes:  node scripts/recompute-rate-20260511.mjs --apply
//
// Reads env from .env.local. Requires SUPABASE_DB_URL and KOREAEXIM_API_KEY.

import https from "node:https";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const TARGET_DATE = "2026-05-11";          // affected transaction date
const TARGET_DATE_COMPACT = "20260511";    // YYYYMMDD for koreaexim
const APPLY = process.argv.includes("--apply");

// Load .env.local
try {
  const envPath = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
} catch (e) {
  console.error("[env] failed to read .env.local:", e.message);
}

const DB_URL = (process.env.SUPABASE_DB_URL ?? "").trim();
const API_KEY = (process.env.KOREAEXIM_API_KEY ?? "").trim();

if (!DB_URL) { console.error("SUPABASE_DB_URL not set"); process.exit(1); }
if (!API_KEY) { console.error("KOREAEXIM_API_KEY not set"); process.exit(1); }

// --- Korea Exim fetch (mirrors src/services/exchange-rate.service.ts) ---
function httpsGet(url, headers = {}, followRedirect = false) {
  return new Promise((resolveP, rejectP) => {
    const req = https.get(url, { headers }, (res) => {
      if (!followRedirect && res.statusCode >= 300 && res.statusCode < 400) {
        resolveP({ statusCode: res.statusCode, headers: res.headers, body: "" });
        res.resume();
        return;
      }
      if (followRedirect && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith("http")
          ? res.headers.location
          : `https://www.koreaexim.go.kr${res.headers.location}`;
        res.resume();
        httpsGet(redirectUrl, headers, false).then(resolveP).catch(rejectP);
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolveP({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", rejectP);
    req.setTimeout(15000, () => req.destroy(new Error("timeout")));
  });
}

async function fetchKoreaEximForDate(dateStr) {
  const url = `https://www.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${encodeURIComponent(API_KEY)}&searchdate=${dateStr}&data=AP01`;
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; ExpenseOne/1.0)", Accept: "application/json,text/plain,*/*" };
  const tryParse = (text) => {
    const t = text.trim();
    if (t.startsWith("[")) { try { return JSON.parse(t); } catch { return null; } }
    return null;
  };
  const res1 = await httpsGet(url, headers, false);
  if (res1.statusCode === 200) {
    const p = tryParse(res1.body);
    if (p) return p;
  }
  const setCookie = Array.isArray(res1.headers["set-cookie"]) ? res1.headers["set-cookie"][0] : res1.headers["set-cookie"];
  if (!setCookie) {
    const fb = await httpsGet(url, headers, true);
    return tryParse(fb.body);
  }
  const cookie = setCookie.split(";")[0];
  const res2 = await httpsGet(url, { ...headers, Cookie: cookie }, false);
  if (res2.statusCode === 200) return tryParse(res2.body);
  const res3 = await httpsGet(url, { ...headers, Cookie: cookie }, true);
  return tryParse(res3.body);
}

async function getCorrectedRate(currency) {
  const data = await fetchKoreaEximForDate(TARGET_DATE_COMPACT);
  if (!data || data.length === 0) {
    console.error(`[api] no data returned for ${TARGET_DATE_COMPACT}`);
    return null;
  }
  const entry = data.find((row) => row.cur_unit === currency);
  if (!entry) return null;
  const rate = parseFloat(entry.deal_bas_r.replace(/,/g, ""));
  if (isNaN(rate) || rate <= 0) return null;
  return rate;
}

// --- main ---
const sql = postgres(DB_URL, { prepare: false, max: 2, ssl: "prefer", idle_timeout: 5 });

try {
  console.log(`[recompute] target transactionDate = ${TARGET_DATE}, apply = ${APPLY}`);

  const rows = await sql`
    SELECT id, title, currency, amount, amount_original, exchange_rate, transaction_date, created_at
    FROM expenseone.expenses
    WHERE transaction_date = ${TARGET_DATE}
      AND currency <> 'KRW'
      AND amount_original IS NOT NULL
      AND exchange_rate IS NOT NULL
    ORDER BY created_at ASC
  `;

  if (rows.length === 0) {
    console.log("[recompute] no non-KRW expenses with transaction_date = 2026-05-11 found. nothing to do.");
    await sql.end();
    process.exit(0);
  }

  console.log(`[recompute] found ${rows.length} candidate expense(s)`);

  const rateCache = new Map();
  let changedCount = 0;

  for (const row of rows) {
    const cur = row.currency;
    if (!rateCache.has(cur)) {
      const r = await getCorrectedRate(cur);
      if (r === null) {
        console.error(`[recompute] could not fetch corrected rate for ${cur}; skipping`);
        rateCache.set(cur, null);
      } else {
        rateCache.set(cur, r);
        console.log(`[recompute] corrected ${cur} rate for ${TARGET_DATE}: ${r}`);
      }
    }
    const newRate = rateCache.get(cur);
    if (newRate === null) continue;

    const oldRate = Number(row.exchange_rate);
    const newAmountKRW = Math.round((Number(row.amount_original) / 100) * newRate);
    const oldAmountKRW = Number(row.amount);

    const rateDelta = Math.abs(newRate - oldRate);
    const amountDelta = newAmountKRW - oldAmountKRW;

    if (rateDelta < 0.005 && amountDelta === 0) {
      console.log(`  · ${row.id} ${cur} ${row.amount_original/100} | rate ${oldRate} == ${newRate} | KRW ${oldAmountKRW} (unchanged)`);
      continue;
    }

    changedCount++;
    console.log(`  ! ${row.id} "${row.title}" ${cur} ${(row.amount_original/100).toFixed(2)}`);
    console.log(`       rate  ${oldRate}  →  ${newRate}`);
    console.log(`       KRW   ${oldAmountKRW.toLocaleString()}  →  ${newAmountKRW.toLocaleString()}  (${amountDelta >= 0 ? "+" : ""}${amountDelta.toLocaleString()})`);

    if (APPLY) {
      await sql`
        UPDATE expenseone.expenses
        SET amount = ${newAmountKRW},
            exchange_rate = ${newRate},
            updated_at = NOW()
        WHERE id = ${row.id}
      `;
    }
  }

  console.log(`\n[recompute] ${changedCount} expense(s) ${APPLY ? "updated" : "would change (dry-run; pass --apply to write)"}`);
} catch (err) {
  console.error("[recompute] error:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
