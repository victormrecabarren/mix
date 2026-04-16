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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      comments: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          id: string
          round_id: string
          submission_id: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          id?: string
          round_id: string
          submission_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          round_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      deadline_extension_log: {
        Row: {
          deadline_type: string
          extension_hours: number
          id: string
          new_deadline: string | null
          outcome: string
          previous_deadline: string
          round_id: string
          triggered_at: string
        }
        Insert: {
          deadline_type: string
          extension_hours?: number
          id?: string
          new_deadline?: string | null
          outcome: string
          previous_deadline: string
          round_id: string
          triggered_at?: string
        }
        Update: {
          deadline_type?: string
          extension_hours?: number
          id?: string
          new_deadline?: string | null
          outcome?: string
          previous_deadline?: string
          round_id?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadline_extension_log_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      deadline_extension_requests: {
        Row: {
          deadline_type: string
          id: string
          requested_at: string
          round_id: string
          user_id: string
        }
        Insert: {
          deadline_type: string
          id?: string
          requested_at?: string
          round_id: string
          user_id: string
        }
        Update: {
          deadline_type?: string
          id?: string
          requested_at?: string
          round_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadline_extension_requests_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_extension_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      jam_plays: {
        Row: {
          id: string
          jam_id: string
          listener_id: string
          played_at: string
        }
        Insert: {
          id?: string
          jam_id: string
          listener_id: string
          played_at?: string
        }
        Update: {
          id?: string
          jam_id?: string
          listener_id?: string
          played_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jam_plays_jam_id_fkey"
            columns: ["jam_id"]
            isOneToOne: false
            referencedRelation: "jams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jam_plays_listener_id_fkey"
            columns: ["listener_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      jam_reactions: {
        Row: {
          created_at: string
          id: string
          jam_track_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          jam_track_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          jam_track_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jam_reactions_jam_track_id_fkey"
            columns: ["jam_track_id"]
            isOneToOne: false
            referencedRelation: "jam_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jam_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      jam_skips: {
        Row: {
          id: string
          jam_track_id: string
          skipped_at: string
          user_id: string
        }
        Insert: {
          id?: string
          jam_track_id: string
          skipped_at?: string
          user_id: string
        }
        Update: {
          id?: string
          jam_track_id?: string
          skipped_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jam_skips_jam_track_id_fkey"
            columns: ["jam_track_id"]
            isOneToOne: false
            referencedRelation: "jam_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jam_skips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      jam_track_plays: {
        Row: {
          id: string
          jam_track_id: string
          played_at: string
          user_id: string
        }
        Insert: {
          id?: string
          jam_track_id: string
          played_at?: string
          user_id: string
        }
        Update: {
          id?: string
          jam_track_id?: string
          played_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jam_track_plays_jam_track_id_fkey"
            columns: ["jam_track_id"]
            isOneToOne: false
            referencedRelation: "jam_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jam_track_plays_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      jam_tracks: {
        Row: {
          added_at: string
          id: string
          jam_id: string
          position: number
          track_album_name: string | null
          track_artist: string
          track_artwork_url: string | null
          track_duration_ms: number | null
          track_id: string
          track_isrc: string | null
          track_source: string
          track_title: string
        }
        Insert: {
          added_at?: string
          id?: string
          jam_id: string
          position: number
          track_album_name?: string | null
          track_artist: string
          track_artwork_url?: string | null
          track_duration_ms?: number | null
          track_id: string
          track_isrc?: string | null
          track_source?: string
          track_title: string
        }
        Update: {
          added_at?: string
          id?: string
          jam_id?: string
          position?: number
          track_album_name?: string | null
          track_artist?: string
          track_artwork_url?: string | null
          track_duration_ms?: number | null
          track_id?: string
          track_isrc?: string | null
          track_source?: string
          track_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "jam_tracks_jam_id_fkey"
            columns: ["jam_id"]
            isOneToOne: false
            referencedRelation: "jams"
            referencedColumns: ["id"]
          },
        ]
      }
      jams: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_snapshots: {
        Row: {
          id: string
          league_id: string
          season_id: string | null
          total_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          league_id: string
          season_id?: string | null
          total_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          league_id?: string
          season_id?: string | null
          total_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_snapshots_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_snapshots_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          joined_at: string
          league_id: string
          role: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          league_id: string
          role?: string
          user_id: string
        }
        Update: {
          joined_at?: string
          league_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          admin_user_id: string
          created_at: string
          id: string
          master_playlist_mode: string
          master_playlist_ref: string | null
          name: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          id?: string
          master_playlist_mode?: string
          master_playlist_ref?: string | null
          name: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          id?: string
          master_playlist_mode?: string
          master_playlist_ref?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          id: string
          read_at: string | null
          sent_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string | null
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      round_participants: {
        Row: {
          is_void: boolean
          round_id: string
          user_id: string
          voted_at: string | null
        }
        Insert: {
          is_void?: boolean
          round_id: string
          user_id: string
          voted_at?: string | null
        }
        Update: {
          is_void?: boolean
          round_id?: string
          user_id?: string
          voted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "round_participants_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          created_at: string
          id: string
          max_points_per_track: number | null
          points_per_round: number | null
          prompt: string
          round_number: number
          round_playlist_ref: string | null
          season_id: string
          submission_deadline_at: string
          voting_deadline_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_points_per_track?: number | null
          points_per_round?: number | null
          prompt: string
          round_number: number
          round_playlist_ref?: string | null
          season_id: string
          submission_deadline_at: string
          voting_deadline_at: string
        }
        Update: {
          created_at?: string
          id?: string
          max_points_per_track?: number | null
          points_per_round?: number | null
          prompt?: string
          round_number?: number
          round_playlist_ref?: string | null
          season_id?: string
          submission_deadline_at?: string
          voting_deadline_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          completed_at: string | null
          created_at: string
          default_max_points_per_track: number
          default_points_per_round: number
          id: string
          invite_token: string
          league_id: string
          name: string
          participant_cap: number | null
          season_number: number
          season_playlist_ref: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          default_max_points_per_track?: number
          default_points_per_round?: number
          id?: string
          invite_token?: string
          league_id: string
          name: string
          participant_cap?: number | null
          season_number: number
          season_playlist_ref?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          default_max_points_per_track?: number
          default_points_per_round?: number
          id?: string
          invite_token?: string
          league_id?: string
          name?: string
          participant_cap?: number | null
          season_number?: number
          season_playlist_ref?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          apple_music_track_id: string | null
          created_at: string
          id: string
          playlist_position: number | null
          round_id: string
          spotify_track_id: string | null
          track_album_name: string | null
          track_artist: string
          track_artwork_url: string | null
          track_duration_ms: number | null
          track_genre: string | null
          track_isrc: string
          track_popularity: number | null
          track_release_year: number | null
          track_title: string
          user_id: string
        }
        Insert: {
          apple_music_track_id?: string | null
          created_at?: string
          id?: string
          playlist_position?: number | null
          round_id: string
          spotify_track_id?: string | null
          track_album_name?: string | null
          track_artist: string
          track_artwork_url?: string | null
          track_duration_ms?: number | null
          track_genre?: string | null
          track_isrc: string
          track_popularity?: number | null
          track_release_year?: number | null
          track_title: string
          user_id: string
        }
        Update: {
          apple_music_track_id?: string | null
          created_at?: string
          id?: string
          playlist_position?: number | null
          round_id?: string
          spotify_track_id?: string | null
          track_album_name?: string | null
          track_artist?: string
          track_artwork_url?: string | null
          track_duration_ms?: number | null
          track_genre?: string | null
          track_isrc?: string
          track_popularity?: number | null
          track_release_year?: number | null
          track_title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          apple_music_id: string | null
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          spotify_id: string | null
        }
        Insert: {
          apple_music_id?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id: string
          spotify_id?: string | null
        }
        Update: {
          apple_music_id?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          spotify_id?: string | null
        }
        Relationships: []
      }
      votes: {
        Row: {
          created_at: string
          id: string
          is_void: boolean
          points: number
          round_id: string
          submission_id: string
          voter_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_void?: boolean
          points: number
          round_id: string
          submission_id: string
          voter_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_void?: boolean
          points?: number
          round_id?: string
          submission_id?: string
          voter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_voter_user_id_fkey"
            columns: ["voter_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      submissions_public: {
        Row: {
          apple_music_track_id: string | null
          created_at: string | null
          id: string | null
          playlist_position: number | null
          round_id: string | null
          spotify_track_id: string | null
          track_artist: string | null
          track_artwork_url: string | null
          track_isrc: string | null
          track_title: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_league: { Args: { league_name: string }; Returns: string }
      my_league_ids: { Args: never; Returns: string[] }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
