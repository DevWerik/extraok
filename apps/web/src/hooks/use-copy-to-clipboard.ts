import { useCallback, useState } from 'react'

export function useCopyToClipboard(resetAfterMs = 2200) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(
    async (text: string) => {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }

      setCopied(true)
      window.setTimeout(() => setCopied(false), resetAfterMs)
    },
    [resetAfterMs],
  )

  return { copy, copied }
}
