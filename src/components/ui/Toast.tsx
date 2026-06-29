export function Toast({ message, type = 'success' }: { message: string; type?: 'success' | 'error' | 'info' }) {
  const styles = {
    success: 'border-[rgba(80,200,120,0.4)] text-[var(--color-yes)]',
    error: 'border-[rgba(232,93,111,0.4)] text-[var(--color-no)]',
    info: 'border-[rgba(212,168,67,0.4)] text-[var(--color-gold)]',
  }
  return (
    <div className={`card fixed bottom-6 right-6 z-50 max-w-sm px-5 py-3 font-data text-xs font-bold ${styles[type]}`}>
      {message}
    </div>
  )
}