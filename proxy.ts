import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js 16 proxy guard.
 *
 * /api/collect-g2b-keywords 는 service-role 로 DB upsert 를 수행하는 내부 수집 엔진이다.
 * 화면의 수동 수집과 Vercel cron 은 이 route 의 runCollect 함수를 서버 내부에서 직접
 * 호출하므로 외부 HTTP GET 을 공개할 이유가 없다.
 *
 * CRON_SECRET 을 가진 운영 호출만 허용해 무단 반복 실행/외부 API 과부하를 막는다.
 */
export function proxy(request: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "collector guard is not configured" },
      { status: 503 },
    );
  }

  const bearer = request.headers.get("authorization") ?? "";
  const headerSecret = request.headers.get("x-cron-secret")?.trim() ?? "";
  const authorized = bearer === `Bearer ${expected}` || headerSecret === expected;

  if (!authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/collect-g2b-keywords"],
};
