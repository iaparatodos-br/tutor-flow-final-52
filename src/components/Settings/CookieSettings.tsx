import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cookie, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function CookieSettings() {
  const { t } = useTranslation('settings');

  const openCookiePreferences = () => {
    const CookieConsent = (window as any).CookieConsent;
    
    if (CookieConsent && typeof CookieConsent.showPreferences === 'function') {
      CookieConsent.showPreferences();
    } else {
      toast.error(t('cookies.unavailable'));
      console.error('[CookieSettings] CookieConsent API not available');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Cookie className="h-5 w-5 text-primary" />
          <CardTitle>{t('cookies.title')}</CardTitle>
        </div>
        <CardDescription>{t('cookies.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border p-4 bg-muted/30">
          <Shield className="h-5 w-5 text-primary mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium">{t('cookies.lgpd.title')}</p>
            <p className="text-sm text-muted-foreground">
              {t('cookies.lgpd.description')}
            </p>
          </div>
        </div>

        <Button onClick={openCookiePreferences} variant="outline" className="w-full">
          <Cookie className="h-4 w-4 mr-2" />
          {t('cookies.manage')}
        </Button>

        <div className="text-xs text-muted-foreground pt-2">
          {t('cookies.info')}
        </div>
      </CardContent>
    </Card>
  );
}
