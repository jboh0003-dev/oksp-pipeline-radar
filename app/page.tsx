"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardLoading from "@/components/DashboardLoading";
import Header from "@/components/Header";
import NoticeCard from "@/components/NoticeCard";
import ProductFilter from "@/components/ProductFilter";
import SearchBar from "@/components/SearchBar";
import SummaryCards from "@/components/SummaryCards";
import {
  type Notice,
  type ProductFilter as ProductFilterValue,
} from "@/data/sampleNotices";
import { fetchNotices, type NoticeDataSource } from "@/lib/fetchNotices";
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
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dataSource, setDataSource] = useState<NoticeDataSource>("sample");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductFilterValue>("전체");
  const [savedIds, setSavedIds] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadNotices() {
      setIsLoading(true);
      const result = await fetchNotices();
      if (!isMounted) return;
      setNotices(result.notices);
      setDataSource(result.source);
      setErrorMessage(result.error);
      setIsLoading(false);
    }

    void loadNotices();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredNotices = useMemo(() => {
    return notices.filter(
      (notice) => matchesSearch(notice, searchQuery) && matchesProduct(notice, selectedProduct),
    );
  }, [notices, searchQuery, selectedProduct]);

  const summary = useMemo(() => {
    const savedCount = notices.filter((notice) => savedIds.includes(notice.id)).length;
    return {
      totalCount: notices.length,
      savedCount,
      averageFitScore: getAverageFitScore(filteredNotices),
      imminentCount: countImminentDeadlines(notices),
    };
  }, [notices, filteredNotices, savedIds]);

  const handleToggleSave = (id: string) => {
    setSavedIds((prev) =>
      prev.includes(id) ? prev.filter((savedId) => savedId !== id) : [...prev, id],
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-full bg-[#F2F4F6]">
        <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
          <Header totalCount={0} filteredCount={0} />
          <DashboardLoading />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#F2F4F6]">
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <Header totalCount={notices.length} filteredCount={filteredNotices.length} />

        {dataSource === "sample" && errorMessage && (
          <div className="mb-4 rounded-xl border border-[#FFD6D6] bg-[#FFF0F0] px-4 py-4 text-sm text-[#B42318]">
            <p className="font-semibold">Supabase 연결에 실패해 샘플 데이터를 표시하고 있습니다.</p>
            <p className="mt-2 text-xs font-medium text-[#912018]">오류 상세</p>
            <p className="mt-1 break-all rounded-lg bg-white/80 px-3 py-2 font-mono text-xs leading-relaxed text-[#912018]">
              {errorMessage}
            </p>
          </div>
        )}

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
          {dataSource === "supabase"
            ? "Supabase 연동 · 나라장터 API 연동 예정"
            : "샘플 데이터 기반 MVP · 나라장터 API 연동 예정"}
        </p>
      </main>
    </div>
  );
}
