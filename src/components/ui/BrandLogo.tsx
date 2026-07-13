import { BRAND_NAME } from '../../lib/brand'

type Props = {
  size?: 'sm' | 'md'
  className?: string
}

export function BrandLogo({ size = 'md', className = '' }: Props) {
  const text = size === 'sm' ? 'text-xs' : 'text-sm'
  const box = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-xs'

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className={`flex ${box} items-center justify-center rounded-md border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.12)] font-data font-bold text-[var(--color-gold)]`}>
        //
      </span>
      <span className={`font-data ${text} font-bold tracking-[0.06em] text-[var(--color-gold)]`}>
        {BRAND_NAME}
      </span>
    </span>
  )
}