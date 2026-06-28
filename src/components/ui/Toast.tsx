export function Toast({ message, type = 'success' }: { message: string; type?: 'success' | 'error' | 'info' }) {
  const colors = {
    success: 'bg-emerald-600',
    error: 'bg-rose-600',
    info: 'bg-blue-600',
  }
  return (
    <div className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl px-5 py-3 text-sm font-medium shadow-2xl ${colors[type]}`}>
      {message}
    </div>
  )
}