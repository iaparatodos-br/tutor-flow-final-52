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
  DialogFooter } from
"@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage } from
"@/components/ui/form";
import { Loader2 } from "lucide-react";
import {
  monthlySubscriptionSchema,
  type MonthlySubscriptionFormSchema } from
"@/schemas/monthly-subscription.schema";
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
      is_active: true,
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
          is_active: subscription.is_active,
          selectedStudents: []
        });
      } else {
        form.reset({
          name: "",
          description: "",
          price: 0,
          is_active: true,
          selectedStudents: []
        });
      }
    }
  }, [open, subscription, form]);

  const handleSubmit = async (data: MonthlySubscriptionFormSchema) => {
    await onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('edit') : t('new')}
          </DialogTitle>
          <DialogDescription>
            {isEditing ?
            t('info.softDelete') :
            t('info.familyBilling')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) =>
              <FormItem>
                  <FormLabel>{t('fields.name')}</FormLabel>
                  <FormControl>
                    <Input
                    placeholder={t('fields.namePlaceholder')}
                    {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              } />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) =>
              <FormItem>
                  <FormLabel>{t('fields.description')}</FormLabel>
                  <FormControl>
                    <Textarea
                    placeholder={t('fields.descriptionPlaceholder')}
                    {...field}
                    rows={2} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              } />

            {/* Price */}
            <FormField
              control={form.control}
              name="price"
              render={({ field }) =>
              <FormItem>
                  <FormLabel>{t('fields.price')}</FormLabel>
                  <FormControl>
                    <Input
                    inputMode="numeric"
                    min="0"
                    step="0.01"
                    placeholder={t('fields.pricePlaceholder')}
                    {...field}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.,]/g, '');
                      field.onChange(parseFloat(value.replace(',', '.')) || 0);
                    }} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              } />

            {/* Active Toggle - only when editing */}
            {isEditing && (
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) =>
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel className="text-sm font-medium cursor-pointer">
                      {t('fields.isActive')}
                    </FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value ?? true}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                } />
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}>
                {t('actions.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ?
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('actions.saving')}
                  </> :
                isEditing ? t('actions.update') : t('actions.create')
                }
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>);
}
