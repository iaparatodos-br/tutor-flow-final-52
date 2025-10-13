import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Construction } from "lucide-react";
import { useTranslation } from "react-i18next";

export function NotificationSettings() {
  const { t } = useTranslation('notifications');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('title')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('description')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="h-5 w-5 text-amber-500" />
            {t('inDevelopment.title')}
          </CardTitle>
          <CardDescription>
            {t('inDevelopment.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {t('inDevelopment.heading')}
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {t('inDevelopment.message')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}