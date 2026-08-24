type Props = {
  icon: string
  title: string
  description: string
  features: string[]
}

// Generic placeholder for sections not yet built — shows planned features
export default function PlaceholderPage({ icon, title, description, features }: Props) {
  return (
    <div
      className="flex-1 flex flex-col overflow-hidden bg-slate-950 text-white"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10 bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            <p className="text-sm text-white/40 mt-0.5">{description}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-sm text-center flex flex-col items-center gap-6">
          <div className="w-24 h-24 rounded-3xl bg-slate-800 border border-white/10 flex items-center justify-center">
            <span className="text-5xl">{icon}</span>
          </div>

          <div>
            <h2 className="text-2xl font-black text-white">{title}</h2>
            <p className="text-white/40 mt-2 text-sm leading-relaxed">{description}</p>
          </div>

          <div className="w-full bg-slate-800/60 border border-white/10 rounded-2xl p-5 text-left flex flex-col gap-2">
            <p className="text-xs font-bold text-white/30 uppercase tracking-widest mb-1">Planned features</p>
            {features.map((f) => (
              <div key={f} className="flex items-start gap-2">
                <span className="text-amber-500/60 mt-0.5 shrink-0">◦</span>
                <span className="text-sm text-white/50">{f}</span>
              </div>
            ))}
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2">
            <p className="text-xs text-amber-400/70 font-semibold">Coming next — tell me to build this section</p>
          </div>
        </div>
      </div>
    </div>
  )
}
