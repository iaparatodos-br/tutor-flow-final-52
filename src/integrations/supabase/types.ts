export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      availability_blocks: {
        Row: {
          created_at: string
          description: string | null
          end_datetime: string
          id: string
          is_recurring: boolean
          recurrence_pattern: Json | null
          start_datetime: string
          teacher_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_datetime: string
          id?: string
          is_recurring?: boolean
          recurrence_pattern?: Json | null
          start_datetime: string
          teacher_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_datetime?: string
          id?: string
          is_recurring?: boolean
          recurrence_pattern?: Json | null
          start_datetime?: string
          teacher_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      cancellation_policies: {
        Row: {
          allow_amnesty: boolean
          charge_percentage: number
          created_at: string
          hours_before_class: number
          id: string
          is_active: boolean
          teacher_id: string
          updated_at: string
        }
        Insert: {
          allow_amnesty?: boolean
          charge_percentage?: number
          created_at?: string
          hours_before_class?: number
          id?: string
          is_active?: boolean
          teacher_id: string
          updated_at?: string
        }
        Update: {
          allow_amnesty?: boolean
          charge_percentage?: number
          created_at?: string
          hours_before_class?: number
          id?: string
          is_active?: boolean
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      class_notifications: {
        Row: {
          class_id: string
          created_at: string
          id: string
          notification_type: string
          sent_at: string
          status: string
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          notification_type: string
          sent_at?: string
          status?: string
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          notification_type?: string
          sent_at?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_notifications_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      class_participants: {
        Row: {
          class_id: string
          created_at: string
          id: string
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_participants_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_participants_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      class_report_feedbacks: {
        Row: {
          created_at: string
          feedback: string
          id: string
          report_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          feedback: string
          id?: string
          report_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          feedback?: string
          id?: string
          report_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      class_reports: {
        Row: {
          class_id: string
          created_at: string
          extra_materials: string | null
          homework: string | null
          id: string
          lesson_summary: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          extra_materials?: string | null
          homework?: string | null
          id?: string
          lesson_summary: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          extra_materials?: string | null
          homework?: string | null
          id?: string
          lesson_summary?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      class_services: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          price: number
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          price?: number
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          price?: number
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          amnesty_granted: boolean | null
          amnesty_granted_at: string | null
          amnesty_granted_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          charge_applied: boolean | null
          class_date: string
          created_at: string | null
          duration_minutes: number
          id: string
          is_experimental: boolean
          is_group_class: boolean
          notes: string | null
          parent_class_id: string | null
          recurrence_pattern: Json | null
          service_id: string | null
          status: string
          student_id: string | null
          teacher_id: string
          updated_at: string | null
        }
        Insert: {
          amnesty_granted?: boolean | null
          amnesty_granted_at?: string | null
          amnesty_granted_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          charge_applied?: boolean | null
          class_date: string
          created_at?: string | null
          duration_minutes?: number
          id?: string
          is_experimental?: boolean
          is_group_class?: boolean
          notes?: string | null
          parent_class_id?: string | null
          recurrence_pattern?: Json | null
          service_id?: string | null
          status?: string
          student_id?: string | null
          teacher_id: string
          updated_at?: string | null
        }
        Update: {
          amnesty_granted?: boolean | null
          amnesty_granted_at?: string | null
          amnesty_granted_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          charge_applied?: boolean | null
          class_date?: string
          created_at?: string | null
          duration_minutes?: number
          id?: string
          is_experimental?: boolean
          is_group_class?: boolean
          notes?: string | null
          parent_class_id?: string | null
          recurrence_pattern?: Json | null
          service_id?: string | null
          status?: string
          student_id?: string | null
          teacher_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_parent_class_id_fkey"
            columns: ["parent_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "class_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          color: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          expense_date: string
          id: string
          receipt_url: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description: string
          expense_date: string
          id?: string
          receipt_url?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          receipt_url?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          cancellation_policy_id: string | null
          class_id: string | null
          created_at: string | null
          description: string | null
          due_date: string
          id: string
          invoice_type: string | null
          original_amount: number | null
          payment_due_date: string | null
          payment_method: string | null
          sent_to_guardian: boolean | null
          status: string
          stripe_invoice_id: string | null
          stripe_invoice_url: string | null
          stripe_payment_intent_id: string | null
          student_id: string
          teacher_id: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          cancellation_policy_id?: string | null
          class_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date: string
          id?: string
          invoice_type?: string | null
          original_amount?: number | null
          payment_due_date?: string | null
          payment_method?: string | null
          sent_to_guardian?: boolean | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_invoice_url?: string | null
          stripe_payment_intent_id?: string | null
          student_id: string
          teacher_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          cancellation_policy_id?: string | null
          class_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string
          id?: string
          invoice_type?: string | null
          original_amount?: number | null
          payment_due_date?: string | null
          payment_method?: string | null
          sent_to_guardian?: boolean | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_invoice_url?: string | null
          stripe_payment_intent_id?: string | null
          student_id?: string
          teacher_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      material_access: {
        Row: {
          granted_at: string
          granted_by: string
          id: string
          material_id: string
          student_id: string
        }
        Insert: {
          granted_at?: string
          granted_by: string
          id?: string
          material_id: string
          student_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string
          id?: string
          material_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_access_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      material_categories: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      materials: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          teacher_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          teacher_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          teacher_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "material_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_accounts: {
        Row: {
          account_holder_document: string | null
          account_holder_name: string | null
          account_name: string
          account_number: string | null
          account_type: string
          agency: string | null
          bank_code: string | null
          bank_name: string | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          pix_key: string | null
          pix_key_type: string | null
          stripe_account_id: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          account_holder_document?: string | null
          account_holder_name?: string | null
          account_name: string
          account_number?: string | null
          account_type: string
          agency?: string | null
          bank_code?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          pix_key?: string | null
          pix_key_type?: string | null
          stripe_account_id?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          account_holder_document?: string | null
          account_holder_name?: string | null
          account_name?: string
          account_number?: string | null
          account_type?: string
          agency?: string | null
          bank_code?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          pix_key?: string | null
          pix_key_type?: string | null
          stripe_account_id?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          billing_day: number | null
          created_at: string | null
          email: string
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          name: string
          password_changed: boolean
          preferred_payment_account_id: string | null
          role: string
          stripe_customer_id: string | null
          teacher_id: string | null
          updated_at: string | null
        }
        Insert: {
          billing_day?: number | null
          created_at?: string | null
          email: string
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          name: string
          password_changed?: boolean
          preferred_payment_account_id?: string | null
          role: string
          stripe_customer_id?: string | null
          teacher_id?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_day?: number | null
          created_at?: string | null
          email?: string
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          name?: string
          password_changed?: boolean
          preferred_payment_account_id?: string | null
          role?: string
          stripe_customer_id?: string | null
          teacher_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_preferred_payment_account_id_fkey"
            columns: ["preferred_payment_account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      working_hours: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          start_time: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          start_time: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_material_shared_with_user: {
        Args: { p_material_id: string }
        Returns: boolean
      }
      user_owns_material: {
        Args: { p_material_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
