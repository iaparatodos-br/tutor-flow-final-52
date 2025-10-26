import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const CookieSettings = () => {
  const { t } = useTranslation('settings');

  const handleOpenCookieSettings = () => {
    // A biblioteca expõe a API globalmente
    const cookieConsentAPI = (window as any).CookieConsent;
    if (cookieConsentAPI && typeof cookieConsentAPI.showPreferences === 'function') {
      cookieConsentAPI.showPreferences();
    } else {
      console.error('CookieConsent não está inicializado');
      toast.error('Aguarde um momento e tente novamente. O sistema de cookies ainda está carregando.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cookie className="h-5 w-5" />
          {t('cookies.title')}
        </CardTitle>
        <CardDescription>
          {t('cookies.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('cookies.info')}
        </p>
        <Button 
          variant="outline" 
          onClick={handleOpenCookieSettings}
          className="w-full sm:w-auto"
        >
          <Cookie className="mr-2 h-4 w-4" />
          {t('cookies.manage')}
        </Button>
      </CardContent>
    </Card>
  );
};
