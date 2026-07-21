/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import type { ScheduledEventProductPreviewItem } from "@/lib/coupang/scheduledEventProductProvider";
import type { CommerceAutoPreviewPlan } from "@/lib/orchestration/commercePocPreview";

type DailySlotPreview = ScheduledEventProductPreviewItem & {
  draft_video_preview_url?: string | null;
};

const stockLabels = {
  in_stock: "판매 중",
  out_of_stock: "품절",
  unknown: "재고 미확인"
} as const;

const sourceLabels = {
  static_calendar: "달력 기준",
  seasonal_rule: "한국 계절 규칙",
  web_search: "공개 행사 자료",
  manual_seed: "운영자 보강"
} as const;

export function CommercePocLocalPreview({
  plan,
  dailySlots = []
}: {
  plan: CommerceAutoPreviewPlan;
  dailySlots?: DailySlotPreview[];
}) {
  const [remoteImagesEnabled, setRemoteImagesEnabled] = useState(false);
  const selection = plan.selected_product;
  const videoDraftCount = dailySlots.filter((item) => item.draft_video_preview_url).length;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="한국 기준일" value={plan.event_window.startDate} />
        <Metric label="탐색 종료일" value={plan.event_window.endDate} />
        <Metric label="30일 내 일정" value={`${plan.events.length}건`} />
        <Metric label="상품 자료 자동 검토" value={`${plan.products_considered}건`} />
      </section>

      <section className="rounded-xl border border-indigo-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">하루 4회 게시 후보 미리보기</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">출근·점심·퇴근·취침 전 시간대별 상품</h2>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
            {videoDraftCount > 0
              ? `로컬 영상 초안 ${videoDraftCount}/4 · 플랫폼 게시 미연결`
              : "상품 검색 연결 · 영상/플랫폼 게시 미연결"}
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {dailySlots.map((item) => (
            <article key={item.slot.id} className="flex flex-col rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-black text-indigo-800">{item.slot.local_time} · {item.slot.label}</p>
              <p className="mt-2 text-xs font-bold text-slate-500">{item.event?.name ?? "일정 없음"}</p>
              <p className="mt-1 text-xs text-slate-500">검색어: {item.primary_keyword ?? "없음"}</p>
              {item.product ? (
                <>
                  <h3 className="mt-3 line-clamp-3 font-bold text-slate-950">{item.product.product_name}</h3>
                  <p className="mt-2 text-lg font-black text-teal-800">
                    {item.product.price === null ? "가격 미확인" : `${item.product.price.toLocaleString("ko-KR")}원`}
                  </p>
                  {item.draft_video_preview_url ? (
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      aria-label={`${item.slot.label} 로컬 영상 초안`}
                      className="mt-3 aspect-[9/16] w-full rounded-lg bg-black object-contain"
                      src={item.draft_video_preview_url}
                    />
                  ) : (
                    <p className="mt-3 rounded-lg bg-slate-100 p-2 text-xs font-semibold text-slate-600">
                      로컬 영상 초안 미생성
                    </p>
                  )}
                  <a
                    href={item.product.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-auto pt-4 text-sm font-bold text-teal-700 underline underline-offset-4"
                  >
                    원본 상품 확인
                  </a>
                </>
              ) : (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                  해당 시간대의 로컬 검색 결과가 없습니다.
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-teal-200 bg-teal-50 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-teal-700">자동 선정 결과</p>
        {plan.selected_event ? (
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-teal-950">{plan.selected_event.name}</h2>
              <p className="mt-1 text-sm font-semibold text-teal-900">
                {dateLabel(plan.selected_event.start_date, plan.selected_event.end_date)} · {sourceLabels[plan.selected_event.source]}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {plan.product_search_terms.map((term) => (
                  <span key={term} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-teal-800 shadow-sm">
                    {term}
                  </span>
                ))}
              </div>
            </div>
            <p className="max-w-md text-sm text-teal-900">
              실행일마다 이 30일 창을 다시 계산합니다. 방학 일정은 학교별 차이가 있어 계절 기준 후보로 표시하고 owner review에서 최종 확인합니다.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm font-semibold text-teal-900">30일 창에서 사용할 일정을 찾지 못했습니다.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">한국 30일 일정</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">행사·기념일·방학 시작/종료</h2>
          </div>
          <span className="text-xs font-semibold text-slate-500">Asia/Seoul · 매 실행 시 재계산</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plan.events.slice(0, 12).map((event) => (
            <article key={`${event.event_id}-${event.start_date}`} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold text-slate-950">{event.name}</h3>
                <span className={event.active_now
                  ? "shrink-0 rounded-full bg-teal-100 px-2 py-1 text-xs font-bold text-teal-800"
                  : "shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600"}
                >
                  {event.active_now ? "진행 중" : `${event.days_until_start}일 전`}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{dateLabel(event.start_date, event.end_date)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{sourceLabels[event.source]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">상품 자동 선택</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">일정 적합도 기반 owner review 후보</h2>
          </div>
          {selection ? (
            <button
              type="button"
              className={remoteImagesEnabled
                ? "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900"
                : "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700"}
              onClick={() => setRemoteImagesEnabled((enabled) => !enabled)}
            >
              {remoteImagesEnabled ? "원격 이미지 미리보기 끄기" : "원격 이미지 미리보기 켜기"}
            </button>
          ) : null}
        </div>

        {selection ? (
          <article className="grid overflow-hidden rounded-xl border border-slate-200 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="flex min-h-64 items-center justify-center bg-slate-100">
              {remoteImagesEnabled ? (
                <img
                  src={selection.product.image_url}
                  alt={selection.product.product_name}
                  className="h-full max-h-96 w-full object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="px-5 text-center">
                  <p className="text-sm font-bold text-slate-500">원격 이미지 로드 꺼짐</p>
                  <p className="mt-2 text-xs text-slate-400">버튼을 눌러 owner review용 이미지를 확인할 수 있습니다.</p>
                </div>
              )}
            </div>
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-xl font-black text-slate-950">{selection.product.product_name}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                  {stockLabels[selection.product.stock_status]}
                </span>
              </div>
              <p className="mt-3 text-2xl font-black text-teal-800">
                {selection.product.price === null ? "가격 미확인" : `${selection.product.price.toLocaleString("ko-KR")}원`}
              </p>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <Detail label="연결 일정" value={selection.event_name} />
                <Detail label="일정 적합도" value={`${selection.relevance_score}점`} />
                <Detail label="일치 키워드" value={selection.matched_terms.join(", ")} />
                <Detail label="판매처" value={selection.product.seller} />
              </dl>
              <a
                href={selection.product.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex text-sm font-bold text-teal-700 underline underline-offset-4"
              >
                원본 공개 페이지 확인
              </a>
            </div>
          </article>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-bold">아직 자동 선택할 실제 상품 자료가 없습니다.</p>
            <p className="mt-1">
              일정과 검색 키워드는 자동 생성됐습니다. 다음 수집 실행에서 이 키워드로 실제 상품을 가져오면 같은 화면에서 자동으로 순위를 매깁니다.
            </p>
            <p className="mt-2 font-semibold">상태: {plan.current_blocker}</p>
          </div>
        )}
      </section>

      <section className="grid gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm font-semibold text-teal-950 sm:grid-cols-2 lg:grid-cols-4">
        <p>외부 업로드: 없음</p>
        <p>DB / R2 write: 없음</p>
        <p>queue / worker job: 없음</p>
        <p>owner review: 필수</p>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function dateLabel(start: string, end: string) {
  return start === end ? start : `${start} ~ ${end}`;
}
