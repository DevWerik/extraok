import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail } from 'lucide-react'
import { BrandLogo } from '@/features/landing/components/brand-logo'
import { LegalLinks } from '@/components/legal/legal-links'
import { legalContact, privacySections, termsSections } from '@/features/legal/legal-content'

export function LegalPage({ document }: { document: 'terms' | 'privacy' }) {
  const title = document === 'terms' ? 'Termos de Uso' : 'Política de Privacidade'
  const sections = document === 'terms' ? termsSections : privacySections
  useEffect(() => {
    const previous = window.document.title
    window.document.title = `${title} | ExtraOK`
    window.scrollTo(0, 0)
    return () => { window.document.title = previous }
  }, [title])
  return (
    <div className="min-h-svh bg-background text-foreground">
      <a className="sr-only focus:not-sr-only focus:block focus:p-4" href="#documento">Ir para o documento</a>
      <header className="border-b px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4">
          <BrandLogo />
          <Link to="/" className="inline-flex items-center gap-2 rounded-sm text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft aria-hidden="true" className="size-4" />Voltar ao início</Link>
        </div>
      </header>
      <main id="documento" className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Transparência e informação</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Última atualização: <time dateTime="2026-10-09">{legalContact.updatedAt}</time></p>
        <div className="mt-6 rounded-xl border bg-muted/40 p-5 text-sm leading-6">
          <p><strong>Responsável:</strong> {legalContact.name}</p>
          <a className="mt-2 inline-flex max-w-full items-center gap-2 rounded-sm break-all font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`mailto:${legalContact.email}`}><Mail aria-hidden="true" className="size-4 shrink-0" />{legalContact.email}</a>
        </div>
        <nav aria-label="Índice do documento" className="my-8 rounded-xl border p-5">
          <h2 className="font-semibold">Nesta página</h2>
          <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{sections.map(section => <li key={section.id}><a className="rounded-sm underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`#${section.id}`}>{section.title}</a></li>)}</ol>
        </nav>
        <article className="space-y-9">
          {sections.map(section => <section key={section.id} id={section.id} className="scroll-mt-6" aria-labelledby={`${section.id}-titulo`}>
            <h2 id={`${section.id}-titulo`} className="text-xl font-bold sm:text-2xl">{section.title}</h2>
            {section.paragraphs.map(paragraph => <p key={paragraph} className="mt-3 text-pretty leading-7 text-muted-foreground">{paragraph}</p>)}
            {section.items && <ul className="mt-3 list-disc space-y-3 pl-5 leading-7 text-muted-foreground">{section.items.map(item => <li key={item}>{item}</li>)}</ul>}
          </section>)}
        </article>
        <p className="mt-10 border-t pt-6 text-sm leading-6 text-muted-foreground">Contato para suporte e privacidade: <a className="break-all rounded-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`mailto:${legalContact.email}`}>{legalContact.email}</a>.</p>
      </main>
      <footer className="border-t px-4 py-7"><LegalLinks /></footer>
    </div>
  )
}
