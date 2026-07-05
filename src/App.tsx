import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { MinhaParte } from '@/pages/MinhaParte'
import { DemandasPage } from '@/pages/DemandasPage'
import { NovaDemandaPage } from '@/pages/NovaDemandaPage'
import { RelatoriosPage } from '@/pages/RelatoriosPage'
import { ConformidadePage } from '@/pages/ConformidadePage'
import { RiscosPage } from '@/pages/RiscosPage'
import { EquipePage } from '@/pages/EquipePage'
import { AcervoPage } from '@/pages/AcervoPage'
import { CatalogarProcessoPage } from '@/pages/CatalogarProcessoPage'
import { TtdPage } from '@/pages/TtdPage'
import { RevisaoManualPage } from '@/pages/RevisaoManualPage'
import { BoasPraticasPilarPage } from '@/pages/BoasPraticasPilarPage'
import { MemoriaPilarPage } from '@/pages/MemoriaPilarPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/minha-parte" element={<MinhaParte />} />
              <Route path="/demandas" element={<DemandasPage />} />
              <Route path="/demandas/nova" element={<NovaDemandaPage />} />
              <Route path="/relatorios" element={<RelatoriosPage />} />
              <Route path="/conformidade" element={<ConformidadePage />} />
              <Route path="/riscos" element={<RiscosPage />} />
              <Route path="/equipe" element={<EquipePage />} />
              <Route path="/acervo" element={<AcervoPage />} />
              <Route path="/acervo/catalogar" element={<CatalogarProcessoPage />} />
              <Route path="/acervo/ttd" element={<TtdPage />} />
              <Route path="/acervo/revisao" element={<RevisaoManualPage />} />
              <Route path="/pilares/boas-praticas" element={<BoasPraticasPilarPage />} />
              <Route path="/pilares/memoria" element={<MemoriaPilarPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
