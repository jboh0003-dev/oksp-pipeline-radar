"use client";

import { useMemo, useState } from "react";
import Header from "@/components/Header";
import NoticeCard from "@/components/NoticeCard";
import ProductFilter from "@/components/ProductFilter";
import SearchBar from "@/components/SearchBar";
import SummaryCards from "@/components/SummaryCards";
import {
  sampleNotices,
  type Notice,
  type ProductFilter as ProductFilterValue,
} from "@/data/sampleNotices";
import {
  countImminentDeadlines,
  getAverageFitScore,
} from "@/lib/noticeUtils";

function matchesSearch(notice: Notice, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    notice.title,
    notice.agency,
    ...notice.keywords,
    ...notice.relatedProducts,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

function matchesProduct(notice: Notice, product: ProductFilterValue) {
  if (product === "전체") return true;
  return notice.relatedProducts.includes(product);
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductFilterValue>("전체");
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const filteredNotices = useMemo(() => {
    return sampleNotices.filter(
      (notice) => matchesSearch(notice, searchQuery) && matchesProduct(notice, selectedProduct),
    );
  }, [searchQuery, selectedProduct]);

  const summary = useMemo(() => {
    const savedCount = sampleNotices.filter((notice) => savedIds.includes(notice.id)).length;
    return {
      totalCount: sampleNotices.length,
      savedCount,
      averageFitScore: getAverageFitScore(filteredNotices),
      imminentCount: countImminentDeadlines(sampleNotices),
    };
  }, [filteredNotices, savedIds]);

  const handleToggleSave = (id: string) => {
    setSavedIds((prev) =>
      prev.includes(id) ? prev.filter((savedId) => savedId !== id) : [...prev, id],
    );
  };

  return (
    <div className="min-h-full bg-[#F2F4F6]">
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <Header totalCount={sampleNotices.length} filteredCount={filteredNotices.length} />

        <SummaryCards
          totalCount={summary.totalCount}
          savedCount={summary.savedCount}
          averageFitScore={summary.averageFitScore}
          imminentCount={summary.imminentCount}
        />

        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <div className="mt-5">
            <ProductFilter selected={selectedProduct} onChange={setSelectedProduct} />
          </div>
        </section>

        <section className="mt-6 space-y-5 sm:space-y-6">
          {filteredNotices.length > 0 ? (
            filteredNotices.map((notice) => (
              <NoticeCard
                key={notice.id}
                notice={notice}
                isSaved={savedIds.includes(notice.id)}
                onToggleSave={handleToggleSave}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-[#D1D6DB] bg-white px-6 py-14 text-center">
              <p className="text-base font-semibold text-[#191F28]">검색 결과가 없습니다</p>
              <p className="mt-2 text-sm text-[#6B7684]">
                검색어나 제품 필터를 변경해 다시 시도해 보세요.
              </p>
            </div>
          )}
        </section>

        <p className="mt-8 text-center text-xs text-[#8B95A1]">
          샘플 데이터 기반 MVP · 나라장터 API 연동 예정
        </p>
      </main>
    </div>
  );
}
