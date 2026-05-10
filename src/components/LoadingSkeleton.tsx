export function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-5 w-1/3 animate-pulse rounded bg-slate-200" />
      <div className="h-24 animate-pulse rounded-lg bg-slate-200" />
      <div className="h-24 animate-pulse rounded-lg bg-slate-200" />
    </div>
  );
}
