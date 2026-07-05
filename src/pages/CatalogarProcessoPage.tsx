import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowLeft, Search, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { TtdCodigo, Caixa } from '@/lib/database.types'
import clsx from 'clsx'

interface ProcessoForm {
  caixa_numero: string
  setor: string
  ano_producao: string
  numero_documento: string
  interessado: string
  assunto_processo: string
  ttd_codigo_id: string
}

export function CatalogarProcessoPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<ProcessoForm>({
    caixa_numero: '', setor: '', ano_producao: '',
    numero_documento: '', interessado: '', assunto_processo: '',
    ttd_codigo_id: '',
  })
  const [ttdSearch, setTtdSearch] = useState('')
  const [selectedTtd, setSelectedTtd] = useState<TtdCodigo | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [potencialExpositivo, setPotencialExpositivo] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { data: ttdResults } = useQuery({
    queryKey: ['ttd-search', ttdSearch],
    queryFn: async () => {
      if (ttdSearch.length < 2) return []
      const { data } = await supabase
        .from('ttd_codigos')
        .select('*')
        .or(`codigo.ilike.%${ttdSearch}%,assunto.ilike.%${ttdSearch}%,serie.ilike.%${ttdSearch}%`)
        .in('status', ['vigente', 'proposta'])
        .limit(12)
      return (data ?? []) as TtdCodigo[]
    },
    enabled: ttdSearch.length >= 2,
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectTtd(ttd: TtdCodigo) {
    setSelectedTtd(ttd)
    setForm(v => ({ ...v, ttd_codigo_id: ttd.id }))
    setTtdSearch(`${ttd.codigo} — ${ttd.assunto}`)
    setShowDropdown(false)
  }

  const save = useMutation({
    mutationFn: async () => {
      // Upsert caixa
      let caixaId: string
      const { data: existing } = await supabase
        .from('caixas')
        .select('id')
        .eq('numero', form.caixa_numero)
        .single()

      if (existing) {
        caixaId = existing.id
      } else {
        const { data: newCaixa, error } = await supabase
          .from('caixas')
          .insert({ numero: form.caixa_numero, setor: form.setor } as Partial<Caixa>)
          .select('id')
          .single()
        if (error) throw error
        caixaId = newCaixa!.id
      }

      const { error } = await supabase.from('processos').insert({
        caixa_id: caixaId,
        ttd_codigo_id: form.ttd_codigo_id || null,
        numero_documento: form.numero_documento,
        interessado: form.interessado,
        assunto_processo: form.assunto_processo,
        ano_producao: form.ano_producao ? +form.ano_producao : null,
        requer_revisao_manual: !form.ttd_codigo_id,
        potencial_expositivo: potencialExpositivo,
      })
      if (error) throw error
    },
    onSuccess: () => navigate('/acervo'),
  })

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary px-2 py-2">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Catalogar Processo</h1>
      </div>

      <form
        onSubmit={e => { e.preventDefault(); save.mutate() }}
        className="card p-6 space-y-4"
      >
        {/* Caixa info */}
        <h2 className="font-semibold text-gray-800 border-b pb-2">Informações da Caixa</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Nº da Caixa *</label>
            <input className="input" value={form.caixa_numero} onChange={e => setForm(v => ({ ...v, caixa_numero: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Setor</label>
            <input className="input" value={form.setor} onChange={e => setForm(v => ({ ...v, setor: e.target.value }))} />
          </div>
          <div>
            <label className="label">Ano de produção</label>
            <input type="number" className="input" value={form.ano_producao} onChange={e => setForm(v => ({ ...v, ano_producao: e.target.value }))} />
          </div>
        </div>

        {/* TTD lookup */}
        <h2 className="font-semibold text-gray-800 border-b pb-2 pt-2">Classificação TTD</h2>
        <div ref={dropdownRef} className="relative">
          <label className="label">Buscar na TTD (código ou assunto)</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Ex: 01.01 ou Ação Fiscal…"
              value={ttdSearch}
              onChange={e => { setTtdSearch(e.target.value); setShowDropdown(true); if (!e.target.value) setSelectedTtd(null) }}
              onFocus={() => setShowDropdown(true)}
            />
          </div>
          {showDropdown && (ttdResults ?? []).length > 0 && (
            <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
              {(ttdResults ?? []).map(ttd => (
                <button
                  key={ttd.id}
                  type="button"
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b last:border-0 text-sm"
                  onClick={() => selectTtd(ttd)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-teal-600">{ttd.codigo}</span>
                    {ttd.status === 'proposta' && <span className="badge-proposta">proposta</span>}
                  </div>
                  <p className="text-gray-700 truncate">{ttd.assunto}</p>
                  <p className="text-xs text-gray-400 truncate">{ttd.serie}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Read-only TTD fields */}
        {selectedTtd && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50 rounded-xl p-3">
            <div>
              <label className="label text-gray-500">Fase corrente</label>
              <p className="text-sm font-medium text-gray-800">{selectedTtd.fase_corrente || '—'}</p>
            </div>
            <div>
              <label className="label text-gray-500">Fase intermediária</label>
              <p className="text-sm font-medium text-gray-800">{selectedTtd.fase_intermediaria || '—'}</p>
            </div>
            <div>
              <label className="label text-gray-500">Destinação final</label>
              <p className={clsx(
                'text-sm font-medium',
                selectedTtd.destinacao_final?.toLowerCase().includes('elimin')
                  ? 'text-red-600' : 'text-teal-700',
              )}>
                {selectedTtd.destinacao_final || '—'}
              </p>
            </div>
          </div>
        )}

        {/* Process info */}
        <h2 className="font-semibold text-gray-800 border-b pb-2 pt-2">Dados do Processo</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Nº do Documento *</label>
            <input className="input" value={form.numero_documento} onChange={e => setForm(v => ({ ...v, numero_documento: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Interessado</label>
            <input className="input" value={form.interessado} onChange={e => setForm(v => ({ ...v, interessado: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Assunto do processo</label>
            <textarea className="input resize-y min-h-[60px]" value={form.assunto_processo} onChange={e => setForm(v => ({ ...v, assunto_processo: e.target.value }))} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPotencialExpositivo(v => !v)}
          className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
            potencialExpositivo ? 'bg-accent-50 border-accent-300 text-accent-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50',
          )}
        >
          <Star size={16} className={potencialExpositivo ? 'fill-accent-500 text-accent-500' : ''} />
          Candidato ao Espaço Memória da CDTIV
        </button>

        {!form.ttd_codigo_id && form.numero_documento && (
          <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-800">
            Sem código TTD selecionado — o processo será marcado como <strong>requer revisão manual</strong>.
          </div>
        )}

        {save.isError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">Erro ao salvar. Tente novamente.</p>
        )}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? 'Salvando…' : 'Catalogar processo'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancelar</button>
        </div>
      </form>
    </div>
  )
}
