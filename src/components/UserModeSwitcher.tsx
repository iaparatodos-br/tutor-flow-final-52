import { ChevronDown, GraduationCap, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUserMode } from "@/contexts/UserModeContext";
import { Badge } from "@/components/ui/badge";

export function UserModeSwitcher() {
  const { currentMode, availableModes, canSwitchMode, switchMode, loading } = useUserMode();

  if (loading || !canSwitchMode) {
    return null;
  }

  const getModeIcon = (mode: string) => {
    return mode === 'professor' ? <GraduationCap className="h-4 w-4" /> : <Users className="h-4 w-4" />;
  };

  const getModeLabel = (mode: string) => {
    return mode === 'professor' ? 'Professor' : 'Estudante';
  };

  const getModeColor = (mode: string) => {
    return mode === 'professor' ? 'default' : 'secondary';
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 justify-between min-w-[140px]">
          <div className="flex items-center gap-2">
            {getModeIcon(currentMode)}
            <span className="text-sm font-medium">{getModeLabel(currentMode)}</span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[160px]" align="end">
        {availableModes.map((mode) => (
          <DropdownMenuItem
            key={mode}
            onClick={() => switchMode(mode)}
            className={currentMode === mode ? "bg-accent" : ""}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {getModeIcon(mode)}
                <span className="text-sm">{getModeLabel(mode)}</span>
              </div>
              {currentMode === mode && (
                <Badge variant={getModeColor(mode)} className="text-xs">
                  Ativo
                </Badge>
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}