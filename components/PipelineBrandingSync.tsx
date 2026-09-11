"use client";

import { useEffect } from "react";

const REPLACEMENTS: Array<[string, string]> = [
  ["OKESTRO CS-G2B", "Pipeline Maker"],
  ["나라장터 사전규격공고 대시보드", "나라장터 · 사전규격공고"],
  ["나라장터 공고 대시보드", "나라장터"],
  ["CS-G2B", "Pipeline Maker"],
];

function syncLegacyBranding(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const current = node.nodeValue;
    if (current) {
      let next = current;
      for (const [from, to] of REPLACEMENTS) {
        next = next.replaceAll(from, to);
      }
      if (next !== current) node.nodeValue = next;
    }
    node = walker.nextNode();
  }
}

/**
 * 일부 기존 서브페이지에 남아 있는 레거시 브랜딩을 Pipeline Maker 기준으로 통일한다.
 * 새 화면은 상수/공통 컴포넌트를 사용하고, 이 동기화 레이어는 기존 페이지 정리용으로만 유지한다.
 */
export default function PipelineBrandingSync() {
  useEffect(() => {
    syncLegacyBranding(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          syncLegacyBranding(mutation.target.parentNode ?? mutation.target);
          continue;
        }
        mutation.addedNodes.forEach((node) => syncLegacyBranding(node));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
