/**
 * Seed script — populates ttd_codigos, caixas, and processos from CSV files.
 * Usage:
 *   1. Copy .env.local values into a .env.seed file (or export as env vars):
 *      SUPABASE_URL=https://xxx.supabase.co
 *      SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   2. Run: node scripts/seed.mjs
 *
 * Idempotent: re-running will upsert existing rows by codigo (TTD)
 * and skip duplicate caixas/processos.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { parse } from './csv-parse.mjs'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running seed.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ──────────────────────────────────────────────
// 1. Seed TTD
// ──────────────────────────────────────────────
console.log('🌱 Seeding ttd_codigos…')

const ttdRaw = readFileSync('./ttd_seed.csv', 'utf-8')
const ttdRows = parse(ttdRaw)

const ttdRecords = ttdRows.map(r => ({
  codigo:             (r.codigo ?? '').trim(),
  classe:             (r.classe ?? '').trim(),
  serie:              (r.serie ?? '').trim(),
  assunto:            (r.assunto ?? '').trim(),
  especie:            (r.especie ?? '').trim(),
  fase_corrente:      (r.fase_corrente ?? '').trim(),
  fase_intermediaria: (r.fase_intermediaria ?? '').trim(),
  destinacao_final:   (r.destinacao_final ?? '').trim(),
  legislacao:         (r.legislacao ?? '').trim(),
  observacao:         (r.observacao ?? '').trim(),
  status:             ['vigente','proposta','descontinuado'].includes((r.status ?? '').trim())
                        ? r.status.trim()
                        : 'vigente',
  versao:             1,
})).filter(r => r.codigo)

const BATCH = 200
for (let i = 0; i < ttdRecords.length; i += BATCH) {
  const batch = ttdRecords.slice(i, i + BATCH)
  const { error } = await supabase
    .from('ttd_codigos')
    .upsert(batch, { onConflict: 'codigo,versao' })
  if (error) { console.error('TTD batch error:', error); process.exit(1) }
  process.stdout.write(`\r  ${Math.min(i + BATCH, ttdRecords.length)}/${ttdRecords.length}`)
}
console.log(`\n✅ ${ttdRecords.length} TTD codes upserted.`)

// Build in-memory map: codigo → id
const { data: allTtd } = await supabase.from('ttd_codigos').select('id,codigo,versao').eq('versao', 1)
const ttdMap = Object.fromEntries((allTtd ?? []).map(t => [t.codigo, t.id]))

// ──────────────────────────────────────────────
// 2. Seed caixas + processos
// ──────────────────────────────────────────────
console.log('🌱 Seeding caixas and processos…')

const procRaw = readFileSync('./processos_seed.csv', 'utf-8')
const procRows = parse(procRaw)

// Deduplicate caixas
const caixaMap = new Map() // numero → { numero, setor }
for (const r of procRows) {
  const num = (r.caixa ?? '').trim()
  if (num && !caixaMap.has(num)) {
    caixaMap.set(num, { numero: num, setor: (r.setor ?? '').trim() })
  }
}

const caixasArr = [...caixaMap.values()]
console.log(`  Inserting ${caixasArr.length} unique caixas…`)

for (let i = 0; i < caixasArr.length; i += BATCH) {
  const batch = caixasArr.slice(i, i + BATCH)
  const { error } = await supabase
    .from('caixas')
    .upsert(batch, { onConflict: 'numero', ignoreDuplicates: true })
  if (error) { console.error('Caixas batch error:', error); process.exit(1) }
}
console.log('✅ Caixas inserted.')

// Fetch inserted caixas to get ids
const { data: caixasDb } = await supabase.from('caixas').select('id,numero')
const caixaIdMap = Object.fromEntries((caixasDb ?? []).map(c => [c.numero, c.id]))

// Build processos
const processoRecords = procRows.map(r => {
  const caixaNum = (r.caixa ?? '').trim()
  const caixaId = caixaIdMap[caixaNum]
  if (!caixaId) return null

  const codigoNorm = (r.codigo_normalizado ?? '').trim()
  const isValid = (r.codigo_valido_na_ttd ?? '').trim().toLowerCase() === 'sim'
  const revisaoManual = (r.requer_revisao_manual ?? '').trim().toLowerCase() === 'sim'
  const ttdId = isValid && codigoNorm ? (ttdMap[codigoNorm] ?? null) : null

  const ano = parseFloat(r.ano_producao ?? '')

  return {
    caixa_id:           caixaId,
    ttd_codigo_id:      ttdId,
    numero_documento:   (r.numero_documento_processo ?? '').trim(),
    interessado:        (r.interessado ?? '').trim(),
    assunto_processo:   (r.assunto_processo ?? '').trim(),
    ano_producao:       isNaN(ano) ? null : Math.floor(ano),
    requer_revisao_manual: revisaoManual || !ttdId,
  }
}).filter(Boolean)

console.log(`  Inserting ${processoRecords.length} processos…`)

for (let i = 0; i < processoRecords.length; i += BATCH) {
  const batch = processoRecords.slice(i, i + BATCH)
  const { error } = await supabase.from('processos').insert(batch)
  if (error) { console.error('Processos batch error at', i, error); process.exit(1) }
  process.stdout.write(`\r  ${Math.min(i + BATCH, processoRecords.length)}/${processoRecords.length}`)
}

const validCount = processoRecords.filter(p => p && !p.requer_revisao_manual).length
const revisaoCount = processoRecords.filter(p => p && p.requer_revisao_manual).length
console.log(`\n✅ ${processoRecords.length} processos inserted (${validCount} com TTD, ${revisaoCount} para revisão manual).`)
console.log('\n🎉 Seed concluído!')
