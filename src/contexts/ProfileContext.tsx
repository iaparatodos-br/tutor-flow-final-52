import { createContext, useContext, ReactNode } from 'react';

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  role: 'professor' | 'aluno';
  teacher_id?: string | null;
}

interface ProfileContextType {
  profile: Profile | null;
  isProfessor: boolean;
  isAluno: boolean;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

interface ProfileProviderProps {
  children: ReactNode;
  profile: Profile | null;
  isProfessor: boolean;
  isAluno: boolean;
}

export function ProfileProvider({ children, profile, isProfessor, isAluno }: ProfileProviderProps) {
  return (
    <ProfileContext.Provider value={{ profile, isProfessor, isAluno }}>
      {children}
    </ProfileContext.Provider>
  );
}

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    console.error('useProfile: ERRO - ProfileContext não encontrado!');
    console.error('useProfile: Stack trace completo:', new Error().stack);
    console.error('useProfile: Componente tentando usar useProfile fora do ProfileProvider');
    throw new Error('useProfile deve ser usado dentro de um ProfileProvider');
  }
  return context;
};