import { PRODUCT_FILTERS, type ProductFilter } from "@/data/sampleNotices";

type ProductFilterProps = {
  selected: ProductFilter;
  onChange: (product: ProductFilter) => void;
};

export default function ProductFilter({ selected, onChange }: ProductFilterProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#4E5968]">제품 필터</p>
        <p className="shrink-0 text-xs text-[#8B95A1]">좌우로 스크롤</p>
      </div>
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-white to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white to-transparent"
          aria-hidden
        />
        <div
          className="filter-scroll -mx-1 flex gap-2.5 overflow-x-auto overscroll-x-contain px-1 py-2 pr-8 scroll-smooth snap-x snap-mandatory touch-pan-x [-webkit-overflow-scrolling:touch]"
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
                className={`shrink-0 snap-start whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] ${
                  isActive
                    ? "bg-[#3182F6] text-white shadow-sm"
                    : "bg-white text-[#4E5968] ring-1 ring-[#E5E8EB] hover:bg-[#F9FAFB]"
                }`}
              >
                {product}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
