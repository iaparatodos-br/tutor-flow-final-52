import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Edit, 
  Users, 
  UserPlus,
  DollarSign,
  ToggleLeft,
  ToggleRight
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MonthlySubscriptionWithCount } from "@/types/monthly-subscriptions";

interface MonthlySubscriptionCardProps {
  subscription: MonthlySubscriptionWithCount;
  onEdit: (subscription: MonthlySubscriptionWithCount) => void;
  onToggleActive: (subscriptionId: string, currentActive: boolean) => void;
  onViewStudents: (subscription: MonthlySubscriptionWithCount) => void;
}

export function MonthlySubscriptionCard({
  subscription,
  onEdit,
  onToggleActive,
  onViewStudents
}: MonthlySubscriptionCardProps) {
  const { t } = useTranslation('monthlySubscriptions');

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  return (
    <Card className={`transition-opacity ${!subscription.is_active ? 'opacity-60' : ''}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          {/* Left side - Info */}
          <div className="flex-1 space-y-3">
            {/* Name and Status */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold">{subscription.name}</h3>
              <Badge variant={subscription.is_active ? "default" : "secondary"}>
                {subscription.is_active ? t('list.active') : t('list.inactive')}
              </Badge>
            </div>

            {/* Description */}
            {subscription.description && (
              <p className="text-sm text-muted-foreground">
                {subscription.description}
              </p>
            )}

            {/* Price */}
            <div className="flex items-center gap-6 text-sm flex-wrap">
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-lg">
                  {formatPrice(subscription.price)}
                </span>
                <span className="text-muted-foreground">{t('list.perMonth')}</span>
              </div>
            </div>

            {/* Students Count */}
            <div className="flex items-center gap-1.5 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {subscription.students_count > 0
                  ? t('list.studentsCount', { count: subscription.students_count })
                  : t('list.noStudents')}
              </span>
            </div>
          </div>

          {/* Right side - Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewStudents(subscription)}
            >
              {subscription.students_count > 0 ? (
                <>
                  <Users className="h-4 w-4 mr-1" />
                  {t('actions.viewStudents')}
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-1" />
                  {t('actions.assignStudent')}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleActive(subscription.id, subscription.is_active)}
            >
              {subscription.is_active ? (
                <>
                  <ToggleRight className="h-4 w-4 mr-1" />
                  {t('actions.deactivate')}
                </>
              ) : (
                <>
                  <ToggleLeft className="h-4 w-4 mr-1" />
                  {t('actions.activate')}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(subscription)}
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
