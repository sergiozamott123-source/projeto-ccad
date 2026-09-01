import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RequireAcesso } from '@/components/RequireAcesso'
import { AppLayout } from '@/components/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { RedefinirSenhaPage } from '@/pages/RedefinirSenhaPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { MinhaParte } from '@/pages/MinhaParte'
import { DemandasPage } from '@/pages/DemandasPage'
import { NovaDemandaPage } from '@/pages/NovaDemandaPage'
import { RelatoriosPage } from '@/pages/RelatoriosPage'
import { RelatoriosEquipePage } from '@/pages/RelatoriosEquipePage'
import { ConformidadePage } from '@/pages/ConformidadePage'
import { RiscosPage } from '@/pages/RiscosPage'
import { EquipePage } from '@/pages/EquipePage'
import { AcervoPage } from '@/pages/AcervoPage'
import { CatalogarProcessoPage } from '@/pages/CatalogarProcessoPage'
import { TtdPage } from '@/pages/TtdPage'
import { RevisaoManualPage } from '@/pages/RevisaoManualPage'
import { BoasPraticasPilarPage } from '@/pages/BoasPraticasPilarPage'
import { MemoriaPilarPage } from '@/pages/MemoriaPilarPage'
import { DigitalizacaoPilarPage } from '@/pages/DigitalizacaoPilarPage'
import { ConfirmarEliminacoesPage } from '@/pages/ConfirmarEliminacoesPage'
import { RequisicoesAvaliacaoPage } from '@/pages/RequisicoesAvaliacaoPage'
import { ConferenciaCaixasPage } from '@/pages/ConferenciaCaixasPage'
import { WelcomePage } from '@/pages/WelcomePage'
import { ProtocoloGeralPage } from '@/pages/ProtocoloGeralPage'
import { CentralRelatoriosPage } from '@/pages/CentralRelatoriosPage'
import { BuscaProcessosPage } from '@/pages/BuscaProcessosPage'
import { PainelEmprestimosPage } from '@/pages/PainelEmprestimosPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />
          <Route element={<ProtectedRoute />}>
            <Route index element={<WelcomePage />} />
            <Route element={<AppLayout />}>
              <Route element={<RequireAcesso allow={p => p?.papel === 'coordenador' || p?.papel === 'coordenador_substituto' || p?.papel === 'apoio_tecnico'} />}>
                <Route path="/dashboard" element={<DashboardPage />} />
              </Route>
              <Route element={<RequireAcesso allow={p => p?.papel === 'coordenador' || p?.papel === 'coordenador_substituto' || p?.acesso_busca_emprestimos === true} />}>
                <Route path="/busca-processos" element={<BuscaProcessosPage />} />
                <Route path="/painel-emprestimos" element={<PainelEmprestimosPage />} />
              </Route>
              <Route path="/minha-parte" element={<MinhaParte />} />
              <Route path="/demandas" element={<DemandasPage />} />
              <Route path="/demandas/nova" element={<NovaDemandaPage />} />
              <Route path="/relatorios" element={<RelatoriosPage />} />
              <Route element={<RequireAcesso allow={p => p?.papel === 'coordenador'} />}>
                <Route path="/relatorios-equipe" element={<RelatoriosEquipePage />} />
              </Route>
              <Route path="/conformidade" element={<ConformidadePage />} />
              <Route path="/riscos" element={<RiscosPage />} />
              <Route element={<RequireAcesso allow={p => p?.papel === 'coordenador' || p?.papel === 'coordenador_substituto'} />}>
                <Route path="/equipe" element={<EquipePage />} />
              </Route>
              <Route element={<RequireAcesso allow={p => p?.papel === 'coordenador' || p?.papel === 'coordenador_substituto'} />}>
                <Route path="/acervo" element={<AcervoPage />} />
                <Route path="/acervo/catalogar" element={<CatalogarProcessoPage />} />
                <Route path="/acervo/ttd" element={<TtdPage />} />
                <Route path="/acervo/revisao" element={<RevisaoManualPage />} />
              </Route>
              <Route element={<RequireAcesso allow={p => p?.papel === 'coordenador' || p?.papel === 'coordenador_substituto' || p?.acesso_protocolo_geral === true} />}>
                <Route path="/protocolo-geral" element={<ProtocoloGeralPage />} />
                <Route path="/protocolo-geral/catalogar" element={<CatalogarProcessoPage />} />
                <Route path="/protocolo-geral/ttd" element={<TtdPage />} />
                <Route path="/protocolo-geral/revisao" element={<RevisaoManualPage />} />
              </Route>
              <Route element={<RequireAcesso allow={p => p?.papel === 'coordenador' || p?.papel === 'coordenador_substituto'} />}>
                <Route path="/confirmar-eliminacoes" element={<ConfirmarEliminacoesPage />} />
              </Route>
              <Route element={<RequireAcesso allow={p => p?.papel === 'coordenador' || p?.papel === 'coordenador_substituto' || p?.pode_criar_requisicoes === true} />}>
                <Route path="/requisicoes-avaliacao" element={<RequisicoesAvaliacaoPage />} />
                <Route path="/conferencia-caixas" element={<ConferenciaCaixasPage />} />
              </Route>
              <Route path="/pilares/boas-praticas" element={<BoasPraticasPilarPage />} />
              <Route path="/pilares/memoria" element={<MemoriaPilarPage />} />
              <Route path="/pilares/digitalizacao" element={<DigitalizacaoPilarPage />} />
              <Route element={<RequireAcesso allow={p => p?.papel === 'coordenador' || p?.papel === 'coordenador_substituto'} />}>
                <Route path="/central-relatorios" element={<CentralRelatoriosPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
