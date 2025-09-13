import { Globe, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";

export function LanguageSelector() {
  const { i18n, t } = useTranslation('settings');

  const getLanguageLabel = () => {
    switch (i18n.language) {
      case "pt":
        return "Português";
      case "en":
        return "English";
      default:
        return "Português";
    }
  };

  const changeLanguage = (language: string) => {
    i18n.changeLanguage(language);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-2 px-3">
          <Globe className="h-4 w-4" />
          <span className="text-sm">{getLanguageLabel()}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-50 bg-background border shadow-md">
        <DropdownMenuItem onClick={() => changeLanguage("pt")} className="gap-2 cursor-pointer">
          <span className="text-sm">🇧🇷</span>
          <span>{t('preferences.language.portuguese')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeLanguage("en")} className="gap-2 cursor-pointer">
          <span className="text-sm">🇺🇸</span>
          <span>{t('preferences.language.english')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}