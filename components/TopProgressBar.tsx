/**
 * 페이지 상단에 잠깐 보여주는 얇은 진행바.
 *
 * - 첫 진입에서 데이터를 가져오는 동안만 노출되는 indeterminate 진행바.
 * - 화려한 애니메이션은 피하고, blue→cyan 그라데이션 막대가 좌→우로 흐른다.
 * - DashboardLoading 안 또는 page.tsx 의 로딩 영역 상단에 배치한다.
 *
 * 색/애니메이션은 globals.css 의 `.csg2b-progress-track` / `.csg2b-progress-bar` 에 정의.
 */
export default function TopProgressBar() {
  return (
    <div
      className="mb-3"
      role="progressbar"
      aria-busy="true"
      aria-label="대시보드 데이터를 불러오는 중"
    >
      <div className="csg2b-progress-track">
        <div className="csg2b-progress-bar" />
      </div>
    </div>
  );
}
