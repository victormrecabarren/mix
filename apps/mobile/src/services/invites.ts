import { supabase } from "@/lib/supabase";
import { postgresToMixError } from "./errors";

export type JoinInviteInfo = {
  seasonId: string;
  seasonName: string;
  seasonStatus: string;
  leagueId: string;
  leagueName: string;
};

type JoinInviteRpcRow = {
  season_id: string;
  season_name: string;
  season_status: string;
  league_id: string;
  league_name: string;
};

// Looks up a season + league by invite token via the get_join_invite_info RPC.
// Returns null if the token is invalid / not found.
export async function getJoinInviteInfo(
  token: string,
): Promise<JoinInviteInfo | null> {
  const { data, error } = await supabase
    // RPC name isn't in the generated types; cast until regenerated.
    .rpc("get_join_invite_info" as never, { invite_token: token } as never)
    .single();
  if (error) {
    // No rows / bad token → return null, don't throw
    if (error.code === "PGRST116") return null;
    throw postgresToMixError(error);
  }
  const row = data as JoinInviteRpcRow | null;
  if (!row) return null;
  return {
    seasonId: row.season_id,
    seasonName: row.season_name,
    seasonStatus: row.season_status,
    leagueId: row.league_id,
    leagueName: row.league_name,
  };
}

// Adds the user to a league via membership insert. The inviting season isn't
// referenced here because membership is league-scoped.
export async function joinLeagueViaInvite(args: {
  leagueId: string;
  userId: string;
  role: "participant" | "spectator";
}): Promise<void> {
  const { error } = await supabase
    .from("league_members")
    .insert({ league_id: args.leagueId, user_id: args.userId, role: args.role });
  if (error) throw postgresToMixError(error);
}
