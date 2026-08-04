// Shared brand icon: a monochrome PNG tinted to a colour via a CSS mask
// (a colour-filled box clipped to the icon shape). Default colour is the POS
// item-price amber (#f59e0b) — the standing rule is that all UI icons use it.
// On an amber background pass a darker `color` so the icon stays visible.
export const POS_ICON_AMBER = '#f59e0b'

export default function PosIcon({
  src,
  color = POS_ICON_AMBER,
  className = 'w-4 h-4',
}: {
  src: string
  color?: string
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
      style={{
        backgroundColor: color,
        WebkitMaskImage: `url("${src}")`,
        maskImage: `url("${src}")`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  )
}
