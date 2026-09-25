import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { BookOpen, Lock, Mail } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface LoginForm { email: string; password: string }

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<LoginForm>()

  const [modo, setModo] = useState<'login' | 'recuperar'>('login')
  const [recuperarEmail, setRecuperarEmail] = useState('')
  const [recuperarMsg, setRecuperarMsg] = useState('')
  const [recuperarErro, setRecuperarErro] = useState('')
  const [recuperarLoading, setRecuperarLoading] = useState(false)

  async function onSubmit(values: LoginForm) {
    setServerError('')
    const { error } = await signIn(values.email, values.password)
    if (error) {
      setServerError('E-mail ou senha incorretos.')
    } else {
      navigate('/')
    }
  }

  function abrirRecuperar() {
    setRecuperarEmail(watch('email') || '')
    setRecuperarMsg('')
    setRecuperarErro('')
    setModo('recuperar')
  }

  async function onSubmitRecuperar(e: React.FormEvent) {
    e.preventDefault()
    setRecuperarErro('')
    setRecuperarMsg('')
    setRecuperarLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(recuperarEmail, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    setRecuperarLoading(false)
    if (error) {
      setRecuperarErro('Não foi possível enviar o e-mail agora. Tente novamente em instantes.')
    } else {
      setRecuperarMsg('Se esse e-mail estiver cadastrado, enviamos um link de redefinição de senha. Confira sua caixa de entrada.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-600 px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-500 mb-4">
            <BookOpen size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Plataforma CCAD</h1>
          <p className="text-white/50 text-sm mt-1">Comissão Central de Avaliação de Documentos</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {modo === 'login' ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Entrar</h2>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="label">E-mail</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      className="input pl-9"
                      placeholder="seu@email.com"
                      {...register('email', { required: 'E-mail obrigatório' })}
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
                </div>

                <div>
                  <label className="label">Senha</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="password"
                      className="input pl-9"
                      placeholder="••••••••"
                      {...register('password', { required: 'Senha obrigatória' })}
                    />
                  </div>
                  {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
                </div>

                {serverError && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{serverError}</p>
                )}

                <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center py-2.5">
                  {isSubmitting ? 'Entrando…' : 'Entrar'}
                </button>

                <button
                  type="button"
                  onClick={abrirRecuperar}
                  className="block w-full text-center text-xs text-gray-400 hover:text-gray-600 hover:underline"
                >
                  Esqueceu sua senha?
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Recuperar senha</h2>

              <form onSubmit={onSubmitRecuperar} className="space-y-4">
                <div>
                  <label className="label">E-mail</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      required
                      className="input pl-9"
                      placeholder="seu@email.com"
                      value={recuperarEmail}
                      onChange={e => setRecuperarEmail(e.target.value)}
                    />
                  </div>
                </div>

                {recuperarMsg && (
                  <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{recuperarMsg}</p>
                )}
                {recuperarErro && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{recuperarErro}</p>
                )}

                <button type="submit" disabled={recuperarLoading} className="btn-primary w-full justify-center py-2.5">
                  {recuperarLoading ? 'Enviando…' : 'Enviar link de redefinição'}
                </button>

                <button
                  type="button"
                  onClick={() => setModo('login')}
                  className="block w-full text-center text-xs text-gray-400 hover:text-gray-600 hover:underline"
                >
                  Voltar para o login
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
