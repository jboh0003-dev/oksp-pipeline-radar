"use client";

import { useState } from "react";

/**
 * 헤더 좌측에 들어가는 OKESTRO 워드마크.
 *
 * - 1순위: `public/assets/okestro-logo.png` (회사 공식 로고. 권장 위치).
 * - 2순위: `public/assets/okestro-logo.svg` (벡터판이 있으면 사용).
 * - 3순위: 구버전 호환 — `public/okestro-logo.svg` / `public/okestro-logo.png`.
 * - 마지막 fallback: 텍스트 워드마크 (이미지가 하나도 없을 때).
 *
 * 모두 onError 단계로 자동 전환되므로 사용자는 자산 파일만 교체하면 별도 코드 변경 없이 반영된다.
 *
 * 컴포넌트는 client component 로 두어 <img onError> 로 fallback 전환을 처리한다.
 * 다크 배경(헤더) 위에 자연스럽게 올라가도록 height 36~40px(h-9 sm:h-10) + object-contain.
 */
export default function OkestroWordmark() {
  type Stage = "asset-png" | "asset-svg" | "legacy-svg" | "legacy-png" | "fallback";
  const [stage, setStage] = useState<Stage>("asset-png");

  if (stage !== "fallback") {
    const src =
      stage === "asset-png"
        ? "/assets/okestro-logo.png"
        : stage === "asset-svg"
          ? "/assets/okestro-logo.svg"
          : stage === "legacy-svg"
            ? "/okestro-logo.svg"
            : "/okestro-logo.png";

    const next: Stage =
      stage === "asset-png"
        ? "asset-svg"
        : stage === "asset-svg"
          ? "legacy-svg"
          : stage === "legacy-svg"
            ? "legacy-png"
            : "fallback";

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt="OKESTRO"
        className="h-9 w-auto select-none object-contain drop-shadow-sm sm:h-10"
        draggable={false}
        onError={() => setStage(next)}
      />
    );
  }

  return <FallbackWordmark />;
}

/**
 * 회사 로고 파일이 없을 때 노출되는 텍스트 워드마크.
 * 헤더 배경(어두운 파란 그라데이션) 위에 흰 글씨로 자연스럽게 올라간다.
 */
function FallbackWordmark() {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 shadow-sm ring-1 ring-inset ring-white/30 backdrop-blur-sm"
      >
        <span className="text-sm font-black tracking-tight text-white">O</span>
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-cyan-300 ring-2 ring-blue-900/50"
        />
      </span>
      <span className="text-base font-extrabold tracking-tight text-white drop-shadow sm:text-lg">
        OKESTRO
      </span>
    </div>
  );
}
