import { apiRequest } from '@/lib/http-client'

export async function downloadFile(path: string, filename: string): Promise<void> {
  const file = await apiRequest<Blob>(path, { responseType: 'blob' })
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Keep the object URL alive while the browser starts the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
