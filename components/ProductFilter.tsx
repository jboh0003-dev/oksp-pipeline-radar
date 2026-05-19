import { PRODUCT_FILTERS, type ProductFilter } from "@/data/sampleNotices";

type ProductFilterProps = {
  selected: ProductFilter;
  onChange: (product: ProductFilter) => void;
};

export default function ProductFilter({ selected, onChange }: ProductFilterProps) {
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-[#4E5968]">제품 필터</p>
      <div
        className="flex flex-wrap gap-2"
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
              className={`rounded-full px-3.5 py-2 text-sm font-medium transition active:scale-[0.98] sm:px-4 sm:py-2.5 ${
                isActive
                  ? "bg-[#3182F6] text-white shadow-sm"
                  : "bg-[#F2F4F6] text-[#4E5968] ring-1 ring-[#E5E8EB] hover:bg-[#E5E8EB]"
              }`}
            >
              {product}
            </button>
          );
        })}
      </div>
    </div>
  );
}
