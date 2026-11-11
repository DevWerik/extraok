import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { QueryClient, QueryObserver, focusManager, onlineManager } from '@tanstack/react-query'
import { canRefreshQuery, manualRetryOptions } from '../src/lib/query-retry.ts'
import { ServiceError } from '../src/services/errors.ts'

for (const status of [0, 429, 503]) {
  test(`falha ${status} aguarda ação manual após remontagem, foco e reconexão`, async () => {
    const client = new QueryClient({ defaultOptions: { queries: { ...manualRetryOptions, gcTime: Infinity } } })
    client.mount()
    let requests = 0
    let available = false
    const options = {
      queryKey: ['manual-retry', status],
      queryFn: async () => {
        requests += 1
        if (!available) throw new ServiceError('Indisponível', 'INTERNAL_ERROR', status)
        return { available: true }
      },
    }
    const observer = new QueryObserver(client, options)
    let unsubscribe = observer.subscribe(() => {})
    try {
      await setImmediate()
      assert.equal(observer.getCurrentResult().status, 'error')
      assert.equal(requests, 1)
      unsubscribe()
      available = true
      const remounted = new QueryObserver(client, options)
      unsubscribe = remounted.subscribe(() => {})
      focusManager.setFocused(false)
      focusManager.setFocused(true)
      onlineManager.setOnline(false)
      onlineManager.setOnline(true)
      await setImmediate()
      assert.equal(requests, 1, 'nenhum evento de ciclo de vida repete o erro')
      const result = await remounted.refetch()
      assert.deepEqual(result.data, { available: true })
      assert.equal(requests, 2, 'clique manual permite exatamente uma consulta')
    } finally {
      unsubscribe()
      client.unmount()
      client.clear()
      focusManager.setFocused(undefined)
      onlineManager.setOnline(true)
    }
  })
}

test('falha ao atualizar dados existentes permanece manual inclusive após expiração de um Pix', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { ...manualRetryOptions, gcTime: Infinity } } })
  const key = ['billing', 'summary']
  client.setQueryData(key, { plan: 'pro' })
  let requests = 0
  const options = {
    queryKey: key,
    queryFn: async () => {
      requests += 1
      throw new ServiceError('Aguarde', 'RATE_LIMITED', 429)
    },
    refetchOnWindowFocus: canRefreshQuery,
    refetchInterval: (query: Parameters<typeof canRefreshQuery>[0]) => canRefreshQuery(query) ? 30_000 : false,
  }
  const observer = new QueryObserver(client, options)
  let unsubscribe = observer.subscribe(() => {})
  try {
    await setImmediate()
    assert.deepEqual(observer.getCurrentResult().data, { plan: 'pro' })
    assert.equal(observer.getCurrentResult().status, 'error')
    assert.equal(options.refetchInterval(client.getQueryCache().find({ queryKey: key })!), false)
    await client.invalidateQueries({ queryKey: key, predicate: canRefreshQuery })
    unsubscribe()
    unsubscribe = new QueryObserver(client, options).subscribe(() => {})
    await setImmediate()
    assert.equal(requests, 1, 'dados em cache não escondem o erro nem reativam a consulta')
    await observer.refetch()
    assert.equal(requests, 2)
  } finally {
    unsubscribe()
    client.clear()
  }
})
