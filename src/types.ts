export type Phase =
  | "LOBBY"
  | "ROUND_PLAY"
  | "ROUND_REVEAL"
  | "SPEED_ROUND"
  | "GAME_END"
  | "DISCONNECTED";

/** One row per team (join unit = one device / one socket). */
export interface Player {
  id: string;
  name: string;
  score: number;
}

export interface CurrentRound {
  index: number;
  totalRounds: number;
  image: string;
  hints: string[];
  timeLeftMs: number;
  blurPx: number;
  cropPct: number;
  revealAnswer: string | null;
  winnerId: string | null;
  roundSolvedAt: number | null;
}

export interface SpeedRoundState {
  endsAt: number;
  winnerId: string | null;
  message: string;
}

export interface GameState {
  phase: Phase | string;
  roomCode?: string;
  players: Player[];
  currentRound: CurrentRound | null;
  speedRound: SpeedRoundState | null;
  /** Present for team sockets; omitted or false for admin-only payloads. */
  you?: { id: string; isAdmin: boolean };
  message?: string;
}
