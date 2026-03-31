import { NextResponse } from "next/server";
import { getAuthUser, getCachedCurrentUser } from "@/lib/supabase/cached";

export async function POST() {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getCachedCurrentUser();
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;

  const debug: Record<string, unknown> = {
    hasToken: !!token,
    tokenPrefix: token ? token.slice(0, 10) + "..." : null,
    channel,
  };

  if (!token || !channel) {
    return NextResponse.json({
      ok: false,
      message: "SLACK_BOT_TOKEN 또는 SLACK_CHANNEL_ID 미설정",
      debug,
    });
  }

  // Test 1: auth.test to verify token
  try {
    const authRes = await fetch("https://slack.com/api/auth.test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const authData = await authRes.json();
    debug.authTest = authData;

    if (!authData.ok) {
      return NextResponse.json({
        ok: false,
        message: `Slack 인증 실패: ${authData.error}`,
        debug,
      });
    }
  } catch (err) {
    debug.authError = String(err);
    return NextResponse.json({
      ok: false,
      message: "Slack auth.test 요청 실패",
      debug,
    });
  }

  // Test 2: Send a test message
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        text: "🧪 ExpenseOne Slack 연동 테스트 메시지입니다.",
        username: "ExpenseOne",
        icon_emoji: ":money_with_wings:",
      }),
    });
    const data = await res.json();
    debug.postMessage = data;

    if (!data.ok) {
      return NextResponse.json({
        ok: false,
        message: `메시지 전송 실패: ${data.error}`,
        debug,
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Slack 테스트 메시지 전송 성공!",
      debug,
    });
  } catch (err) {
    debug.postError = String(err);
    return NextResponse.json({
      ok: false,
      message: "chat.postMessage 요청 실패",
      debug,
    });
  }
}
