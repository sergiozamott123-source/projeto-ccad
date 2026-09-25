import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export function RedefinirSenhaPage() {
  const navigate = useNavigate()
  const [checandoSessao, setChecandoSessao] = useState(true)
  const [sessaoValida, setSessaoValida] = useState(false)

  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessaoValida(!!data.session)
      setChecandoSessao(false)
    })
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    if (novaSenha.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não coincidem.')
      return
    }

    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setSalvando(false)

    if (error) {
      setErro('Não foi possível salvar a nova senha. Tente novamente.')
    } else {
      setSucesso(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-600 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-500 mb-4">
            <BookOpen size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Plataforma CCAD</h1>
          <p className="text-white/50 text-sm mt-1">Comissão Central de Avaliação de Documentos</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {checandoSessao ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500" />
            </div>
          ) : !sessaoValida ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Link inválido</h2>
              <p className="text-sm text-gray-500 mb-6">
                Link inválido ou expirado. Solicite uma nova redefinição de senha na tela de login.
              </p>
              <Link to="/login" className="btn-primary w-full justify-center py-2.5">
                Ir para o login
              </Link>
            </>
          ) : sucesso ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Senha atualizada</h2>
              <p className="text-sm text-gray-500 mb-6">
                Sua senha foi redefinida com sucesso.
              </p>
              <button onClick={() => navigate('/dashboard')} className="btn-primary w-full justify-center py-2.5">
                Ir para o painel
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Definir nova senha</h2>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="label">Nova senha</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="password"
                      className="input pl-9"
                      placeholder="••••••••"
                      value={novaSenha}
                      onChange={e => setNovaSenha(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Confirmar nova senha</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="password"
                      className="input pl-9"
                      placeholder="••••••••"
                      value={confirmarSenha}
                      onChange={e => setConfirmarSenha(e.target.value)}
                    />
                  </div>
                </div>

                {erro && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>
                )}

                <button type="submit" disabled={salvando} className="btn-primary w-full justify-center py-2.5">
                  {salvando ? 'Salvando…' : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          CDTIV — Cia de Desenvolvimento, Turismo e Inovação de Vitória
        </p>
      </div>
    </div>
  )
}
