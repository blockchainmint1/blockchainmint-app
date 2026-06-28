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
      alert_rules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          kind: Database["public"]["Enums"]["alert_kind"]
          threshold: number | null
          updated_at: string
          user_id: string
          watched_address_id: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind: Database["public"]["Enums"]["alert_kind"]
          threshold?: number | null
          updated_at?: string
          user_id: string
          watched_address_id?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["alert_kind"]
          threshold?: number | null
          updated_at?: string
          user_id?: string
          watched_address_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_watched_address_id_fkey"
            columns: ["watched_address_id"]
            isOneToOne: false
            referencedRelation: "watched_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          platform: Database["public"]["Enums"]["device_platform"]
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: Database["public"]["Enums"]["device_platform"]
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: Database["public"]["Enums"]["device_platform"]
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          external_ref: string | null
          id: string
          product_id: string
          quantity: number
          ship_to: Json | null
          status: Database["public"]["Enums"]["order_status"]
          total_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          external_ref?: string | null
          id?: string
          product_id: string
          quantity?: number
          ship_to?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          total_cents: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          external_ref?: string | null
          id?: string
          product_id?: string
          quantity?: number
          ship_to?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          total_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          chain: Database["public"]["Enums"]["chain_id"]
          created_at: string
          currency: string
          denomination: string
          description: string | null
          id: string
          image_url: string | null
          in_stock: boolean
          metal: string
          name: string
          price_cents: number
          slug: string
          updated_at: string
        }
        Insert: {
          chain: Database["public"]["Enums"]["chain_id"]
          created_at?: string
          currency?: string
          denomination: string
          description?: string | null
          id?: string
          image_url?: string | null
          in_stock?: boolean
          metal: string
          name: string
          price_cents: number
          slug: string
          updated_at?: string
        }
        Update: {
          chain?: Database["public"]["Enums"]["chain_id"]
          created_at?: string
          currency?: string
          denomination?: string
          description?: string | null
          id?: string
          image_url?: string | null
          in_stock?: boolean
          metal?: string
          name?: string
          price_cents?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_currency: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_currency?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_currency?: string
          display_name?: string | null
          id?: string
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
      verification_records: {
        Row: {
          address: string
          chain: Database["public"]["Enums"]["chain_id"]
          created_at: string
          denomination: string | null
          id: string
          metal: string | null
          mint_year: number | null
          notes: string | null
          product_slug: string | null
          serial: string | null
        }
        Insert: {
          address: string
          chain: Database["public"]["Enums"]["chain_id"]
          created_at?: string
          denomination?: string | null
          id?: string
          metal?: string | null
          mint_year?: number | null
          notes?: string | null
          product_slug?: string | null
          serial?: string | null
        }
        Update: {
          address?: string
          chain?: Database["public"]["Enums"]["chain_id"]
          created_at?: string
          denomination?: string | null
          id?: string
          metal?: string | null
          mint_year?: number | null
          notes?: string | null
          product_slug?: string | null
          serial?: string | null
        }
        Relationships: []
      }
      watched_addresses: {
        Row: {
          address: string
          chain: Database["public"]["Enums"]["chain_id"]
          created_at: string
          denomination: string | null
          id: string
          label: string | null
          metal: string | null
          mint_year: number | null
          serial: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          chain: Database["public"]["Enums"]["chain_id"]
          created_at?: string
          denomination?: string | null
          id?: string
          label?: string | null
          metal?: string | null
          mint_year?: number | null
          serial?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          chain?: Database["public"]["Enums"]["chain_id"]
          created_at?: string
          denomination?: string | null
          id?: string
          label?: string | null
          metal?: string | null
          mint_year?: number | null
          serial?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      alert_kind:
        | "incoming"
        | "outgoing"
        | "balance_threshold"
        | "price_threshold"
      app_role: "admin" | "moderator" | "user"
      chain_id:
        | "btc"
        | "eth"
        | "ltc"
        | "doge"
        | "bch"
        | "bsc"
        | "ada"
        | "sol"
        | "bnb"
        | "txc"
        | "iskander"
      device_platform: "ios" | "android" | "web"
      order_status:
        | "pending"
        | "paid"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded"
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
      alert_kind: [
        "incoming",
        "outgoing",
        "balance_threshold",
        "price_threshold",
      ],
      app_role: ["admin", "moderator", "user"],
      chain_id: [
        "btc",
        "eth",
        "ltc",
        "doge",
        "bch",
        "bsc",
        "ada",
        "sol",
        "bnb",
        "txc",
        "iskander",
      ],
      device_platform: ["ios", "android", "web"],
      order_status: [
        "pending",
        "paid",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
    },
  },
} as const
