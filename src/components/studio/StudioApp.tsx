"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3,
  ExternalLink, Film, LayoutDashboard, Link2, LogOut, PackageSearch, Settings2, ShieldCheck,
  Sparkles, Sun, Moon, TriangleAlert, WifiOff
} from "lucide-react";
import type { StudioModel, StudioSlot } from "@/lib/commerce-studio/model";
import "./studio.css";

type Section = "overview" | "calendar" | "content" | "products" | "settings" | "connections";

const NAV: { section: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { section: "overview", label: "대시보드", icon: LayoutDashboard },
  { section: "calendar", label: "콘텐츠 캘린더", icon: CalendarDays },
  { section: "content", label: "콘텐츠 기록", icon: Film },
  { section: "products", label: "상품 교체", icon: PackageSearch },
  { section: "settings", label: "운영 설정", icon: Settings2 },
  { section: "connections", label: "내 정보 · 연결", icon: Link2 }
];

const TITLES: Record<Section, string> = {
  overview: "오늘의 스튜디오", calendar: "콘텐츠 캘린더", content: "콘텐츠 기록",
  products: "상품 선택과 교체", settings: "운영 설정", connections: "내 정보 · 채널 연결"
};

function href(section: Section) { return section === "overview" ? "/studio" : `/studio/${section}`; }

export function StudioApp({ section, model, authSetupRequired = false }: { section: Section; model: StudioModel; authSetupRequired?: boolean }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light");
  const changeTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    window.localStorage.setItem("commerce-studio-theme", next);
    window.dispatchEvent(new Event("commerce-studio-theme-change"));
  };
  const today = kstDate(model.observedAt);
  const todaySlots = model.slots.filter((slot) => slot.date === today);
  const produced = model.producerSource === "connected" ? todaySlots.filter((slot) => slot.status === "succeeded").length : null;
  const published = model.publisherSource === "connected" ? model.contents.filter((item) => item.status === "uploaded" && item.publishedAt && kstDate(item.publishedAt) === today).length : null;
  const ready = model.publisherSource === "connected" ? model.contents.filter((item) => item.status === "ready").length : null;
  const failures = model.producerSource === "connected" ? todaySlots.filter((slot) => slot.status === "failed").length : null;

  return (
    <div className={`studio studio-${theme}`}>
      <aside className="studio-sidebar" aria-label="스튜디오 메뉴">
        <Link href="/studio" className="studio-brand"><span className="studio-brand-icon"><Sparkles size={22} /></span><span><strong>commerce<span className="studio-brand-dot">.</span>studio</strong><small>콘텐츠 운영 워크스페이스</small></span></Link>
        <div className="studio-side-heading">운영 메뉴</div>
        <nav className="studio-side-nav">{NAV.map((item) => <Link key={item.section} href={href(item.section)} className={`studio-nav-link ${section === item.section ? "active" : ""}`} aria-current={section === item.section ? "page" : undefined}><item.icon size={18} strokeWidth={1.9} /><span>{item.label}</span>{section === item.section && <span className="studio-nav-pip" />}</Link>)}</nav>
        <div className="studio-sidebar-bottom"><span className="studio-sidebar-separator" /><div className="studio-runtime-card"><span className="studio-runtime-mark" /><div><strong>기존 자동화 유지</strong><small>Studio는 조회와 계획 화면입니다.</small></div></div><Link href="/dashboard" className="studio-advanced">기존 운영 콘솔 <ArrowRight size={14} /></Link></div>
      </aside>
      <div className="studio-main-wrap">
        <header className="studio-header"><div className="studio-header-left"><span className="studio-breadcrumb">운영 화면</span><span className="studio-breadcrumb-slash">/</span><span>{TITLES[section]}</span></div><div className="studio-header-actions"><span className="studio-date-pill"><CalendarDays size={15} />{formatDate(today)}</span><button type="button" className="studio-icon-button" aria-label={theme === "light" ? "어두운 테마" : "밝은 테마"} onClick={changeTheme}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</button>{!authSetupRequired && <form action="/api/studio-auth/logout" method="post"><button type="submit" className="studio-icon-button" aria-label="로그아웃" title="로그아웃"><LogOut size={17} /></button></form>}<span className="studio-avatar" title={authSetupRequired ? "소유자 인증 설정 대기" : "소유자 화면"}>M</span></div></header>
        <main className="studio-main">
          <div className="studio-page-intro"><div><div className="studio-eyebrow"><span className="studio-eyebrow-line" />콘텐츠 운영</div><h1>{TITLES[section]}</h1><p>실행 기록은 확인된 원천만 표시합니다. 연결되지 않은 값은 비워 둡니다.</p></div><div className="studio-sync"><span className={model.producerSource === "connected" && model.publisherSource === "connected" && !model.sourceStale ? "studio-sync-dot ok" : "studio-sync-dot"} />{model.sourceStale ? "최근 호스트 동기화 지연" : model.producerSource === "connected" && model.publisherSource === "connected" ? "원천 상태 확인" : "실행 상태 연결 대기"}<small>조회 {formatTimestamp(model.queriedAt)}{model.producerObservedAt && <> · 관측 {formatTimestamp(model.producerObservedAt)}</>}{model.receivedAt && <> · 수신 {formatTimestamp(model.receivedAt)}</>}</small></div></div>
          {authSetupRequired && <div className="studio-notice studio-notice-amber" role="status"><ShieldCheck size={19} /><div><strong>소유자 로그인 설정 대기</strong><span>이 화면은 데이터 없는 디자인 검토용입니다. 앱 로그인 설정 전에는 운영 파일을 읽거나 변경할 수 없습니다.</span></div></div>}
          {!authSetupRequired && (model.producerSource !== "connected" || model.publisherSource !== "connected") && <div className="studio-notice" role="status"><WifiOff size={19} /><div><strong>운영 데이터 일부가 연결되지 않았습니다</strong><span>서버가 운영 PC의 실행 파일에 직접 접근할 수 없습니다. 실제 수치를 추정하거나 예시 데이터를 운영 결과로 표시하지 않습니다.</span></div></div>}
          {model.sourceStale && <div className="studio-notice" role="status"><Clock3 size={19} /><div><strong>운영 PC의 최근 동기화가 지연되었습니다</strong><span>아래 값은 마지막 정상 snapshot입니다. 화면 새로고침 시각을 원천 관측 시각으로 오해하지 마세요.</span></div></div>}
          {section === "overview" && <Overview model={model} today={today} produced={produced} published={published} ready={ready} failures={failures} />}
          {section === "calendar" && <Calendar model={model} today={today} />}
          {section === "content" && <Content model={model} />}
          {section === "products" && <Products model={model} today={today} />}
          {section === "settings" && <Settings model={model} />}
          {section === "connections" && <Connections model={model} />}
        </main>
        <nav className="studio-mobile-nav" aria-label="모바일 스튜디오 메뉴">{NAV.map((item) => <Link key={item.section} href={href(item.section)} className={section === item.section ? "active" : ""} aria-label={item.label}><item.icon size={20} /><span>{item.label.replace("콘텐츠 ", "").replace("내 정보 · ", "")}</span></Link>)}</nav>
      </div>
    </div>
  );
}

function Overview({ model, today, produced, published, ready, failures }: { model: StudioModel; today: string; produced: number | null; published: number | null; ready: number | null; failures: number | null }) {
  const upcoming = model.slots.filter((slot) => slot.date >= today && ["scheduled", "running"].includes(slot.status)).slice(0, 4);
  return <>
    <section className="studio-hero"><div className="studio-hero-copy"><span className="studio-hero-kicker"><Sparkles size={14} /> 오늘의 콘텐츠 운영</span><h2>오늘도, 좋은 콘텐츠를<br />차근차근 쌓아갑니다.</h2><p>실제 생성·게시 상태를 한곳에서 확인하고,<br className="studio-desktop-break" /> 다음 일정을 계획하세요.</p><Link className="studio-button studio-button-dark" href="/studio/calendar">일정 확인하기 <ArrowRight size={16} /></Link></div><div className="studio-hero-art" aria-hidden="true"><div className="studio-art-circle c1" /><div className="studio-art-circle c2" /><div className="studio-art-sheet"><div className="studio-art-sheet-top"><span /><span /><span /></div><div className="studio-art-video"><Film size={33} strokeWidth={1.4} /></div><div className="studio-art-lines"><i /><i /><i /></div></div><div className="studio-art-badge"><Check size={15} /> 한 단계씩</div></div></section>
    <section className="studio-metrics" aria-label="오늘의 운영 지표"><Metric label="오늘 생성" value={produced} unit="건" icon={Film} tone="mint" /><Metric label="오늘 게시" value={published} unit="건" icon={Check} tone="green" /><Metric label="게시 대기" value={ready} unit="건" icon={Clock3} tone="cream" /><Metric label="오늘 실패" value={failures} unit="건" icon={TriangleAlert} tone="rose" /></section>
    <div className="studio-two-col"><section className="studio-panel"><PanelTitle eyebrow="다음 일정" title="다가오는 콘텐츠" action="전체 일정" href="/studio/calendar" />{upcoming.length ? <div className="studio-slot-list">{upcoming.map((slot) => <SlotRow key={`${slot.date}-${slot.time}`} slot={slot} />)}</div> : <EmptyState title="예정 콘텐츠를 확인할 수 없습니다" message="실행 호스트의 설정과 상태가 연결되면 일정이 나타납니다." />}</section><section className="studio-panel"><PanelTitle eyebrow="최근 기록" title="최근 콘텐츠" action="기록 보기" href="/studio/content" />{model.contents.length ? <div className="studio-slot-list">{model.contents.slice(0, 4).map((item) => <div className="studio-content-row" key={item.id}><div className="studio-content-thumb"><Film size={21} /></div><div className="studio-row-main"><strong>{item.productName}</strong><span>{channelLabel(item.channelKey)} · {formatDateTime(item.createdAt)}</span></div><StatusPill status={item.status} /></div>)}</div> : <EmptyState title="표시할 콘텐츠 기록이 없습니다" message="게시기 상태가 연결되면 실제 기록만 표시합니다." />}</section></div>
    <section className="studio-channel-strip"><div><span className="studio-eyebrow">연결한 채널</span><h3>채널 연결 상태</h3><p>YouTube 두 채널은 실제 인증 조회 전까지 연결 완료로 표시하지 않습니다.</p></div><div className="studio-channel-list">{model.youtubeChannels.map((channel) => <div key={channel.key} className="studio-channel-chip"><span className="studio-youtube-mark">▶</span><span><strong>{channel.title}</strong><small>{channel.credentialConfigured ? "토큰 경로 설정 · ID 확인 필요" : channel.historicalPublicationObserved ? "과거 게시 확인 · 현재 인증 미확인" : "현재 인증 미확인"}</small></span></div>)}</div><Link href="/studio/connections" className="studio-circle-link" aria-label="채널 연결 상세"><ArrowRight size={18} /></Link></section>
  </>;
}

function Calendar({ model, today }: { model: StudioModel; today: string }) {
  const dates = useMemo(() => [...new Set([...model.calendarDates, ...model.slots.map((slot) => slot.date)])].sort(), [model.calendarDates, model.slots]);
  const [selectedDate, setSelectedDate] = useState(today);
  const selected = model.slots.filter((slot) => slot.date === selectedDate);
  const index = Math.max(0, dates.indexOf(selectedDate));
  const start = Math.max(0, Math.min(index - 3, dates.length - 7));
  const visibleDates = dates.slice(start, start + 7);
  return <><div className="studio-section-head"><div><span className="studio-eyebrow">일정</span><h2>날짜별 예정과 실행</h2><p>상품이 확정되지 않은 미래 시간은 상품명을 표시하지 않습니다.</p></div><span className="studio-hint">한국 시간 · 최근 14일 / 향후 7일</span></div><div className="studio-panel"><div className="studio-calendar-bar"><button aria-label="이전 날짜" disabled={index <= 0} onClick={() => setSelectedDate(dates[index - 1])}><ChevronLeft size={18} /></button><strong>{formatDate(selectedDate)}</strong><button aria-label="다음 날짜" disabled={index >= dates.length - 1} onClick={() => setSelectedDate(dates[index + 1])}><ChevronRight size={18} /></button></div>{dates.length ? <><div className="studio-day-strip">{visibleDates.map((date) => <button type="button" key={date} className={selectedDate === date ? "active" : ""} onClick={() => setSelectedDate(date)}><small>{weekday(date)}</small><strong>{date.slice(-2)}</strong><span>{model.slots.filter((slot) => slot.date === date).length}건</span></button>)}</div><div className="studio-slot-list">{selected.map((slot) => <SlotRow key={`${slot.date}-${slot.time}`} slot={slot} expanded />)}</div></> : <EmptyState title="일정 원천을 읽지 못했습니다" message="생성기 설정과 상태가 연결될 때까지 일정은 미확인 상태입니다." />}</div></>;
}

function Content({ model }: { model: StudioModel }) {
  const [filter, setFilter] = useState("all");
  const list = model.contents.filter((item) => filter === "all" || item.status === filter);
  return <>
    <div className="studio-section-head"><div><span className="studio-eyebrow">콘텐츠 기록</span><h2>실제 콘텐츠 기록</h2><p>생성 시간과 게시 기록을 분리해 표시합니다.</p></div><span className="studio-hint">관측 기준 · {formatTimestamp(model.observedAt)}</span></div>
    <div className="studio-filter-row">{[["all", "전체"], ["ready", "게시 대기"], ["uploaded", "게시 완료"], ["error", "오류"], ["manual_review", "수동 검토"]].map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <div className="studio-content-grid">{list.map((item) => <article className="studio-content-card" key={item.id}>
      <div className="studio-content-cover"><Film size={33} strokeWidth={1.3} /><span>{channelLabel(item.channelKey)}</span></div>
      <div className="studio-content-card-body"><StatusPill status={item.status} /><h3>{item.productName}</h3><p>{item.title || "원본 게시 기록에 제목 없음"}</p><div className="studio-content-meta">{item.evidenceSource === "ledger" ? "게시 원장 기록" : "게시 작업 생성"} {formatDateTime(item.createdAt)}{item.publishedAt && <> · 게시 {formatDateTime(item.publishedAt)}</>}</div>{item.youtubeUrl && <a href={item.youtubeUrl} target="_blank" rel="noopener noreferrer">YouTube에서 보기 <ExternalLink size={14} /></a>}</div>
    </article>)}</div>
    {!list.length && <div className="studio-panel"><EmptyState title={model.publisherSource === "connected" ? "해당 상태의 콘텐츠가 없습니다" : "콘텐츠 원천이 연결되지 않았습니다"} message={model.publisherSource === "connected" ? "필터를 바꾸거나 이후 실행 기록을 확인하세요." : "게시기 상태 파일을 안전한 읽기 모델에 연결해야 합니다."} /></div>}
  </>;
}

function Products({ model, today }: { model: StudioModel; today: string }) {
  const future = model.slots.filter((slot) => slot.date >= today && slot.status === "scheduled");
  const command = useStudioCommand();
  return <><div className="studio-section-head"><div><span className="studio-eyebrow">상품 계획</span><h2>예정 상품 교체</h2><p>실행 전 슬롯의 검증된 후보만 선택합니다. 호스트 적용 확인 전에는 변경 완료로 표시하지 않습니다.</p></div></div>
    {!model.commandsAvailable && <div className="studio-notice studio-notice-amber"><ShieldCheck size={19} /><div><strong>호스트 명령 연결 대기</strong><span>실제 후보와 명령 수신 호스트가 연결되고 별도 운영 승인을 받은 후 선택이 활성화됩니다.</span></div></div>}
    {command.message && <div className="studio-notice" role="status"><Clock3 size={19} /><div><strong>명령 상태</strong><span>{command.message}</span></div></div>}
    <div className="studio-panel"><PanelTitle eyebrow="예정 시간" title="실행 전 상품 계획" />{future.length ? <div className="studio-slot-list">{future.map((slot) => {
      const slotId = `${slot.date}|${slot.time}`;
      const candidates = model.candidates.filter((candidate) => candidate.slotId === slotId);
      return <div key={slotId} className="studio-product-plan"><div className="studio-slot-row"><div className="studio-slot-icon"><PackageSearch size={19} /></div><div className="studio-row-main"><strong>{formatDate(slot.date)} · {slot.time}</strong><span>{slot.productName ?? "상품 미선정"} · {slot.planStatus === "selected" ? "호스트 선택 기록" : "실행 전"}</span></div></div>
        {candidates.length ? <div className="studio-candidate-list">{candidates.map((candidate) => <div className="studio-candidate" key={`${slotId}-${candidate.snapshotId}`}><div><strong>{candidate.productName}</strong><small>{channelLabel(candidate.channelKey)} · {candidate.eligible && !candidate.safeBlockers.length ? "선택 가능" : "선택 불가"}</small></div><button type="button" className="studio-outline-button" disabled={!model.commandsAvailable || command.busy || !candidate.eligible || candidate.safeBlockers.length > 0} onClick={() => command.submit({ type: "SELECT_PRODUCT", targetId: slotId, expectedVersion: slot.planVersion ?? 0, payload: { candidateSnapshotId: candidate.snapshotId, productId: candidate.productId } })}>이 상품 선택</button></div>)}</div> : <p className="studio-inline-note">이 시간의 검증된 실제 후보가 아직 없습니다.</p>}</div>;
    })}</div> : <EmptyState title="확인 가능한 예정 시간이 없습니다" message="호스트 연결 후 아직 시작하지 않은 일정만 표시합니다." />}</div></>;
}

function Settings({ model }: { model: StudioModel }) {
  const s = model.settings;
  const command = useStudioCommand();
  const [enabled, setEnabled] = useState(s?.enabled ?? false);
  const [target, setTarget] = useState(s?.dailyGenerateTarget ?? 3);
  const [slots, setSlots] = useState(s?.generationSlots.join(", ") ?? "09:00, 15:00, 21:00");
  const slotValues = slots.split(",").map((value) => value.trim()).filter(Boolean);
  const valid = slotValues.length >= target && slotValues.length <= 3 && new Set(slotValues).size === slotValues.length && slotValues.every((value, index) => /^(?:0\d|1\d|2[01]):[0-5]\d$/u.test(value) && (index === 0 || slotValues[index - 1] < value));
  return <><div className="studio-section-head"><div><span className="studio-eyebrow">운영 설정</span><h2>생성기 설정</h2><p>설정 변경은 호스트가 수신해 실제 설정·일정을 확인한 뒤 적용됩니다.</p></div></div><div className="studio-panel studio-settings-panel"><PanelTitle eyebrow="현재 설정" title="실행 호스트 설정" />{s ? <><div className="studio-setting-list"><SettingRow label="자동 생성" value={s.enabled ? "활성" : "비활성"} /><SettingRow label="하루 생성 목표" value={`${s.dailyGenerateTarget}건`} /><SettingRow label="한 번에 처리" value={`${s.maxItemsPerRun}건`} /><SettingRow label="생성 시간" value={s.generationSlots.join(" · ")} /><SettingRow label="시간대" value="한국 표준시" /></div><div className="studio-settings-form"><label>자동 생성<select value={String(enabled)} onChange={(event) => setEnabled(event.target.value === "true")}><option value="true">활성</option><option value="false">비활성</option></select></label><label>하루 생성 목표<select value={target} onChange={(event) => setTarget(Number(event.target.value))}>{[1, 2, 3].map((value) => <option key={value} value={value}>{value}건</option>)}</select></label><label>생성 시간 (쉼표로 구분)<input value={slots} onChange={(event) => setSlots(event.target.value)} aria-invalid={!valid} placeholder="09:00, 15:00, 21:00" /></label></div></> : <EmptyState title="설정을 읽을 수 없습니다" message="운영 PC의 상태 전송이 연결되지 않았습니다." />}<div className="studio-form-footer"><span>{command.message || (model.commandsAvailable ? "호스트 적용 확인 전에는 완료가 아닙니다." : "명령 연결 대기 · 현재 운영 설정은 변경되지 않습니다.")}</span><button className="studio-button studio-button-dark" disabled={!s || !model.commandsAvailable || command.busy || !valid || s.revision === undefined} onClick={() => command.submit({ type: "SET_PRODUCER_SETTINGS", targetId: "producer-settings", expectedVersion: s?.revision ?? 0, payload: { enabled, dailyGenerateTarget: target, maxItemsPerRun: 1, generationSlots: slotValues, timeZone: "Asia/Seoul" } })}>설정 적용 요청</button></div></div></>;
}

function useStudioCommand() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(input: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage("운영 PC의 수신을 기다리는 중입니다.");
    try {
      const response = await fetch("/api/studio/commands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json();
      if (!response.ok || !result.commandId) throw new Error(result.safeError || "STUDIO_COMMAND_SUBMIT_FAILED");
      for (let index = 0; index < 15; index++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const statusResponse = await fetch(`/api/studio/commands?id=${encodeURIComponent(result.commandId)}`, { cache: "no-store" });
        if (!statusResponse.ok) throw new Error("STUDIO_COMMAND_STATUS_UNAVAILABLE");
        const status = (await statusResponse.json()).command;
        if (status?.status === "applied") { setMessage("운영 PC가 적용을 확인했습니다. 화면을 새로고침해 최신 상태를 확인하세요."); return; }
        if (status?.status === "rejected") { setMessage(`운영 PC가 변경을 거부했습니다: ${status.receipt || "사유 확인 필요"}`); return; }
      }
      setMessage("호스트 확인이 지연되고 있습니다. 적용 여부는 아직 미확인입니다.");
    } catch (error) { setMessage(error instanceof Error ? `명령을 적용할 수 없습니다: ${error.message}` : "명령 상태를 확인할 수 없습니다."); }
    finally { setBusy(false); }
  }
  return { busy, message, submit };
}

function Connections({ model }: { model: StudioModel }) {
  return <><div className="studio-section-head"><div><span className="studio-eyebrow">내 정보 · 연결</span><h2>계정과 채널</h2><p>과거 게시와 현재 인증 상태를 구분합니다.</p></div></div><div className="studio-connections-grid">{model.youtubeChannels.map((channel) => <article key={channel.key} className="studio-connection-card"><div className="studio-connection-icon youtube">▶</div><span className="studio-eyebrow">유튜브</span><h3>{channel.title}</h3><p className="studio-connection-id">예상 채널 ID · {channel.expectedChannelId}</p><div className="studio-connection-status"><span className="studio-status-marker warn" />{channel.credentialConfigured ? "토큰 경로 설정 · 현재 인증 조회 필요" : channel.historicalPublicationObserved ? "과거 게시 확인 · 현재 인증 미확인" : "현재 인증 미확인"}</div><button disabled className="studio-outline-button">현재 인증 확인 대기</button></article>)}<article className="studio-connection-card"><div className="studio-connection-icon instagram">◎</div><span className="studio-eyebrow">인스타그램</span><h3>Instagram</h3><p>공식 앱 등록과 계정 동의가 필요합니다. 현재 연결되지 않았습니다.</p><div className="studio-connection-status"><span className="studio-status-marker" />앱 등록 · 계정 동의 대기</div><button disabled className="studio-outline-button">연결 준비 중</button></article><article className="studio-connection-card"><div className="studio-connection-icon tiktok">♪</div><span className="studio-eyebrow">틱톡</span><h3>TikTok</h3><p>공식 앱 등록과 계정 동의가 필요합니다. 자동 게시 권한은 포함하지 않습니다.</p><div className="studio-connection-status"><span className="studio-status-marker" />앱 등록 · 계정 동의 대기</div><button disabled className="studio-outline-button">연결 준비 중</button></article></div><div className="studio-connection-footnote"><CircleHelp size={18} /><span>두 YouTube 채널의 공개 게시기는 변경하지 않았습니다. 이 화면은 토큰을 표시하거나 브라우저에 전달하지 않습니다.</span></div></>;
}

function Metric({ label, value, unit, icon: Icon, tone }: { label: string; value: number | null; unit: string; icon: typeof Film; tone: string }) { return <div className="studio-metric"><span className={`studio-metric-icon ${tone}`}><Icon size={20} /></span><span className="studio-metric-label">{label}</span><strong>{value === null ? "확인 불가" : <>{value}<small>{unit}</small></>}</strong><span className="studio-metric-note">{value === null ? "원천 연결 대기" : "확인된 기록 기준"}</span></div>; }
function PanelTitle({ eyebrow, title, action, href: link }: { eyebrow: string; title: string; action?: string; href?: string }) { return <div className="studio-panel-title"><div><span className="studio-eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action && link && <Link href={link}>{action} <ArrowRight size={15} /></Link>}</div>; }
function SlotRow({ slot, expanded = false }: { slot: StudioSlot; expanded?: boolean }) { return <div className="studio-slot-row"><div className="studio-slot-time"><strong>{slot.time}</strong><span>{expanded ? formatDate(slot.date) : weekday(slot.date)}</span></div><div className="studio-slot-divider" /><div className="studio-row-main"><strong>{slot.productName ?? (slot.status === "scheduled" ? "아직 선택된 상품 없음" : "상품 정보 확인 불가")}</strong><span>{statusLabel(slot.status)}{slot.channelKey ? ` · ${channelLabel(slot.channelKey)}` : " · 채널 미확정"}{slot.safeError ? ` · ${slot.safeError}` : ""}</span></div><StatusPill status={slot.publishStatus ?? slot.status} /></div>; }
function EmptyState({ title, message }: { title: string; message: string }) { return <div className="studio-empty"><span><CircleHelp size={23} /></span><strong>{title}</strong><p>{message}</p></div>; }
function StatusPill({ status }: { status: string }) { const tone = ["uploaded", "succeeded"].includes(status) ? "good" : ["failed", "error"].includes(status) ? "bad" : ["ready", "running", "uploading"].includes(status) ? "work" : "idle"; return <span className={`studio-status-pill ${tone}`}>{statusLabel(status)}</span>; }
function SettingRow({ label, value }: { label: string; value: string }) { return <div className="studio-setting-row"><span>{label}</span><strong>{value}</strong></div>; }
function statusLabel(status: string) { return ({ scheduled: "예정", disabled: "생성 중지", unknown: "실행 확인 불가", running: "생성 중", succeeded: "생성 완료", failed: "실패", ready: "게시 대기", uploading: "게시 중", uploaded: "게시 완료", error: "게시 오류", manual_review: "수동 검토" } as Record<string, string>)[status] ?? "확인 필요"; }
function channelLabel(key: string) { return key === "neoman_moleulgeol" ? "너만모를껄?" : key === "father_jobs" ? "father jobs" : "채널 미확인"; }
function kstDate(iso: string) { const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso)); const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ""; return `${value("year")}-${value("month")}-${value("day")}`; }
function formatDate(date: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date; return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`; }
function weekday(date: string) { return ["일", "월", "화", "수", "목", "금", "토"][new Date(`${date}T00:00:00.000Z`).getUTCDay()]; }
function formatDateTime(iso: string) { const date = new Date(iso); if (Number.isNaN(date.getTime())) return "시간 확인 불가"; const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date); const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ""; return `${Number(value("month"))}.${Number(value("day"))}. ${value("hour")}:${value("minute")}`; }
function formatTimestamp(iso: string) { return formatDateTime(iso) + " KST"; }
function subscribeTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("commerce-studio-theme-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("commerce-studio-theme-change", callback);
  };
}
function readTheme(): "light" | "dark" { return window.localStorage.getItem("commerce-studio-theme") === "dark" ? "dark" : "light"; }
