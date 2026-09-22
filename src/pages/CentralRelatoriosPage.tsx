import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { FileText, FileSearch, FileBarChart } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { RelatoriosPage } from '@/pages/RelatoriosPage'
import { RelatoriosEquipePage } from '@/pages/RelatoriosEquipePage'
import { RelatoriosDiversosTab } from '@/pages/RelatoriosDiversosTab'
import clsx from 'clsx'

type AbaRelatorios = 'mensais' | 'equipe' | 'diversos'

// Antes desta reorganização (plano em claude/plano-central-relatorios.md,
// Etapa 1), "Relatórios", "Relatórios da Equipe" e "Central de Relatórios"
// eram 3 itens de menu separados. Agora são 3 abas de uma única página, para
// juntar "tudo que envolve relatórios" num só lugar, como pedido pelo Sérgio.
//
// Cuidado importante preservado aqui: a aba "Meus Relatórios Mensais" é
// visível para QUALQUER usuário logado (é onde qualquer membro entrega o
// próprio relatório do mês) — só "Relatórios da Equipe" e "Relatórios
// Diversos" ficam restritas a quem já é Coordenação (`isCoord`), exatamente
// como já era antes. Sem essa distinção, unificar o menu tiraria dos membros
// comuns o acesso para entregar o relatório mensal deles.
export function CentralRelatoriosPage() {
  const { isCoord } = useAuth()
  const location = useLocation()

  // As rotas antigas /relatorios e /relatorios-equipe agora redirecionam
  // para cá (ver App.tsx) passando qual aba deveria abrir, para não quebrar
  // links ou favoritos que apontem para os endereços antigos.
  const abaInicial = (location.state as { abaInicial?: AbaRelatorios } | null)?.abaInicial
  const abaInicialValida = (abaInicial === 'equipe' || abaInicial === 'diversos') && isCoord
  const [aba, setAba] = useState<AbaRelatorios>(abaInicialValida ? abaInicial! : 'mensais')

  function tabClass(ativa: boolean) {
    return clsx(
      'flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
      ativa ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700',
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Central de Relatórios</h1>
        <p className="text-gray-500 text-sm mt-0.5">Tudo que envolve relatórios da CCAD, reunido em um só lugar.</p>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-gray-200">
        <button type="button" onClick={() => setAba('mensais')} className={tabClass(aba === 'mensais')}>
          <FileText size={15} /> Meus Relatórios Mensais
        </button>
        {isCoord && (
          <button type="button" onClick={() => setAba('equipe')} className={tabClass(aba === 'equipe')}>
            <FileSearch size={15} /> Relatórios da Equipe
          </button>
        )}
        {isCoord && (
          <button type="button" onClick={() => setAba('diversos')} className={tabClass(aba === 'diversos')}>
            <FileBarChart size={15} /> Relatórios Diversos
          </button>
        )}
      </div>

      {aba === 'mensais' && <RelatoriosPage />}
      {aba === 'equipe' && isCoord && <RelatoriosEquipePage />}
      {aba === 'diversos' && isCoord && <RelatoriosDiversosTab />}
    </div>
  )
}
