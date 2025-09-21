import { Building2, ChevronDown, Plus } from "lucide-react";
import { useBusinessContext } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

export function BusinessContextSwitcher() {
  const { 
    businessProfiles, 
    selectedBusinessProfile, 
    setSelectedBusinessProfile, 
    loading 
  } = useBusinessContext();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex items-center space-x-2 px-3 py-2">
        <Building2 className="h-4 w-4" />
        <Skeleton className="h-4 w-[120px]" />
      </div>
    );
  }

  if (businessProfiles.length === 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/painel/negocios')}
        className="flex items-center space-x-2 text-muted-foreground hover:text-foreground"
      >
        <Building2 className="h-4 w-4" />
        <span>Conectar Negócio</span>
      </Button>
    );
  }

  const handleBusinessSelect = (business: typeof businessProfiles[0]) => {
    setSelectedBusinessProfile(business);
    // Force page reload to refresh data for the new business context
    window.location.reload();
  };

  const handleManageBusinesses = () => {
    navigate('/painel/negocios');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center space-x-2 hover:bg-accent hover:text-accent-foreground"
        >
          <Building2 className="h-4 w-4" />
          <span className="max-w-[150px] truncate">
            {selectedBusinessProfile?.business_name || 'Selecionar Negócio'}
          </span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[250px] bg-background border shadow-md z-50">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Negócios
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {businessProfiles.map((business) => (
          <DropdownMenuItem
            key={business.id}
            onClick={() => handleBusinessSelect(business)}
            className={`cursor-pointer ${
              selectedBusinessProfile?.id === business.id 
                ? 'bg-accent text-accent-foreground' 
                : ''
            }`}
          >
            <div className="flex flex-col space-y-1 w-full">
              <span className="font-medium truncate">
                {business.business_name}
              </span>
              {business.cnpj && (
                <span className="text-xs text-muted-foreground">
                  CNPJ: {business.cnpj}
                </span>
              )}
            </div>
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={handleManageBusinesses}
          className="cursor-pointer"
        >
          <Plus className="h-4 w-4 mr-2" />
          <span>Gerenciar Negócios</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}