"use client";

import { useMemo, useState } from "react";

type VerifiedWin = {
  id: string;
  competitor: "이노그리드" | "에이블클라우드";
  year: number;
  month: number;
  project: string;
  customer: string;
  amountWon: number | null;
  amountLabel: string;
  role: string;
  evidence: string;
  sourceLabel: string;
  sourceUrl: string;
};

const VERIFIED_WINS: VerifiedWin[] = [
  {
    id: "innogrid-2026-nia-dr",
    competitor: "이노그리드",
    year: 2026,
    month: 6,
    project: "2026년 공공 재해복구시스템(DR) 구축 ISP 사업(5차)",
    customer: "한국지능정보사회진흥원(NIA)",
    amountWon: null,
    amountLabel: "비공개",
    role: "사업 수주",
    evidence: "이노그리드 공식 연혁에 ‘수주’로 명시",
    sourceLabel: "이노그리드 공식 연혁",
    sourceUrl: "https://www.innogrid.com/innogrid/history",
  },
  {
    id: "innogrid-2026-ebs",
    competitor: "이노그리드",
    year: 2026,
    month: 6,
    project: "EBS ‘AI 펭톡’ 클라우드 인프라 운영 사업",
    customer: "한국교육방송공사(EBS)",
    amountWon: null,
    amountLabel: "비공개",
    role: "사업 수주",
    evidence: "이노그리드 공식 연혁에 ‘수주’로 명시",
    sourceLabel: "이노그리드 공식 연혁",
    sourceUrl: "https://www.innogrid.com/innogrid/history",
  },
  {
    id: "innogrid-2026-chungbuk",
    competitor: "이노그리드",
    year: 2026,
    month: 4,
    project: "클라우드 기반 정보자원 통합환경 구축 사업",
    customer: "충청북도청",
    amountWon: null,
    amountLabel: "비공개",
    role: "사업 수주",
    evidence: "이노그리드 공식 연혁에 ‘수주’로 명시",
    sourceLabel: "이노그리드 공식 연혁",
    sourceUrl: "https://www.innogrid.com/innogrid/history",
  },
  {
    id: "innogrid-2025-k-sure-isp",
    competitor: "이노그리드",
    year: 2025,
    month: 9,
    project: "클라우드 전환 전략 수립 ISP 사업",
    customer: "한국무역보험공사",
    amountWon: null,
    amountLabel: "비공개",
    role: "사업 수주",
    evidence: "이노그리드 공식 연혁에 ‘수주’로 명시",
    sourceLabel: "이노그리드 공식 연혁",
    sourceUrl: "https://www.innogrid.com/innogrid/history",
  },
  {
    id: "innogrid-2025-ai-dc-billing",
    competitor: "이노그리드",
    year: 2025,
    month: 8,
    project: "인공지능 데이터센터 서비스 빌링시스템 구축 사업",
    customer: "인공지능산업융합사업단",
    amountWon: null,
    amountLabel: "비공개",
    role: "사업 수주",
    evidence: "이노그리드 공식 연혁에 ‘수주’로 명시",
    sourceLabel: "이노그리드 공식 연혁",
    sourceUrl: "https://www.innogrid.com/innogrid/history",
  },
  {
    id: "innogrid-2025-hira-ismp",
    competitor: "이노그리드",
    year: 2025,
    month: 8,
    project: "HIRA 빅데이터개방시스템 고도화를 위한 ISMP 컨설팅 사업",
    customer: "건강보험심사평가원",
    amountWon: null,
    amountLabel: "비공개",
    role: "사업 수주",
    evidence: "이노그리드 공식 연혁에 ‘수주’로 명시",
    sourceLabel: "이노그리드 공식 연혁",
    sourceUrl: "https://www.innogrid.com/innogrid/history",
  },
  {
    id: "innogrid-2025-gadeok",
    competitor: "이노그리드",
    year: 2025,
    month: 4,
    project: "업무시스템 민간 클라우드 임차 및 운영",
    customer: "가덕도신공항건설공단",
    amountWon: null,
    amountLabel: "비공개",
    role: "단독 수주",
    evidence: "회사 발표와 복수 언론에서 단독 수주를 확인",
    sourceLabel: "이노그리드 공식 연혁",
    sourceUrl: "https://www.innogrid.com/innogrid/history",
  },
  {
    id: "innogrid-2024-k-sure-infra",
    competitor: "이노그리드",
    year: 2024,
    month: 11,
    project: "클라우드 IT 인프라 장비 증설 및 교체 사업",
    customer: "한국무역보험공사",
    amountWon: null,
    amountLabel: "비공개",
    role: "주관사업자 수주",
    evidence: "이노그리드 공식 연혁에 주관사업자 수주로 명시",
    sourceLabel: "이노그리드 공식 연혁",
    sourceUrl: "https://www.innogrid.com/innogrid/history",
  },
  {
    id: "innogrid-2024-airports-chatbot",
    competitor: "이노그리드",
    year: 2024,
    month: 9,
    project: "공항공사 챗봇 클라우드 전환 사업",
    customer: "한국공항공사",
    amountWon: null,
    amountLabel: "비공개",
    role: "주관사업자 수주",
    evidence: "이노그리드 공식 연혁에 주관사업자 수주로 명시",
    sourceLabel: "이노그리드 공식 연혁",
    sourceUrl: "https://www.innogrid.com/innogrid/history",
  },
  {
    id: "innogrid-2024-komsco",
    competitor: "이노그리드",
    year: 2024,
    month: 3,
    project: "차세대 지급결제 플랫폼 인프라 구축 사업",
    customer: "한국조폐공사",
    amountWon: 4_100_000_000,
    amountLabel: "사업비 41억원",
    role: "주관사업자 수주",
    evidence: "이노그리드 공식 연혁에 사업비 41억원·주관사업자로 명시",
    sourceLabel: "이노그리드 공식 연혁",
    sourceUrl: "https://www.innogrid.com/innogrid/history",
  },
  {
    id: "innogrid-2023-mois-cloud",
    competitor: "이노그리드",
    year: 2023,
    month: 11,
    project: "2023년도 클라우드 컴퓨팅서비스 활용모델 공모 사업",
    customer: "행정안전부",
    amountWon: 3_000_000_000,
    amountLabel: "30억원",
    role: "주관사 수주",
    evidence: "이노그리드 공식 연혁에 30억원·주관사 수주로 명시",
    sourceLabel: "이노그리드 공식 연혁",
    sourceUrl: "https://www.innogrid.com/innogrid/history",
  },
  {
    id: "innogrid-2023-gyeongbuk",
    competitor: "이노그리드",
    year: 2023,
    month: 9,
    project: "18개 공공기관 클라우드 운영관리 및 지원 사업",
    customer: "경상북도 공공기관",
    amountWon: 6_500_000_000,
    amountLabel: "사업비 65억원",
    role: "주관사업자 수주",
    evidence: "이노그리드 공식 연혁에 사업비 65억원·주관사업자로 명시",
    sourceLabel: "이노그리드 공식 연혁",
    sourceUrl: "https://www.innogrid.com/innogrid/history",
  },
  {
    id: "ablecloud-2025-gyeonggi-genai",
    competitor: "에이블클라우드",
    year: 2025,
    month: 8,
    project: "경기도 생성형 AI 플랫폼 구축사업 핵심 인프라",
    customer: "경기도",
    amountWon: null,
    amountLabel: "총사업비 131억원 / 자사분 비공개",
    role: "HCI 파트너·핵심 인프라 공급",
    evidence: "에이블클라우드 공식 보도자료에서 ‘핵심 인프라 수주’ 및 컨소시엄 HCI 파트너 참여를 명시",
    sourceLabel: "에이블클라우드 공식 보도자료",
    sourceUrl: "https://www.ablecloud.io/resource/blog/29",
  },
];

const YEAR_OPTIONS = ["전체", "2026", "2025", "2024", "2023"] as const;
const COMPETITOR_OPTIONS = ["전체", "이노그리드", "에이블클라우드"] as const;

function formatWon(value: number): string {
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억원`;
  }
  return `${value.toLocaleString("ko-KR")}원`;
}

export default function CompetitiveAnalysisPage() {
  const [year, setYear] = useState<(typeof YEAR_OPTIONS)[number]>("전체");
  const [competitor, setCompetitor] = useState<(typeof COMPETITOR_OPTIONS)[number]>("전체");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VERIFIED_WINS.filter((item) => {
      if (year !== "전체" && item.year !== Number(year)) return false;
      if (competitor !== "전체" && item.competitor !== competitor) return false;
      if (!q) return true;
      return [item.project, item.customer, item.competitor, item.role, item.evidence]
        .join(" ")
        .toLowerCase()
        .includes(q);
    }).sort((a, b) => b.year - a.year || b.month - a.month);
  }, [year, competitor, query]);

  const summary = useMemo(() => {
    const knownAmounts = filtered.filter((item) => item.amountWon != null);
    const knownAmountTotal = knownAmounts.reduce((sum, item) => sum + (item.amountWon ?? 0), 0);
    return {
      count: filtered.length,
      companies: new Set(filtered.map((item) => item.competitor)).size,
      knownAmountCount: knownAmounts.length,
      knownAmountTotal,
    };
  }, [filtered]);

  const companySummary = useMemo(() => {
    return (COMPETITOR_OPTIONS.filter((name) => name !== "전체") as Array<"이노그리드" | "에이블클라우드">).map(
      (name) => {
        const wins = filtered.filter((item) => item.competitor === name);
        const knownAmount = wins.reduce((sum, item) => sum + (item.amountWon ?? 0), 0);
        return { name, count: wins.length, knownAmount };
      },
    );
  }, [filtered]);

  return (
    <div className="min-h-full">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 sm:py-7">
        <header className="relative mb-4 overflow-hidden rounded-2xl ring-1 ring-white/15 shadow-md csg2b-header-bg dark:ring-white/10">
          <div className="relative flex min-h-[160px] flex-col justify-center px-5 py-7 sm:min-h-[190px] sm:px-7 sm:py-9">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/90">OKESTRO CS-G2B</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-white drop-shadow-sm sm:text-2xl">수주·경쟁분석</h1>
            <p className="mt-1 max-w-3xl text-xs text-slate-200/85 sm:text-sm">
              추정 키워드 매칭은 전부 제외하고, 회사 공식 자료에서 실제 수주·공급 사실이 확인되는 실적만 표시합니다.
            </p>
          </div>
        </header>

        <section className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <SummaryCard label="확인 수주 실적" value={`${summary.count}건`} note="공식 출처 확인 기준" />
          <SummaryCard label="확인 경쟁사" value={`${summary.companies}개사`} note="제품명은 회사와 분리" />
          <SummaryCard label="금액 공개 실적" value={`${summary.knownAmountCount}건`} note="출처에 금액이 명시된 건" />
          <SummaryCard label="공개 금액 합계" value={summary.knownAmountTotal ? formatWon(summary.knownAmountTotal) : "-"} note="자사분 비공개 금액 제외" />
        </section>

        <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 shadow-sm dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-100 sm:text-sm">
          <strong>정리 기준:</strong> ‘에이블스택(ABLESTACK)’은 경쟁사명이 아니라 에이블클라우드의 제품명이므로 별도 회사로 집계하지 않습니다. 팝콘사는 공식 회사 소개 기준 AUTOSAR·자동차 SW 기업으로 확인되어 현재 클라우드/HCI 경쟁 수주 집계에서 제외했습니다.
        </section>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">연도</span>
              <select value={year} onChange={(e) => setYear(e.target.value as (typeof YEAR_OPTIONS)[number])} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
                {YEAR_OPTIONS.map((value) => <option key={value} value={value}>{value === "전체" ? value : `${value}년`}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">경쟁사</span>
              <select value={competitor} onChange={(e) => setCompetitor(e.target.value as (typeof COMPETITOR_OPTIONS)[number])} className="h-9 min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
                {COMPETITOR_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>

            <label className="flex flex-1 flex-col gap-1 md:max-w-xl">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">검색</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="사업명·기관명 검색" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100" />
            </label>

            <button type="button" onClick={() => { setYear("전체"); setCompetitor("전체"); setQuery(""); }} className="h-9 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">초기화</button>
          </div>
        </section>

        <section className="mb-5 grid gap-3 md:grid-cols-2">
          {companySummary.map((item) => (
            <div key={item.name} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
              <p className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</p>
              <div className="mt-2 flex items-baseline gap-4">
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-300">{item.count}건</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">공개 금액 {item.knownAmount ? formatWon(item.knownAmount) : "-"}</span>
              </div>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">확인된 수주 실적</h2>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">키워드 추정, 시장 후보, 미확인 공고는 포함하지 않습니다.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="whitespace-nowrap px-4 py-3">연월</th>
                  <th className="whitespace-nowrap px-4 py-3">경쟁사</th>
                  <th className="min-w-[360px] px-4 py-3">사업명</th>
                  <th className="whitespace-nowrap px-4 py-3">발주/고객기관</th>
                  <th className="whitespace-nowrap px-4 py-3">역할</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">금액</th>
                  <th className="min-w-[320px] px-4 py-3">확인 근거</th>
                  <th className="whitespace-nowrap px-4 py-3">원문</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-b-0 dark:border-white/5">
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">{item.year}.{String(item.month).padStart(2, "0")}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-100">{item.competitor}</td>
                    <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-slate-100">{item.project}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">{item.customer}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">{item.role}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{item.amountLabel}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{item.evidence}</td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:underline dark:text-blue-300">{item.sourceLabel}</a>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">조건에 맞는 확인 수주 실적이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-xs leading-6 text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300">
          <p className="font-semibold text-slate-800 dark:text-slate-100">검증 원칙</p>
          <p>① 회사 공식 연혁·공식 보도자료에서 ‘수주’, ‘단독 수주’, ‘주관사업자’, ‘핵심 인프라 수주’처럼 수행 사실이 명시된 건만 포함합니다.</p>
          <p>② 총사업비와 해당 업체의 실제 계약금액이 다른 경우 업체 금액으로 합산하지 않습니다. 금액이 명확히 공개된 건만 공개 금액 합계에 포함합니다.</p>
          <p>③ 단순 키워드(CMP, HCI, 클라우드 등)만 일치하는 공고는 경쟁사 실적으로 보지 않습니다.</p>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900/70 sm:px-4 sm:py-3.5">
      <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:text-xs">{label}</p>
      <p className="mt-0.5 text-xl font-bold leading-none tabular-nums text-blue-600 dark:text-blue-300 sm:text-2xl">{value}</p>
      <p className="mt-1 truncate text-[10px] text-slate-400 dark:text-slate-500">{note}</p>
    </div>
  );
}
