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
      analisi: {
        Row: {
          best_posizione_id: string | null
          best_score: number | null
          candidato_id: string
          created_at: string
          id: string
          modello: string | null
          posizioni_ids: string[]
          risultato: Json
        }
        Insert: {
          best_posizione_id?: string | null
          best_score?: number | null
          candidato_id: string
          created_at?: string
          id?: string
          modello?: string | null
          posizioni_ids?: string[]
          risultato: Json
        }
        Update: {
          best_posizione_id?: string | null
          best_score?: number | null
          candidato_id?: string
          created_at?: string
          id?: string
          modello?: string | null
          posizioni_ids?: string[]
          risultato?: Json
        }
        Relationships: [
          {
            foreignKeyName: "analisi_best_posizione_id_fkey"
            columns: ["best_posizione_id"]
            isOneToOne: false
            referencedRelation: "posizioni"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analisi_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "candidati"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          escludi_posizioni_chiuse: boolean
          id: string
          lingua_output: string
          soglia_non_idoneo: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          escludi_posizioni_chiuse?: boolean
          id?: string
          lingua_output?: string
          soglia_non_idoneo?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          escludi_posizioni_chiuse?: boolean
          id?: string
          lingua_output?: string
          soglia_non_idoneo?: number
          updated_at?: string
        }
        Relationships: []
      }
      campi_personalizzati: {
        Row: {
          created_at: string
          descrizione: string | null
          etichetta: string
          id: string
          ordine: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          descrizione?: string | null
          etichetta: string
          id?: string
          ordine?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          descrizione?: string | null
          etichetta?: string
          id?: string
          ordine?: number
          updated_at?: string
        }
        Relationships: []
      }
      candidati: {
        Row: {
          canale: Database["public"]["Enums"]["canale_provenienza"] | null
          cognome: string
          created_at: string
          cv_filename: string | null
          cv_path: string | null
          id: string
          informazioni_estratte: Json | null
          nome: string
          note: string | null
          posizione_id: string | null
          stato_analisi: Database["public"]["Enums"]["stato_analisi"]
          updated_at: string
        }
        Insert: {
          canale?: Database["public"]["Enums"]["canale_provenienza"] | null
          cognome: string
          created_at?: string
          cv_filename?: string | null
          cv_path?: string | null
          id?: string
          informazioni_estratte?: Json | null
          nome: string
          note?: string | null
          posizione_id?: string | null
          stato_analisi?: Database["public"]["Enums"]["stato_analisi"]
          updated_at?: string
        }
        Update: {
          canale?: Database["public"]["Enums"]["canale_provenienza"] | null
          cognome?: string
          created_at?: string
          cv_filename?: string | null
          cv_path?: string | null
          id?: string
          informazioni_estratte?: Json | null
          nome?: string
          note?: string | null
          posizione_id?: string | null
          stato_analisi?: Database["public"]["Enums"]["stato_analisi"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidati_posizione_id_fkey"
            columns: ["posizione_id"]
            isOneToOne: false
            referencedRelation: "posizioni"
            referencedColumns: ["id"]
          },
        ]
      }
      posizioni: {
        Row: {
          anni_esperienza: number | null
          competenze: string | null
          created_at: string
          descrizione: string
          id: string
          lingue: string | null
          luogo: string | null
          reparto: string | null
          stato: Database["public"]["Enums"]["posizione_stato"]
          titolo: string
          titolo_studio: Database["public"]["Enums"]["titolo_studio"]
          updated_at: string
        }
        Insert: {
          anni_esperienza?: number | null
          competenze?: string | null
          created_at?: string
          descrizione: string
          id?: string
          lingue?: string | null
          luogo?: string | null
          reparto?: string | null
          stato?: Database["public"]["Enums"]["posizione_stato"]
          titolo: string
          titolo_studio?: Database["public"]["Enums"]["titolo_studio"]
          updated_at?: string
        }
        Update: {
          anni_esperienza?: number | null
          competenze?: string | null
          created_at?: string
          descrizione?: string
          id?: string
          lingue?: string | null
          luogo?: string | null
          reparto?: string | null
          stato?: Database["public"]["Enums"]["posizione_stato"]
          titolo?: string
          titolo_studio?: Database["public"]["Enums"]["titolo_studio"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
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
      app_role: "hr" | "admin"
      canale_provenienza: "linkedin" | "sito" | "referral" | "altro"
      posizione_stato: "aperta" | "chiusa"
      stato_analisi: "in_attesa" | "analizzato"
      titolo_studio:
        | "nessuno"
        | "diploma"
        | "laurea_triennale"
        | "laurea_magistrale"
        | "master_dottorato"
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
      app_role: ["hr", "admin"],
      canale_provenienza: ["linkedin", "sito", "referral", "altro"],
      posizione_stato: ["aperta", "chiusa"],
      stato_analisi: ["in_attesa", "analizzato"],
      titolo_studio: [
        "nessuno",
        "diploma",
        "laurea_triennale",
        "laurea_magistrale",
        "master_dottorato",
      ],
    },
  },
} as const
