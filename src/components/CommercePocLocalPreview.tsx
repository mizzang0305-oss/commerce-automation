/* eslint-disable @next/next/no-img-element */
"use client";

import { useRef, useState } from "react";
import {
  COMMERCE_PREVIEW_MAX_FILE_BYTES,
  parseCommerceProductPreview,
  type CommerceProductPreviewResult
} from "@/lib/orchestration/commercePocPreview";

const stockLabels = {
  in_stock: "판매 중",
  out_of_stock: "품절",
  unknown: "재고 미확인"
} as const;

const emptyResult: CommerceProductPreviewResult = {
  products: [],
  errors: [],
  total_rows: 0
};

export function CommercePocLocalPreview() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState(emptyResult);
  const [fileError, setFileError] = useState<string | null>(null);
  const [remoteImagesEnabled, setRemoteImagesEnabled] = useState(false);
  const [reading, setReading] = useState(false);

  async function handleFile(file: File | undefined) {
    setFileError(null);
    setRemoteImagesEnabled(false);
    setResult(emptyResult);
    setFileName(file?.name ?? null);
    if (!file) {
      return;
    }
    if (file.size > COMMERCE_PREVIEW_MAX_FILE_BYTES) {
      setFileError("5MB 이하 파일만 미리볼 수 있습니다.");
      return;
    }

    setReading(true);
    try {
      setResult(parseCommerceProductPreview(await file.text()));
    } catch {
      setFileError("파일을 읽을 수 없습니다. 로컬 JSONL 파일인지 확인하세요.");
    } finally {
      setReading(false);
    }
  }

  function reset() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setFileName(null);
    setResult(emptyResult);
    setFileError(null);
    setRemoteImagesEnabled(false);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <label htmlFor="commerce-preview-file" className="block text-sm font-bold text-slate-950">
              상품 JSONL 파일
            </label>
            <p className="mt-1 text-sm text-slate-500">
              최대 5MB, 200개 상품까지 읽습니다. 파일 내용은 브라우저 메모리를 벗어나지 않습니다.
            </p>
            <input
              ref={inputRef}
              id="commerce-preview-file"
              type="file"
              accept=".jsonl,.ndjson,.json,application/json,application/x-ndjson"
              className="mt-3 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-teal-700 file:px-3 file:py-2 file:font-bold file:text-white"
              onChange={(event) => void handleFile(event.currentTarget.files?.[0])}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {result.products.length > 0 ? (
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
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
              disabled={!fileName && !fileError}
              onClick={reset}
            >
              초기화
            </button>
          </div>
        </div>
      </section>

      <div aria-live="polite">
        {reading ? <p className="rounded-lg bg-sky-50 p-4 text-sm font-semibold text-sky-800">파일을 읽는 중입니다.</p> : null}
        {fileError ? <p className="rounded-lg bg-rose-50 p-4 text-sm font-semibold text-rose-800">{fileError}</p> : null}
      </div>

      {fileName && !reading && !fileError ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">선택 파일</p>
              <p className="mt-1 break-all text-sm font-bold text-slate-950">{fileName}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-teal-50 px-3 py-1 text-teal-800">정상 {result.products.length}</span>
              <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-800">오류 {result.errors.length}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">전체 {result.total_rows}</span>
            </div>
          </div>

          {result.errors.length > 0 ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4">
              <h2 className="text-sm font-bold text-rose-950">검증 오류</h2>
              <ul className="mt-2 space-y-1 text-sm text-rose-800">
                {result.errors.map((error, index) => (
                  <li key={`${error.line ?? "file"}-${error.code}-${index}`}>
                    {error.line ? `${error.line}행: ` : "파일: "}{error.message} <code>{error.code}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {result.products.length > 0 ? (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-950">상품 미리보기</h2>
            <span className="text-xs font-bold text-slate-500">
              원격 이미지 로드: {remoteImagesEnabled ? "사용자 승인됨" : "차단됨"}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {result.products.map((product, index) => (
              <article key={`${product.raw_hash}-${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex aspect-[16/10] items-center justify-center bg-slate-100">
                  {remoteImagesEnabled ? (
                    <img
                      src={product.image_url}
                      alt={product.product_name}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="px-5 text-center">
                      <p className="text-sm font-bold text-slate-500">원격 이미지 로드 꺼짐</p>
                      <p className="mt-2 line-clamp-2 break-all text-xs text-slate-400">{product.image_url}</p>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold text-slate-950">{product.product_name}</h3>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                      {stockLabels[product.stock_status]}
                    </span>
                  </div>
                  <p className="mt-3 text-xl font-black text-teal-800">
                    {product.price === null ? "가격 미확인" : `${product.price.toLocaleString("ko-KR")}원`}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-600">{product.seller}</p>
                  <a
                    href={product.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex text-sm font-bold text-teal-700 underline underline-offset-4"
                  >
                    원본 자료 열기
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm font-semibold text-teal-950 sm:grid-cols-2 lg:grid-cols-4">
        <p>외부 업로드: 없음</p>
        <p>서버 저장: 없음</p>
        <p>DB / R2 write: 없음</p>
        <p>게시 승인: 별도 필요</p>
      </section>
    </div>
  );
}
