import { PRODUCT_FILTERS, type ProductFilter } from "@/data/sampleNotices";

type ProductFilterProps = {
  selected: ProductFilter;
  onChange: (product: ProductFilter) => void;
};

/**
 * 검색/필터 영역 압축을 위해 라벨("제품 필터") 을 제거하고 칩만 가로로 배치.
 * 부모(page.tsx)에서 같은 줄 또는 다음 줄에 함께 나열한다.
 */
export default function ProductFilter({ selected, onChange }: ProductFilterProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="tablist"
      aria-label="제품 필터"
    >
      {PRODUCT_FILTERS.map((product) => {
        const isActive = selected === product;
        return (
          <button
            key={product}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(product)}
            className={`h-9 rounded-full px-3.5 text-xs font-semibold transition active:scale-[0.98] sm:text-sm ${
              isActive
                ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                : "bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-800"
            }`}
          >
            {product}
          </button>
        );
      })}
    </div>
  );
}
