// Supabase Edge Function — runs on a cron schedule every day at 00:05
// Schedule: "5 0 21 * *"  (21st of each month at 00:05 UTC)
// Set up in Supabase Dashboard → Edge Functions → Schedule

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const today = new Date()
  // Only run on the 21st
  if (today.getDate() !== 21) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 })
  }

  // Previous month as YYYY-MM-01
  const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const mesRef = prevMonth.toISOString().slice(0, 7) + '-01'

  // Get all active members
  const { data: members } = await supabase
    .from('usuarios')
    .select('id')
    .in('papel', ['membro', 'responsavel_pilar'])
    .eq('status', 'ativo')

  if (!members?.length) {
    return new Response(JSON.stringify({ marked: 0 }), { status: 200 })
  }

  const memberIds = members.map(m => m.id)

  // Get members who sent their report
  const { data: sent } = await supabase
    .from('relatorios_mensais')
    .select('usuario_id')
    .eq('mes_referencia', mesRef)
    .eq('status', 'enviado')

  const sentIds = new Set((sent ?? []).map(r => r.usuario_id))
  const lateIds = memberIds.filter(id => !sentIds.has(id))

  if (!lateIds.length) {
    return new Response(JSON.stringify({ marked: 0 }), { status: 200 })
  }

  // Upsert atrasado for each missing member
  const upserts = lateIds.map(uid => ({
    usuario_id: uid,
    mes_referencia: mesRef,
    status: 'atrasado',
    atividades_realizadas: '',
    dificuldades: '',
    horas_dedicadas: 0,
    evidencias_urls: [],
    demandas_relacionadas: [],
  }))

  const { error } = await supabase
    .from('relatorios_mensais')
    .upsert(upserts, { onConflict: 'usuario_id,mes_referencia', ignoreDuplicates: false })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ marked: lateIds.length }), { status: 200 })
})
