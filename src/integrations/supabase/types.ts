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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      archived_stripe_events: {
        Row: {
          archived_at: string
          data_fingerprint: string
          event_created: string
          event_data: Json
          event_id: string
          event_type: string
          processed_at: string
          processing_result: Json
          webhook_function: string
        }
        Insert: {
          archived_at?: string
          data_fingerprint: string
          event_created: string
          event_data: Json
          event_id: string
          event_type: string
          processed_at: string
          processing_result: Json
          webhook_function: string
        }
        Update: {
          archived_at?: string
          data_fingerprint?: string
          event_created?: string
          event_data?: Json
          event_id?: string
          event_type?: string
          processed_at?: string
          processing_result?: Json
          webhook_function?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          operation: string
          record_id: string
          table_name: string
          target_teacher_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          record_id: string
          table_name: string
          target_teacher_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          record_id?: string
          table_name?: string
          target_teacher_id?: string | null
        }
        Relationships: []
      }
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
      business_profiles: {
        Row: {
          business_name: string
          cnpj: string | null
          created_at: string
          id: string
          stripe_connect_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_name: string
          cnpj?: string | null
          created_at?: string
          id?: string
          stripe_connect_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_name?: string
          cnpj?: string | null
          created_at?: string
          id?: string
          stripe_connect_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      class_exceptions: {
        Row: {
          created_at: string
          exception_date: string
          id: string
          new_description: string | null
          new_duration_minutes: number | null
          new_end_time: string | null
          new_start_time: string | null
          new_title: string | null
          original_class_id: string
          status: Database["public"]["Enums"]["exception_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          exception_date: string
          id?: string
          new_description?: string | null
          new_duration_minutes?: number | null
          new_end_time?: string | null
          new_start_time?: string | null
          new_title?: string | null
          original_class_id: string
          status: Database["public"]["Enums"]["exception_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          exception_date?: string
          id?: string
          new_description?: string | null
          new_duration_minutes?: number | null
          new_end_time?: string | null
          new_start_time?: string | null
          new_title?: string | null
          original_class_id?: string
          status?: Database["public"]["Enums"]["exception_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_exceptions_original_class_id_fkey"
            columns: ["original_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
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
          billed: boolean | null
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
          billed?: boolean | null
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
          billed?: boolean | null
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
          barcode: string | null
          boleto_url: string | null
          business_profile_id: string | null
          cancellation_policy_id: string | null
          class_id: string | null
          created_at: string | null
          description: string | null
          due_date: string
          gateway_provider: string | null
          id: string
          invoice_type: string | null
          linha_digitavel: string | null
          manual_payment_notes: string | null
          original_amount: number | null
          payment_account_used_id: string | null
          payment_due_date: string | null
          payment_intent_cancelled_at: string | null
          payment_intent_cancelled_by: string | null
          payment_method: string | null
          payment_origin: string | null
          pix_copy_paste: string | null
          pix_qr_code: string | null
          sent_to_guardian: boolean | null
          status: string
          stripe_hosted_invoice_url: string | null
          stripe_invoice_id: string | null
          stripe_invoice_url: string | null
          stripe_payment_intent_id: string | null
          student_id: string
          teacher_id: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          barcode?: string | null
          boleto_url?: string | null
          business_profile_id?: string | null
          cancellation_policy_id?: string | null
          class_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date: string
          gateway_provider?: string | null
          id?: string
          invoice_type?: string | null
          linha_digitavel?: string | null
          manual_payment_notes?: string | null
          original_amount?: number | null
          payment_account_used_id?: string | null
          payment_due_date?: string | null
          payment_intent_cancelled_at?: string | null
          payment_intent_cancelled_by?: string | null
          payment_method?: string | null
          payment_origin?: string | null
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          sent_to_guardian?: boolean | null
          status?: string
          stripe_hosted_invoice_url?: string | null
          stripe_invoice_id?: string | null
          stripe_invoice_url?: string | null
          stripe_payment_intent_id?: string | null
          student_id: string
          teacher_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          barcode?: string | null
          boleto_url?: string | null
          business_profile_id?: string | null
          cancellation_policy_id?: string | null
          class_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string
          gateway_provider?: string | null
          id?: string
          invoice_type?: string | null
          linha_digitavel?: string | null
          manual_payment_notes?: string | null
          original_amount?: number | null
          payment_account_used_id?: string | null
          payment_due_date?: string | null
          payment_intent_cancelled_at?: string | null
          payment_intent_cancelled_by?: string | null
          payment_method?: string | null
          payment_origin?: string | null
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          sent_to_guardian?: boolean | null
          status?: string
          stripe_hosted_invoice_url?: string | null
          stripe_invoice_id?: string | null
          stripe_invoice_url?: string | null
          stripe_payment_intent_id?: string | null
          student_id?: string
          teacher_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payment_account_used_id_fkey"
            columns: ["payment_account_used_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
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
      login_attempts: {
        Row: {
          attempted_at: string | null
          id: string
          ip_address: unknown | null
          success: boolean | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          attempted_at?: string | null
          id?: string
          ip_address?: unknown | null
          success?: boolean | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          attempted_at?: string | null
          id?: string
          ip_address?: unknown | null
          success?: boolean | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
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
          stripe_charges_enabled: boolean | null
          stripe_connect_account_id: string | null
          stripe_details_submitted: boolean | null
          stripe_onboarding_status: string | null
          stripe_payouts_enabled: boolean | null
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
          stripe_charges_enabled?: boolean | null
          stripe_connect_account_id?: string | null
          stripe_details_submitted?: boolean | null
          stripe_onboarding_status?: string | null
          stripe_payouts_enabled?: boolean | null
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
          stripe_charges_enabled?: boolean | null
          stripe_connect_account_id?: string | null
          stripe_details_submitted?: boolean | null
          stripe_onboarding_status?: string | null
          stripe_payouts_enabled?: boolean | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      pending_business_profiles: {
        Row: {
          business_name: string
          cnpj: string | null
          created_at: string
          expires_at: string
          id: string
          stripe_connect_id: string
          user_id: string
        }
        Insert: {
          business_name: string
          cnpj?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          stripe_connect_id: string
          user_id: string
        }
        Update: {
          business_name?: string
          cnpj?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          stripe_connect_id?: string
          user_id?: string
        }
        Relationships: []
      }
      pending_refunds: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          invoice_id: string | null
          processed_at: string | null
          processed_by: string | null
          reason: string
          requires_manual_review: boolean | null
          stripe_payment_intent_id: string | null
          student_id: string
          teacher_id: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string
          requires_manual_review?: boolean | null
          stripe_payment_intent_id?: string | null
          student_id: string
          teacher_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string
          requires_manual_review?: boolean | null
          stripe_payment_intent_id?: string | null
          student_id?: string
          teacher_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_refunds_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_stripe_events: {
        Row: {
          data_fingerprint: string
          event_created: string
          event_data: Json
          event_id: string
          event_type: string
          last_error: string | null
          processed_at: string
          processing_completed_at: string | null
          processing_result: Json
          processing_started_at: string | null
          processing_status:
            | Database["public"]["Enums"]["processing_status_enum"]
            | null
          retry_count: number | null
          webhook_function: string
        }
        Insert: {
          data_fingerprint: string
          event_created: string
          event_data: Json
          event_id: string
          event_type: string
          last_error?: string | null
          processed_at?: string
          processing_completed_at?: string | null
          processing_result?: Json
          processing_started_at?: string | null
          processing_status?:
            | Database["public"]["Enums"]["processing_status_enum"]
            | null
          retry_count?: number | null
          webhook_function: string
        }
        Update: {
          data_fingerprint?: string
          event_created?: string
          event_data?: Json
          event_id?: string
          event_type?: string
          last_error?: string | null
          processed_at?: string
          processing_completed_at?: string | null
          processing_result?: Json
          processing_started_at?: string | null
          processing_status?:
            | Database["public"]["Enums"]["processing_status_enum"]
            | null
          retry_count?: number | null
          webhook_function?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address_city: string | null
          address_complete: boolean | null
          address_postal_code: string | null
          address_state: string | null
          address_street: string | null
          cpf: string | null
          created_at: string | null
          current_plan_id: string | null
          default_billing_day: number | null
          email: string
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          name: string
          password_changed: boolean
          payment_due_days: number
          policy_document_url: string | null
          preferred_payment_account_id: string | null
          role: string
          stripe_customer_id: string | null
          subscription_end_date: string | null
          subscription_status: string | null
          updated_at: string | null
        }
        Insert: {
          address_city?: string | null
          address_complete?: boolean | null
          address_postal_code?: string | null
          address_state?: string | null
          address_street?: string | null
          cpf?: string | null
          created_at?: string | null
          current_plan_id?: string | null
          default_billing_day?: number | null
          email: string
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          name: string
          password_changed?: boolean
          payment_due_days?: number
          policy_document_url?: string | null
          preferred_payment_account_id?: string | null
          role: string
          stripe_customer_id?: string | null
          subscription_end_date?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          address_city?: string | null
          address_complete?: boolean | null
          address_postal_code?: string | null
          address_state?: string | null
          address_street?: string | null
          cpf?: string | null
          created_at?: string | null
          current_plan_id?: string | null
          default_billing_day?: number | null
          email?: string
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          name?: string
          password_changed?: boolean
          payment_due_days?: number
          policy_document_url?: string | null
          preferred_payment_account_id?: string | null
          role?: string
          stripe_customer_id?: string | null
          subscription_end_date?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_plan_id_fkey"
            columns: ["current_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_preferred_payment_account_id_fkey"
            columns: ["preferred_payment_account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: unknown | null
          resource_id: string | null
          resource_type: string
          security_level: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown | null
          resource_id?: string | null
          resource_type: string
          security_level?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown | null
          resource_id?: string | null
          resource_type?: string
          security_level?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      security_settings: {
        Row: {
          id: string
          setting_name: string
          setting_value: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_name: string
          setting_value: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_name?: string
          setting_value?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      stripe_connect_accounts: {
        Row: {
          account_status: string | null
          account_type: string
          capabilities: Json | null
          charges_disabled_reason: string | null
          charges_enabled: boolean | null
          created_at: string
          details_submitted: boolean | null
          id: string
          last_status_check: string | null
          payment_account_id: string | null
          payouts_disabled_reason: string | null
          payouts_enabled: boolean | null
          requirements: Json | null
          restrictions: Json | null
          status_reason: string | null
          stripe_account_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          account_status?: string | null
          account_type?: string
          capabilities?: Json | null
          charges_disabled_reason?: string | null
          charges_enabled?: boolean | null
          created_at?: string
          details_submitted?: boolean | null
          id?: string
          last_status_check?: string | null
          payment_account_id?: string | null
          payouts_disabled_reason?: string | null
          payouts_enabled?: boolean | null
          requirements?: Json | null
          restrictions?: Json | null
          status_reason?: string | null
          stripe_account_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          account_status?: string | null
          account_type?: string
          capabilities?: Json | null
          charges_disabled_reason?: string | null
          charges_enabled?: boolean | null
          created_at?: string
          details_submitted?: boolean | null
          id?: string
          last_status_check?: string | null
          payment_account_id?: string | null
          payouts_disabled_reason?: string | null
          payouts_enabled?: boolean | null
          requirements?: Json | null
          restrictions?: Json | null
          status_reason?: string | null
          stripe_account_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_connect_accounts_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      student_overage_charges: {
        Row: {
          amount_cents: number
          created_at: string
          extra_students: number
          id: string
          status: string
          stripe_payment_intent_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          extra_students: number
          id?: string
          status: string
          stripe_payment_intent_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          extra_students?: number
          id?: string
          status?: string
          stripe_payment_intent_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          billing_interval: string
          created_at: string
          features: Json
          id: string
          is_active: boolean
          name: string
          price_cents: number
          slug: string
          stripe_price_id: string | null
          student_limit: number
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          name: string
          price_cents: number
          slug: string
          stripe_price_id?: string | null
          student_limit: number
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          slug?: string
          stripe_price_id?: string | null
          student_limit?: number
          updated_at?: string
        }
        Relationships: []
      }
      teacher_student_relationships: {
        Row: {
          billing_day: number | null
          business_profile_id: string | null
          created_at: string
          id: string
          preferred_payment_account_id: string | null
          stripe_customer_id: string | null
          student_guardian_email: string | null
          student_guardian_name: string | null
          student_guardian_phone: string | null
          student_id: string
          student_name: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          billing_day?: number | null
          business_profile_id?: string | null
          created_at?: string
          id?: string
          preferred_payment_account_id?: string | null
          stripe_customer_id?: string | null
          student_guardian_email?: string | null
          student_guardian_name?: string | null
          student_guardian_phone?: string | null
          student_id: string
          student_name?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          billing_day?: number | null
          business_profile_id?: string | null
          created_at?: string
          id?: string
          preferred_payment_account_id?: string | null
          stripe_customer_id?: string | null
          student_guardian_email?: string | null
          student_guardian_name?: string | null
          student_guardian_phone?: string | null
          student_id?: string
          student_name?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_student_relationships_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_student_relationships_preferred_payment_account_id_fkey"
            columns: ["preferred_payment_account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_student_relationships_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_student_relationships_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          extra_cost_cents: number
          extra_students: number
          id: string
          plan_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          extra_cost_cents?: number
          extra_students?: number
          id?: string
          plan_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          extra_cost_cents?: number
          extra_students?: number
          id?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
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
      archive_old_stripe_events: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      cleanup_expired_pending_profiles: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      cleanup_old_login_attempts: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_orphaned_stripe_events: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      complete_stripe_event_processing: {
        Args: {
          p_error_message?: string
          p_event_id: string
          p_success?: boolean
        }
        Returns: boolean
      }
      create_invoice_and_mark_classes_billed: {
        Args: { p_class_ids: string[]; p_invoice_data: Json }
        Returns: Json
      }
      generate_stripe_fingerprint: {
        Args: { event_data: Json }
        Returns: string
      }
      get_calendar_events: {
        Args: { p_end_date: string; p_start_date: string; p_teacher_id: string }
        Returns: {
          amnesty_granted: boolean | null
          amnesty_granted_at: string | null
          amnesty_granted_by: string | null
          billed: boolean | null
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
        }[]
      }
      get_current_user_role_safe: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_student_teachers: {
        Args: { student_user_id: string }
        Returns: {
          billing_day: number
          created_at: string
          relationship_id: string
          teacher_email: string
          teacher_id: string
          teacher_name: string
        }[]
      }
      get_teacher_students: {
        Args: { teacher_user_id: string }
        Returns: {
          billing_day: number
          business_profile_id: string
          created_at: string
          guardian_email: string
          guardian_name: string
          guardian_phone: string
          relationship_id: string
          stripe_customer_id: string
          student_email: string
          student_id: string
          student_name: string
          student_role: string
        }[]
      }
      has_overdue_invoices: {
        Args: { p_student_id: string }
        Returns: boolean
      }
      is_ip_blocked: {
        Args: { p_ip_address: unknown }
        Returns: boolean
      }
      is_material_shared_with_user: {
        Args: { p_material_id: string }
        Returns: boolean
      }
      is_professor: {
        Args: { _user_id: string }
        Returns: boolean
      }
      log_login_attempt: {
        Args: {
          p_ip_address?: unknown
          p_success?: boolean
          p_user_agent?: string
          p_user_id?: string
        }
        Returns: undefined
      }
      log_security_event: {
        Args: {
          p_action: string
          p_details?: Json
          p_resource_id?: string
          p_resource_type: string
          p_security_level?: string
        }
        Returns: undefined
      }
      process_stripe_event_atomic: {
        Args: {
          p_event_created: string
          p_event_data: Json
          p_event_id: string
          p_event_type: string
          p_webhook_function: string
        }
        Returns: Json
      }
      start_stripe_event_processing: {
        Args: {
          p_event_created: string
          p_event_data: Json
          p_event_id: string
          p_event_type: string
          p_webhook_function: string
        }
        Returns: Json
      }
      teacher_has_financial_module: {
        Args: { teacher_id: string }
        Returns: boolean
      }
      user_owns_material: {
        Args: { p_material_id: string }
        Returns: boolean
      }
      validate_cpf: {
        Args: { cpf_input: string }
        Returns: boolean
      }
      validate_password_strength: {
        Args: { password: string }
        Returns: boolean
      }
      validate_rls_policies: {
        Args: Record<PropertyKey, never>
        Returns: {
          has_delete_policy: boolean
          has_insert_policy: boolean
          has_select_policy: boolean
          has_update_policy: boolean
          policy_count: number
          security_status: string
          table_name: string
        }[]
      }
      validate_security_context: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      write_audit_log: {
        Args: {
          p_new_data: Json
          p_old_data: Json
          p_operation: string
          p_record_id: string
          p_table_name: string
          p_target_teacher_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      exception_status: "canceled" | "rescheduled"
      processing_status_enum: "processing" | "completed" | "failed" | "timeout"
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
    Enums: {
      exception_status: ["canceled", "rescheduled"],
      processing_status_enum: ["processing", "completed", "failed", "timeout"],
    },
  },
} as const
