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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          business_name: string
          currency_code: string
          currency_symbol: string
          id: number
          updated_at: string
        }
        Insert: {
          business_name?: string
          currency_code?: string
          currency_symbol?: string
          id?: number
          updated_at?: string
        }
        Update: {
          business_name?: string
          currency_code?: string
          currency_symbol?: string
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          expense_date: string
          expense_type: string
          id: string
          is_deleted: boolean
          note: string | null
          restaurant_id: string
          updated_at: string
          vault_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          expense_date?: string
          expense_type: string
          id?: string
          is_deleted?: boolean
          note?: string | null
          restaurant_id: string
          updated_at?: string
          vault_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          expense_date?: string
          expense_type?: string
          id?: string
          is_deleted?: boolean
          note?: string | null
          restaurant_id?: string
          updated_at?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          is_deleted: boolean
          note: string | null
          payment_date: string
          payment_images: string[]
          restaurant_id: string
          updated_at: string
          vault_id: string
          vendor_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_deleted?: boolean
          note?: string | null
          payment_date?: string
          payment_images?: string[]
          restaurant_id: string
          updated_at?: string
          vault_id: string
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_deleted?: boolean
          note?: string | null
          payment_date?: string
          payment_images?: string[]
          restaurant_id?: string
          updated_at?: string
          vault_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          amount: number
          amount_paid_now: number
          created_at: string
          created_by: string | null
          details: string | null
          id: string
          invoice_images: string[]
          is_deleted: boolean
          payment_type: Database["public"]["Enums"]["payment_type"]
          purchase_date: string
          restaurant_id: string
          updated_at: string
          vault_id: string | null
          vendor_id: string
        }
        Insert: {
          amount: number
          amount_paid_now?: number
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          invoice_images?: string[]
          is_deleted?: boolean
          payment_type: Database["public"]["Enums"]["payment_type"]
          purchase_date?: string
          restaurant_id: string
          updated_at?: string
          vault_id?: string | null
          vendor_id: string
        }
        Update: {
          amount?: number
          amount_paid_now?: number
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          invoice_images?: string[]
          is_deleted?: boolean
          payment_type?: Database["public"]["Enums"]["payment_type"]
          purchase_date?: string
          restaurant_id?: string
          updated_at?: string
          vault_id?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          opening_cash_balance: number
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          opening_cash_balance?: number
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          opening_cash_balance?: number
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vault_deposits: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          deposit_date: string
          id: string
          is_deleted: boolean
          note: string | null
          restaurant_id: string
          updated_at: string
          vault_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          deposit_date?: string
          id?: string
          is_deleted?: boolean
          note?: string | null
          restaurant_id: string
          updated_at?: string
          vault_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deposit_date?: string
          id?: string
          is_deleted?: boolean
          note?: string | null
          restaurant_id?: string
          updated_at?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_deposits_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_deposits_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vaults: {
        Row: {
          created_at: string
          created_by: string | null
          current_balance: number
          id: string
          is_active: boolean
          opening_balance: number
          restaurant_id: string
          updated_at: string
          vault_user_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_balance?: number
          id?: string
          is_active?: boolean
          opening_balance?: number
          restaurant_id: string
          updated_at?: string
          vault_user_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_balance?: number
          id?: string
          is_active?: boolean
          opening_balance?: number
          restaurant_id?: string
          updated_at?: string
          vault_user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vaults_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          account_number: string | null
          address: string | null
          created_at: string
          created_by: string | null
          current_balance: number
          id: string
          is_active: boolean
          name: string
          opening_balance: number
          phone: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          address?: string | null
          created_at?: string
          created_by?: string | null
          current_balance?: number
          id?: string
          is_active?: boolean
          name: string
          opening_balance?: number
          phone?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          address?: string | null
          created_at?: string
          created_by?: string | null
          current_balance?: number
          id?: string
          is_active?: boolean
          name?: string
          opening_balance?: number
          phone?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vendor_ledger_entries: {
        Row: {
          credit: number | null
          debit: number | null
          description: string | null
          entry_date: string | null
          entry_type: string | null
          ref_id: string | null
          restaurant_id: string | null
          sort_order: number | null
          vendor_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      clear_all_business_data: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      purchase_credit_portion: {
        Args: {
          _amount: number
          _paid: number
          _type: Database["public"]["Enums"]["payment_type"]
        }
        Returns: number
      }
      restaurant_vendor_report: {
        Args: { _from?: string; _restaurant_id: string; _to?: string }
        Returns: {
          current_balance: number
          opening_balance: number
          total: number
          total_paid: number
          total_purchased: number
          vendor_id: string
          vendor_name: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "staff"
      payment_type: "cash" | "credit" | "partial"
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
      app_role: ["admin", "manager", "staff"],
      payment_type: ["cash", "credit", "partial"],
    },
  },
} as const
