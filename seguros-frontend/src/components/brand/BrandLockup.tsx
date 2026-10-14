import { ShieldCheck } from 'lucide-react'
import { branding } from '@/config/branding'

type BrandLockupProps = {
  compact?: boolean
  subtitle?: string
  className?: string
}

/** Identidade compartilhada entre login, sidebar e cabeçalho. */
export default function BrandLockup({
  compact = false,
  subtitle = branding.subtitle,
  className = '',
}: BrandLockupProps) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"
      >
        <ShieldCheck size={21} strokeWidth={2} />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold tracking-tight text-slate-900">
            {branding.name}
          </span>
          <span className="block truncate text-xs text-slate-500">{subtitle}</span>
        </span>
      )}
    </div>
  )
}
