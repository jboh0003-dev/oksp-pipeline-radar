"use client";

import { useEffect, useState } from "react";

/**
 * 입력값(검색어 등)의 변경을 일정 시간 누적해 한 번만 반영하는 훅.
 *
 * - 사용자가 빠르게 타이핑하는 동안에는 filteredNotices 가 매번 재계산되지 않게 한다.
 * - delayMs 기본 250ms — 너무 짧으면 의미 없고, 너무 길면 검색이 굼떠 보인다.
 *
 * 빈 문자열 / 짧은 문자열은 곧장 반영해도 무방하므로 동일하게 debounce 한다.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
