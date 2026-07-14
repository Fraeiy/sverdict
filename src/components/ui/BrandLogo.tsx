import { BRAND_LOGO, BRAND_NAME } from '../../lib/brand'

type Props = {
  size?: 'sm' | 'md' | 'lg'
  showName?: boolean
  className?: string
}

export function BrandLogo({ size = 'md', showName = true, className = '' }: Props) {
  const img =
    size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-14 w-14' : 'h-8 w-8'
  const text =
    size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-lg' : 'text-sm'

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src={BRAND_LOGO}
        alt={BRAND_NAME}
        className={`${img} shrink-0 rounded-md object-cover`}
      />
      {showName && (
        <span className={`font-data ${text} font-bold tracking-[0.04em] text-[var(--color-gold)]`}>
          {BRAND_NAME}
        </span>
      )}
    </span>
  )
}