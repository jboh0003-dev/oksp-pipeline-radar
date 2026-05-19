export default function DashboardLoading() {
  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-[#E5E8EB] bg-white"
          />
        ))}
      </div>
      <div className="mb-6 h-40 animate-pulse rounded-2xl border border-[#E5E8EB] bg-white" />
      <div className="space-y-5 sm:space-y-6">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-72 animate-pulse rounded-2xl border border-[#E5E8EB] bg-white"
          />
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-[#6B7684]">
        공고 데이터를 불러오는 중입니다...
      </p>
    </div>
  );
}
