import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_TIMEZONE } from '@/utils/timezone';

const SESSION_STORAGE_KEY = 'tz-sync-dismissed';

/**
 * Hook que sincroniza o fuso horário do browser com o perfil do utilizador.
 *
 * Comportamento:
 * - Roda após o login (quando profile está disponível).
 * - Compara o timezone do browser (Intl) com profile.timezone.
 * - Se forem diferentes, mostra um toast perguntando se quer atualizar.
 * - Usa sessionStorage para não repetir o aviso se o utilizador recusar.
 */
export function useTimezoneSync() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const hasChecked = useRef(false);

  useEffect(() => {
    if (!profile?.id || hasChecked.current) return;
    hasChecked.current = true;

    const browserTimezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
    const profileTimezone = profile.timezone || DEFAULT_TIMEZONE;

    // Se já são iguais, nada a fazer
    if (browserTimezone === profileTimezone) return;

    // Se já recusou nesta sessão, não perguntar de novo
    const dismissed = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (dismissed === browserTimezone) return;

    // Mostrar toast com ação
    const { dismiss } = toast({
      title: 'Fuso horário diferente detectado',
      description: `Seu navegador está em "${browserTimezone}", mas seu perfil usa "${profileTimezone}". Deseja atualizar?`,
      duration: 15000,
      action: (
        <div className="flex gap-2">
          <button
            className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            onClick={async () => {
              try {
                const { error } = await supabase
                  .from('profiles')
                  .update({ timezone: browserTimezone })
                  .eq('id', profile.id);

                if (error) throw error;

                dismiss();
                toast({
                  title: 'Fuso horário atualizado',
                  description: `Seu perfil agora usa "${browserTimezone}".`,
                });

                window.location.reload();
              } catch (err) {
                console.error('useTimezoneSync: erro ao atualizar timezone', err);
                toast({
                  title: 'Erro',
                  description: 'Não foi possível atualizar o fuso horário.',
                  variant: 'destructive',
                });
              }
            }}
          >
            Atualizar
          </button>
          <button
            className="rounded border border-input px-3 py-1 text-xs font-medium hover:bg-accent"
            onClick={() => {
              sessionStorage.setItem(SESSION_STORAGE_KEY, browserTimezone);
              dismiss();
            }}
          >
            Manter
          </button>
        </div>
      ),
    });
  }, [profile, toast]);
}
