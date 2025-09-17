import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

function Index() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // Verifica se a URL indica um fluxo de recuperação de senha.
    // Se for o caso, este componente não deve fazer nada,
    // pois o listener global em App.tsx cuidará da navegação.
    const isPasswordRecovery = location.hash.includes('type=recovery')
    if (isPasswordRecovery) {
      return
    }

    // Lógica de redirecionamento padrão para usuários logados ou deslogados
    if (user) {
      navigate('/dashboard')
    } else {
      navigate('/auth')
    }
  }, [user, navigate, location.hash])

  return null
}

export default Index