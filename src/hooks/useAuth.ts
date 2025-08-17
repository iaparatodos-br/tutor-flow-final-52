// DEPRECATED: Este hook está sendo substituído pelo AuthContext
// Use o AuthContext para uma melhor gestão de estado centralizada
import { useAuth as useAuthContext } from '@/contexts/AuthContext';

export const useAuth = useAuthContext;
export type { Profile } from '@/contexts/AuthContext';