import { FileDown } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { downloadFile } from '@/lib/download'
import { apiPath } from '@/lib/http-client'
import { isServiceError } from '@/services/errors'
import { useBilling } from './billing.queries'
import { hasPlanFeature } from './plan-access'

export function JobPdfButton({ jobId }: { jobId: string }) {
  const billing = useBilling()
  const [downloading, setDownloading] = useState(false)
  async function download() {
    setDownloading(true)
    try {
      await downloadFile(`/jobs/${apiPath(jobId)}/pdf`, `atendimento-${jobId}.pdf`)
      toast.success('PDF pronto. Confira os downloads do navegador.')
    } catch (error) {
      if (isServiceError(error) && error.code === 'PLAN_FEATURE_REQUIRED') void billing.refetch()
      toast.error(isServiceError(error) ? error.message : 'Não foi possível baixar o PDF.')
    } finally {
      setDownloading(false)
    }
  }
  if (billing.isError) return <Button variant="outline" onClick={() => void billing.refetch()}>Verificar acesso ao PDF</Button>
  if (billing.isPending) return <Button variant="outline" disabled>Verificando plano...</Button>
  if (!hasPlanFeature(billing.data, 'pdfExport')) return <Button asChild variant="outline"><Link to="/meu-plano"><FileDown aria-hidden="true" className="size-4" />PDF disponível no Pro</Link></Button>
  return <Button variant="outline" disabled={downloading} onClick={() => void download()}><FileDown aria-hidden="true" className="size-4" />{downloading ? 'Gerando PDF...' : 'Baixar PDF'}</Button>
}
