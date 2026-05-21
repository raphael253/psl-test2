import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { StatementCard } from '@/components/StatementCard'
import { SearchBar } from '@/components/SearchBar'
import { SearchFilters } from './SearchFilters'
import type { SearchParams } from '@/lib/types'

interface PageProps {
  searchParams: Promise<SearchParams>
}

async function Results({ q, speaker, from, to, assertion, source_type }: SearchParams) {
  const supabase = await createClient()

  let query = supabase
    .from('statements')
    .select(`
      id,
      speaker_id,
      source_id,
      statement_date,
      extracted_text,
      assertion_type,
      verifiability,
      topic,
      raw_context,
      source_url,
      archive_link,
      status,
      llm_model_version,
      prompt_version,
      created_at,
      updated_at,
      speaker:speakers(*),
      source:sources(*)
    `)
    .neq('status', 'archived')
    .order('statement_date', { ascending: false })
    .limit(20)

  if (q) {
    // ilike sur plusieurs termes — robuste sans config FTS spécifique
    const terms = q.trim().split(/\s+/).filter(Boolean)
    for (const term of terms) {
      query = query.ilike('extracted_text', `%${term}%`)
    }
  }

  if (speaker) {
    query = query.eq('speaker_id', speaker)
  }

  if (from) {
    query = query.gte('statement_date', from)
  }

  if (to) {
    query = query.lte('statement_date', to)
  }

  if (assertion) {
    query = query.eq('assertion_type', assertion)
  }

  const { data: statements, error } = await query

  if (error) {
    console.error('Supabase search error:', JSON.stringify(error))
    return (
      <p className="py-8 text-center text-sm text-red-500">
        Erreur : {error.message}
      </p>
    )
  }

  let filtered = statements ?? []

  if (source_type && filtered.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filtered = filtered.filter((s: any) => s.source?.source_type === source_type)
  }

  if (!filtered.length) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-500">Aucun résultat pour cette recherche.</p>
        <p className="mt-1 text-sm text-slate-400">
          Essayez avec d&apos;autres mots-clés ou retirez les filtres.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
        {q && <> pour &ldquo;<span className="font-medium text-slate-700">{q}</span>&rdquo;</>}
      </p>
      <div className="space-y-3">
        {filtered.map((s) => (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <StatementCard key={s.id} statement={s as any} />
        ))}
      </div>
    </div>
  )
}

async function SpeakerOptions() {
  const supabase = await createClient()
  const { data: speakers } = await supabase
    .from('speakers')
    .select('id, full_name, function')
    .eq('status', 'active')
    .order('full_name')

  return speakers ?? []
}

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams
  const { q, speaker, from, to, assertion, source_type } = params
  const speakers = await SpeakerOptions()

  return (
    <div>
      <div className="mb-6">
        <Suspense>
          <SearchBar defaultValue={q} />
        </Suspense>
      </div>

      <div className="flex gap-6">
        {/* Filtres latéraux */}
        <aside className="w-56 shrink-0">
          <Suspense>
            <SearchFilters
              speakers={speakers}
              currentSpeaker={speaker}
              currentFrom={from}
              currentTo={to}
            />
          </Suspense>
        </aside>

        {/* Résultats */}
        <div className="min-w-0 flex-1">
          {q || speaker || from || to || assertion || source_type ? (
            <Suspense fallback={<p className="text-sm text-slate-400">Recherche…</p>}>
              <Results q={q} speaker={speaker} from={from} to={to} assertion={assertion} source_type={source_type} />
            </Suspense>
          ) : (
            <div className="py-12 text-center text-slate-400 text-sm">
              Entrez un terme de recherche pour commencer.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
