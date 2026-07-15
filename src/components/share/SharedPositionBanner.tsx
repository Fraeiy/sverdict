import { BRAND_NAME } from '../../lib/brand'
import type { PositionShareParams } from '../../lib/share'
import { fmtUct } from '../../lib/format'

type Props = {
  params: PositionShareParams
  question: string
}

export function SharedPositionBanner({ params, question }: Props) {
  const trader = params.by?.replace(/^@/, '')
  const side = params.side.toUpperCase()
  const resolved = !!params.resolved

  return (
    <div className="card mb-6 border-[rgba(245,158,11,0.3)] p-4">
      <p className="label-caps text-[var(--color-gold)]">
        {resolved ? 'Shared result' : 'Shared position'}
      </p>
      <p className="mt-2 text-sm text-[var(--color-text-2)]">
        {trader ? (
          <>
            @{trader} shared a <strong className="text-[var(--color-text)]">{side}</strong>{' '}
            {resolved ? 'result' : 'position'} on {BRAND_NAME}
          </>
        ) : (
          <>
            Someone shared a <strong className="text-[var(--color-text)]">{side}</strong>{' '}
            {resolved ? 'result' : 'position'}
          </>
        )}
      </p>
      <p className="mt-2 line-clamp-2 font-medium">{question}</p>
      <div className="mt-4 flex flex-wrap gap-4 font-data text-[11px]">
        <span>Staked <strong>{fmtUct(params.stake)}</strong></span>
        {params.value != null && (
          <span>
            {resolved ? 'Payout' : 'Est.'}{' '}
            <strong className="text-[var(--color-gold)]">{fmtUct(params.value)}</strong>
          </span>
        )}
        <span className={params.pnl >= 0 ? 'text-[var(--color-yes)]' : 'text-[var(--color-no)]'}>
          {resolved ? 'Realized PnL' : 'PnL'}{' '}
          <strong>{params.pnl >= 0 ? '+' : ''}{fmtUct(params.pnl)}</strong>
        </span>
      </div>
    </div>
  )
}