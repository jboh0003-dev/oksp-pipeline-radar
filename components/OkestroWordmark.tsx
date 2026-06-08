"use client";

import { useState } from "react";

/**
 * 헤더 좌측에 들어가는 OKESTRO 워드마크.
 *
 * - 1순위: `public/okestro-logo.svg` 또는 `public/okestro-logo.png` 의 실제 회사 로고.
 *   파일이 존재하면 이걸 그대로 보여주고, 배경 박스 없이 헤더 위에 자연스럽게 올라간다.
 *   (배경 투명 PNG/SVG 권장. 이미지 자체가 투명 배경이면 별도 처리가 필요 없다.)
 *
 * - 2순위(fallback): 로고 파일이 아직 없거나 404 일 때를 대비한 텍스트 워드마크.
 *   파란색 박스 + O 글자 + OKESTRO 라는 기존 디자인을 유지하되, 어두운 헤더 배경 위에서
 *   가독성이 좋도록 색을 손봤다.
 *
 * 컴포넌트는 client component 로 두어 <img onError> 로 fallback 전환을 처리한다.
 */
export default function OkestroWordmark() {
  // 우선 SVG 시도 → 실패하면 PNG 시도 → 그래도 실패하면 텍스트 워드마크.
  const [stage, setStage] = useState<"svg" | "png" | "fallback">("svg");

  if (stage !== "fallback") {
    const src = stage === "svg" ? "/okestro-logo.svg" : "/okestro-logo.png";
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt="OKESTRO"
        className="h-9 w-auto select-none object-contain drop-shadow-sm sm:h-10"
        draggable={false}
        onError={() => setStage(stage === "svg" ? "png" : "fallback")}
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
