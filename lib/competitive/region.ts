export type BroadRegion = "수도권" | "중부" | "호남" | "영남" | "지역 미확인";

/** 고객사 마스터의 세부 지역 또는 기관명에 명시된 광역 지명을 기준으로만 분류한다. */
export function broadRegion(region: string | null | undefined, agency: string | null | undefined): BroadRegion {
  const place = String(region ?? "").trim();
  const name = String(agency ?? "").trim();
  const classify = (value: string): BroadRegion | null => {
    if (/서울|경기|인천|수도권/.test(value)) return "수도권";
    if (/대전|세종|충북|충남|충청|강원|중부/.test(value)) return "중부";
    if (/광주|전북|전남|전라|호남|제주/.test(value)) return "호남";
    if (/부산|대구|울산|경북|경남|경상|영남/.test(value)) return "영남";
    return null;
  };
  // 전국 단위 기관명에 포함된 지명은 소재지를 의미하지 않을 수 있으므로,
  // 마스터 지역을 우선하고 기관명은 지역 기관 접두어에만 사용한다.
  return classify(place) ?? classify(name.match(/^(?:국립|한국)?(?:서울|경기|인천|대전|세종|충북|충남|충청|강원|광주|전북|전남|전라|제주|부산|대구|울산|경북|경남|경상)[^\s]*/)?.[0] ?? "") ?? "지역 미확인";
}
