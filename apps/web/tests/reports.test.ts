import assert from 'node:assert/strict'
import test from 'node:test'
import { hasPlanFeature } from '../src/features/billing/plan-access.ts'
import { reportDateError, reportMonthDates } from '../src/features/reports/report.utils.ts'
import type { BillingSummary } from '../src/features/billing/billing.types.ts'
import worker from '../worker/index.ts'

test('interface não libera recurso com resumo ausente, período futuro ou vencido', () => {
  const start = Date.parse('2026-09-01T03:00:00Z')
  const end = Date.parse('2026-10-01T03:00:00Z')
  const summary = { current: { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), features: { pdfExport: true, csvExport: false } } } as BillingSummary
  assert.equal(hasPlanFeature(undefined, 'pdfExport', start), false)
  assert.equal(hasPlanFeature(summary, 'pdfExport', start - 1), false)
  assert.equal(hasPlanFeature(summary, 'pdfExport', start), true)
  assert.equal(hasPlanFeature(summary, 'csvExport', start), false)
  assert.equal(hasPlanFeature(summary, 'pdfExport', end), false)
})

test('filtros iniciais respeitam Brasília e impedem intervalo invertido ou extenso', () => {
  assert.deepEqual(reportMonthDates(new Date('2026-10-01T02:59:59Z')), { from: '2026-09-01', to: '2026-09-30' })
  assert.deepEqual(reportMonthDates(new Date('2026-10-01T03:00:00Z')), { from: '2026-10-01', to: '2026-10-01' })
  assert.equal(reportDateError('2024-01-01', '2024-12-31'), null)
  for (const [from, to] of [['', '2026-09-01'], ['2026-09-02', '2026-09-01'], ['2025-01-01', '2026-01-02']]) assert.ok(reportDateError(from, to))
})

test('isenção libera recursos sem datas; campos de assinatura nulos não liberam outra conta', () => {
  const summary = { current: { billingExempt: true, planId: 'business', features: { pdfExport: true, advancedReports: true, csvExport: true }, used: 205, limit: null, remaining: null, startsAt: null, endsAt: null } } as BillingSummary
  for (const feature of ['pdfExport', 'advancedReports', 'csvExport'] as const) {
    assert.equal(hasPlanFeature(summary, feature, Date.parse('2036-01-01')), true)
    assert.equal(hasPlanFeature({ ...summary, current: { ...summary.current, billingExempt: false } } as BillingSummary, feature), false)
  }
  assert.equal(hasPlanFeature({ ...summary, current: { ...summary.current, features: { pdfExport: false, advancedReports: true, csvExport: true } } }, 'pdfExport'), false)
})

test('proxy transmite arquivos privados sem alterar bytes ou cabeçalhos de download', async (context) => {
  const bytes = new Uint8Array([37, 80, 68, 70, 45, 0, 128, 255])
  context.mock.method(globalThis, 'fetch', async () => new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="atendimento.pdf"' } }))
  const response = await worker.fetch(new Request('https://app.example.test/api/v1/jobs/test/pdf'), { API_ORIGIN: 'https://api.example.test', ASSETS: { fetch: async () => new Response('SPA') } })
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes)
  assert.equal(response.headers.get('content-type'), 'application/pdf')
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="atendimento.pdf"')
  assert.equal(response.headers.get('cache-control'), 'no-store')
})
