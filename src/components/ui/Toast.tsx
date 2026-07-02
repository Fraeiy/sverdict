export function Toast({ message, type = 'success' }: { message: string; type?: 'success' | 'error' | 'info' }) {
  const styles = {
    success: 'border-[rgba(251,191,36,0.45)] text-[var(--color-gold-bright)]',
    error: 'border-[rgba(248,113,113,0.45)] text-[var(--color-no)]',
    info: 'border-[rgba(245,158,11,0.45)] text-[var(--color-gold)]',
  }
  return (
    <div className={`card fixed bottom-6 right-6 z-50 max-w-sm px-5 py-3 font-data text-xs font-bold ${styles[type]}`}>
      {message}
    </div>
  )
}