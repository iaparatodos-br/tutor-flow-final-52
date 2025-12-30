import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Loader2, Info } from "lucide-react";
import { 
  monthlySubscriptionSchema, 
  type MonthlySubscriptionFormSchema 
} from "@/schemas/monthly-subscription.schema";
import type { MonthlySubscriptionWithCount } from "@/types/monthly-subscriptions";

interface MonthlySubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  subscription?: MonthlySubscriptionWithCount | null;
  onSubmit: (data: MonthlySubscriptionFormSchema) => Promise<void>;
  isSubmitting: boolean;
}

export function MonthlySubscriptionModal({
  open,
  onClose,
  subscription,
  onSubmit,
  isSubmitting
}: MonthlySubscriptionModalProps) {
  const { t } = useTranslation('monthlySubscriptions');
  const isEditing = !!subscription;

  const form = useForm<MonthlySubscriptionFormSchema>({
    resolver: zodResolver(monthlySubscriptionSchema),
    defaultValues: {
      name: "",
      description: "",
      price: 0,
      hasLimit: false,
      maxClasses: null,
      overagePrice: null,
      selectedStudents: []
    }
  });

  // Reset form when subscription changes or modal opens
  useEffect(() => {
    if (open) {
      if (subscription) {
        form.reset({
          name: subscription.name,
          description: subscription.description || "",
          price: subscription.price,
          hasLimit: subscription.max_classes !== null,
          maxClasses: subscription.max_classes,
          overagePrice: subscription.overage_price,
          selectedStudents: []
        });
      } else {
        form.reset({
          name: "",
          description: "",
          price: 0,
          hasLimit: false,
          maxClasses: null,
          overagePrice: null,
          selectedStudents: []
        });
      }
    }
  }, [open, subscription, form]);

  const hasLimit = form.watch("hasLimit");

  const handleSubmit = async (data: MonthlySubscriptionFormSchema) => {
    await onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('edit') : t('new')}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? t('info.softDelete')
              : t('info.familyBilling')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.name')}</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={t('fields.namePlaceholder')} 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.description')}</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder={t('fields.descriptionPlaceholder')} 
                      {...field} 
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Price */}
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.price')}</FormLabel>
                  <FormControl>
                    <Input 
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={t('fields.pricePlaceholder')} 
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Has Limit Toggle */}
            <FormField
              control={form.control}
              name="hasLimit"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{t('fields.hasLimit')}</FormLabel>
                    <FormDescription className="text-xs">
                      {t('info.ignoreCancellations')}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Conditional fields when hasLimit is true */}
            {hasLimit && (
              <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                {/* Max Classes */}
                <FormField
                  control={form.control}
                  name="maxClasses"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('fields.maxClasses')}</FormLabel>
                      <FormControl>
                        <Input 
                          type="number"
                          min="1"
                          placeholder={t('fields.maxClassesPlaceholder')} 
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Overage Price */}
                <FormField
                  control={form.control}
                  name="overagePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('fields.overagePrice')}</FormLabel>
                      <FormControl>
                        <Input 
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={t('fields.overagePricePlaceholder')} 
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        {t('info.overageExplanation')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Info Alert */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {t('info.experimentalNotCounted')}
              </AlertDescription>
            </Alert>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                {t('actions.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('actions.saving')}
                  </>
                ) : (
                  isEditing ? t('actions.update') : t('actions.create')
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
