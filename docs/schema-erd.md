# mix — Database ERD

> Generated: 2026-04-12  
> Schema version: v2  
> Tool: Mermaid (renders in GitHub, Notion, VS Code with Markdown Preview Mermaid extension)

---

## Notes

- **Round status** is derived from timestamps, not stored:
  - `now() < submission_deadline_at` → `open_submissions`
  - `submission_deadline_at ≤ now() < voting_deadline_at` → `voting`
  - `now() ≥ voting_deadline_at` → `completed`
- **`submissions.user_id`** is masked from clients during voting phase via the `submissions_public` view. Revealed after `voting_deadline_at` passes.
- **`votes.is_void`** and **`round_participants.is_void`** are set by pg_cron when a player misses the voting deadline. Their received votes are stored in full for superlative tracking ("ghost points") but excluded from leaderboard tallies.
- **`rounds.points_per_round`** and **`rounds.max_points_per_track`** fall back to season defaults when null.
- **`seasons.invite_token`** is a UUID deep link token (`mix://join?token=<uuid>`), never expires. Anyone following it joins the league + that season. If `participant_cap` is reached, they are forced into `spectator` role.
- **`league_members.role`**: `participant` can submit/vote/comment. `spectator` is read-only but can view all rounds, playlists, results. Spectators can upgrade to participant if a spot opens.

---

```mermaid
erDiagram

    users {
        uuid id PK
        text display_name
        text avatar_url "Spotify URL or preset key e.g. preset_1"
        text spotify_id
        text apple_music_id
        timestamptz created_at
    }

    leagues {
        uuid id PK
        text name
        uuid admin_user_id FK
        text master_playlist_mode "fresh | cloned | linked"
        text master_playlist_ref
        timestamptz created_at
    }

    league_members {
        uuid league_id PK,FK
        uuid user_id PK,FK
        text role "participant | spectator"
        timestamptz joined_at
    }

    seasons {
        uuid id PK
        uuid league_id FK
        text name
        int season_number
        text status "active | completed"
        uuid invite_token "deep link token, never expires"
        int participant_cap "null = no cap"
        int default_points_per_round
        int default_max_points_per_track
        text season_playlist_ref
        timestamptz created_at
        timestamptz completed_at
    }

    rounds {
        uuid id PK
        uuid season_id FK
        int round_number
        text prompt
        timestamptz submission_deadline_at
        timestamptz voting_deadline_at
        int points_per_round "null = use season default"
        int max_points_per_track "null = use season default"
        text round_playlist_ref
        timestamptz created_at
    }

    round_participants {
        uuid round_id PK,FK
        uuid user_id PK,FK
        timestamptz voted_at "null if not yet voted"
        boolean is_void "true if missed voting deadline"
    }

    submissions {
        uuid id PK
        uuid round_id FK
        uuid user_id FK "masked until voting_deadline_at via view"
        text track_isrc
        text spotify_track_id
        text apple_music_track_id
        text track_title
        text track_artist
        text track_artwork_url
        int playlist_position "assigned by pg_cron, null until deadline"
        timestamptz created_at
    }

    votes {
        uuid id PK
        uuid submission_id FK
        uuid round_id FK
        uuid voter_user_id FK
        int points
        boolean is_void "true if voter missed voting deadline"
        timestamptz created_at
    }

    comments {
        uuid id PK
        uuid submission_id FK
        uuid round_id FK
        uuid author_user_id FK
        text body
        timestamptz created_at
    }

    leaderboard_snapshots {
        uuid id PK
        uuid league_id FK
        uuid season_id FK "null = all-time league leaderboard"
        uuid user_id FK
        int total_points "only counts non-void votes"
        timestamptz updated_at
    }

    users ||--o{ leagues : "creates (admin)"
    users ||--o{ league_members : "joins"
    users ||--o{ round_participants : "participates"
    users ||--o{ submissions : "submits"
    users ||--o{ votes : "casts"
    users ||--o{ comments : "writes"
    users ||--o{ leaderboard_snapshots : "ranked in"

    leagues ||--o{ league_members : "has members"
    leagues ||--o{ seasons : "runs"
    leagues ||--o{ leaderboard_snapshots : "tracks"

    seasons ||--o{ rounds : "contains"
    seasons ||--o{ leaderboard_snapshots : "scopes"

    rounds ||--o{ round_participants : "tracks compliance"
    rounds ||--o{ submissions : "receives"
    rounds ||--o{ votes : "collects"
    rounds ||--o{ comments : "hosts"

    submissions ||--o{ votes : "receives"
    submissions ||--o{ comments : "receives"
```
