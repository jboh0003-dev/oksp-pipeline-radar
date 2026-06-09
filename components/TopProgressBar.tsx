"use client";

import { useEffect, useState } from "react";
import { getEstimatedLoadMs, recordLoadCompleteMs } from "@/lib/loadProgress";

type TopProgressBarProps = {
  /**
   * 로딩이 끝났음을 알릴 때 사용할 라벨/문구.
   * - undefined : 진행 중 (기본 문구).
   * - 그 외     : 완료 단계로 진입(100% 채우고 잠시 후 unmount 됨).
   */
  label?: string;
};

/**
 * 진행률을 보여주는 상단 로딩 바.
 *
 * 동작:
 *  - 마운트되면 100ms 간격으로 elapsed 를 누적하고, 0~85% 까지 시간 기반으로 채워간다.
 *  - estimated 는 localStorage 의 마지막 로딩 완료 시간(클램프 20s~120s, 기본 45s)을 사용.
 *  - 부모가 데이터를 다 받으면 이 컴포넌트를 unmount 한다.
 *    이때 useEffect cleanup 이 elapsed 값을 다음 진입을 위해 localStorage 에 저장.
 *  - 시각적 "100% 채우기 → 사라짐" 은 sliderPct 만 시간 기반으로 자연스럽게 채우다가
 *    unmount 되도록 했다 (별도 fade out 단계 없이도 자연스러움).
 *
 * 디자인:
 *  - 다크톤에 어울리는 blue → cyan 그라데이션.
 *  - 너무 화려하지 않게, 막대 채움 부분만 transition.
 *  - 라벨은 진행률 옆에 한 줄로: "공고 조회 및 매칭 분석 중... · 예상 45초 · 경과 12초".
 */
export default function TopProgressBar({ label }: TopProgressBarProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [estimatedMs, setEstimatedMs] = useState<number | null>(null);
  const startedAt = useStartTime();

  // estimated 는 마운트 후 한 번만 읽는다 (SSR 안전).
  useEffect(() => {
    setEstimatedMs(getEstimatedLoadMs());
  }, []);

  // 100ms 간격으로 elapsed 갱신.
  useEffect(() => {
    const tick = () => setElapsedMs(Date.now() - startedAt);
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [startedAt]);

  // unmount 시점(=로딩 완료) 에 다음 로딩을 위해 elapsed 저장.
  useEffect(() => {
    return () => {
      const finalElapsed = Date.now() - startedAt;
      // 너무 짧은(< 1s) 마운트는 하이드레이션 케이스로 보고 무시.
      if (finalElapsed >= 1000) {
        recordLoadCompleteMs(finalElapsed);
      }
    };
  }, [startedAt]);

  // 진행률 (0~100). 시간 기반으로 0~85%, "완료" 라벨이 들어오면 즉시 100% 로.
  const isCompleting = label != null && label.length > 0;
  const ratio = estimatedMs ? Math.min(0.85, elapsedMs / estimatedMs) : 0.1;
  const pct = isCompleting ? 100 : Math.round(ratio * 85);

  const elapsedSec = Math.max(0, Math.round(elapsedMs / 1000));
  const estimatedSec = estimatedMs ? Math.round(estimatedMs / 1000) : null;

  const message =
    label ??
    (elapsedMs < 8_000
      ? "나라장터 공고를 수집 중입니다"
      : "공고 조회 및 매칭 분석 중...");

  return (
    <div
      className="mb-3"
      role="progressbar"
      aria-busy="true"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="대시보드 데이터를 불러오는 중"
    >
      <div className="csg2b-progress-track">
        <div
          className="csg2b-progress-bar-determinate"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="font-medium text-slate-600 dark:text-slate-300">
          {message}
        </span>
        <span className="tabular-nums">
          {estimatedSec != null && (
            <>
              예상 <strong className="font-semibold text-slate-700 dark:text-slate-200">{estimatedSec}초</strong>
              <span aria-hidden className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
            </>
          )}
          경과 <strong className="font-semibold text-blue-600 dark:text-blue-300">{elapsedSec}초</strong>
        </span>
      </p>
    </div>
  );
}

/**
 * 첫 마운트 시점을 한 번만 잡아 고정. effect 가 다시 트리거 돼도 startedAt 은 변하지 않는다.
 */
function useStartTime() {
  const [startedAt] = useState(() => Date.now());
  return startedAt;
}
