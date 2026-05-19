type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative">
      <label htmlFor="notice-search" className="sr-only">
        공고 검색
      </label>
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8B95A1]">
        <SearchIcon />
      </span>
      <input
        id="notice-search"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="공고명, 기관명, 키워드로 검색"
        className="w-full rounded-2xl border border-[#E5E8EB] bg-white py-3.5 pl-11 pr-4 text-[15px] text-[#191F28] shadow-sm outline-none transition placeholder:text-[#ADB5BD] focus:border-[#3182F6] focus:ring-2 focus:ring-[#3182F6]/20"
      />
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  );
}
