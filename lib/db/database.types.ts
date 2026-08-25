/**
 * Database types for the Skill Unit project.
 *
 * Regenerate after every migration with:
 *   npx supabase gen types typescript --project-id ardzzktujlcejqgpimfh > lib/db/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      skills: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          subtitle: string | null;
          color: string;
          glyph: string;
          level: number;
          xp: number;
          floor_level: number;
          last_active_at: string | null;
          active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          subtitle?: string | null;
          color?: string;
          glyph?: string;
          level?: number;
          xp?: number;
          floor_level?: number;
          last_active_at?: string | null;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['skills']['Insert']>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          skill_id: string;
          title: string;
          kind: string;
          value: number;
          on_today: boolean;
          archived: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          skill_id: string;
          title: string;
          kind: string;
          value: number;
          on_today?: boolean;
          archived?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>;
        Relationships: [];
      };
      log_entries: {
        Row: {
          id: string;
          user_id: string;
          skill_id: string;
          task_id: string | null;
          title: string;
          xp: number;
          minutes: number | null;
          note: string | null;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          skill_id: string;
          task_id?: string | null;
          title: string;
          xp: number;
          minutes?: number | null;
          note?: string | null;
          source: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['log_entries']['Insert']>;
        Relationships: [];
      };
      goals: {
        Row: {
          id: string;
          user_id: string;
          skill_id: string;
          title: string;
          target_date: string | null;
          progress: number;
          done: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          skill_id: string;
          title: string;
          target_date?: string | null;
          progress?: number;
          done?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['goals']['Insert']>;
        Relationships: [];
      };
      quests: {
        Row: {
          id: string;
          user_id: string;
          skill_id: string;
          title: string;
          target: number;
          progress: number;
          bonus_xp: number;
          week_start: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          skill_id: string;
          title: string;
          target: number;
          progress?: number;
          bonus_xp?: number;
          week_start: string;
          completed_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['quests']['Insert']>;
        Relationships: [];
      };
      seasons: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          starts_on: string;
          ends_on: string;
          badge_slug: string;
          summary: Json | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          starts_on: string;
          ends_on: string;
          badge_slug: string;
          summary?: Json | null;
        };
        Update: Partial<Database['public']['Tables']['seasons']['Insert']>;
        Relationships: [];
      };
      week_settings: {
        Row: { user_id: string; week_start: string; capacity: string };
        Insert: { user_id: string; week_start: string; capacity: string };
        Update: Partial<Database['public']['Tables']['week_settings']['Insert']>;
        Relationships: [];
      };
      inbox_items: {
        Row: {
          id: string;
          user_id: string;
          source: string;
          external_id: string;
          title: string;
          suggested_skill_id: string | null;
          suggested_xp: number;
          occurred_at: string;
          status: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source: string;
          external_id: string;
          title: string;
          suggested_skill_id?: string | null;
          suggested_xp?: number;
          occurred_at: string;
          status?: string;
        };
        Update: Partial<Database['public']['Tables']['inbox_items']['Insert']>;
        Relationships: [];
      };
      mapping_rules: {
        Row: {
          id: string;
          user_id: string;
          source: string;
          pattern: string;
          skill_id: string;
          xp: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          source: string;
          pattern: string;
          skill_id: string;
          xp?: number;
        };
        Update: Partial<Database['public']['Tables']['mapping_rules']['Insert']>;
        Relationships: [];
      };
      streak_freezes: {
        Row: {
          id: string;
          user_id: string;
          earned_week: string;
          spent_on: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          earned_week: string;
          spent_on?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['streak_freezes']['Insert']>;
        Relationships: [];
      };
      integration_accounts: {
        Row: {
          user_id: string;
          provider: string;
          refresh_token: string;
          scopes: string;
          connected_at: string;
        };
        Insert: {
          user_id: string;
          provider: string;
          refresh_token: string;
          scopes: string;
          connected_at?: string;
        };
        Update: Partial<Database['public']['Tables']['integration_accounts']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      recalculate_levels: {
        Args: { p_user: string; p_rebuild_floors?: boolean };
        Returns: undefined;
      };
      revert_completion: { Args: { p_entry: string }; Returns: undefined };
      seed_default_skills: { Args: { p_user: string }; Returns: undefined };
      xp_needed: { Args: { p_level: number }; Returns: number };
      apply_xp: {
        Args: { p_skill: string; p_gain: number };
        Returns: Database['public']['Tables']['skills']['Row'];
      };
      log_completion: {
        Args: {
          p_id: string;
          p_skill: string;
          p_task: string | null;
          p_title: string;
          p_xp: number;
          p_minutes: number | null;
          p_note: string | null;
          p_source: string;
          p_created_at: string | null;
        };
        Returns: Database['public']['Tables']['skills']['Row'];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
