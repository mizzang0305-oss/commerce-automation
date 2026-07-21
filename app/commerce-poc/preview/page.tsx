import { CommercePocLocalPreview } from "@/components/CommercePocLocalPreview";

export default function CommercePocPreviewPage() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Commerce PoC</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">로컬 상품 자료 미리보기</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          서버 업로드 없이 브라우저 메모리에서만 JSONL을 읽고 상품명, 가격, 재고, 판매자, 이미지와 원본 링크를 검토합니다.
        </p>
      </div>

      <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
        파일 선택은 업로드 승인이 아닙니다. 원격 이미지는 기본 차단되며 사용자가 버튼으로 켠 경우에만 브라우저가 HTTPS 이미지를 요청합니다.
        이 화면은 draft 승인, webhook, 알림, DB/R2, queue, worker job 또는 플랫폼 게시를 실행하지 않습니다.
      </section>

      <CommercePocLocalPreview />
    </div>
  );
}
