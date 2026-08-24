/**
 * Skeleton — shimmering placeholder blocks for loading states, so pages show
 * their real layout (not a spinner) while data loads. Compose the primitive
 * <Skeleton/> for one-off shapes, or use the row/card helpers for common lists.
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-stone-200/70 rounded-lg ${className}`} />
}

// A generic list-row placeholder: avatar + two text lines + a trailing value.
export function SkeletonRow({ avatar = true }: { avatar?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white border border-stone-100 rounded-xl">
      {avatar && <Skeleton className="w-11 h-11 rounded-full shrink-0" />}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-2.5 w-1/4" />
      </div>
      <Skeleton className="h-4 w-12 shrink-0" />
    </div>
  )
}

// N stacked row placeholders.
export function SkeletonList({ rows = 6, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} avatar={avatar} />
      ))}
    </div>
  )
}
