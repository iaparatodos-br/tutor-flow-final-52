import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation('common');

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-4">{t('notFound.message', 'Oops! Page not found')}</p>
        <a href="/" className="text-primary hover:text-primary/80 underline">
          {t('notFound.returnHome', 'Return to Home')}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
