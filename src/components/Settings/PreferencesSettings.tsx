import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { Palette, Monitor, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

export function PreferencesSettings() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            {t('preferences.title')}
          </CardTitle>
          <CardDescription>
            {t('preferences.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="theme">{t('preferences.theme.title')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('preferences.theme.description')}
              </p>
            </div>
            <ThemeToggle />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="language">{t('preferences.language.title')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('preferences.language.description')}
              </p>
            </div>
            <LanguageSelector />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            {t('preferences.interface.title')}
          </CardTitle>
          <CardDescription>
            {t('preferences.interface.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('preferences.interface.moreOptions')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}