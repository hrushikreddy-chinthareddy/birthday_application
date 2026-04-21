export type Phase =
  | "LOBBY"
  | "META_ROUND_PENDING"
  | "ROUND_PENDING"
  | "ROUND_PLAY"
  | "ROUND_REVEAL"
  | "AUDIO_LISTEN"
  | "AUDIO_ANSWER"
  | "SPEED_ROUND"
  | "GAME_END"
  | "DISCONNECTED";

/** One row per team (join unit = one device / one socket). */
export interface Player {
  id: string;
  name: string;
  score: number;
}

/** Progress within Round 1 (pictures) or Round 2 (audio). */
export interface RoundProgress {
  metaRoundNumber: number;
  questionInMeta: number;
  questionsInMeta: number;
}

export interface CurrentRound {
  kind: "visual" | "audio" | "mcq" | "riddle";
  index: number;
  totalRounds: number;
  metaRoundNumber?: number | null;
  questionInMeta?: number | null;
  questionsInMeta?: number | null;
  /** Shown above the image (e.g. "Guess the series"). */
  roundPrompt: string | null;
  /** GK / riddle stem (Round 3). */
  questionText: string | null;
  /** Multiple-choice options for `mcq`; labels A–D in UI. */
  options: string[] | null;
  /** Movie question for audio rounds (fill-in-the-blank prompt). */
  movieQuestion: string | null;
  /** Clip URL (mp3). Omitted on team sockets for audio rounds — admin-only playback. */
  audioUrl: string | null;
  image: string | null;
  hints: string[];
  timeLeftMs: number;
  /** False during AUDIO_LISTEN — teams wait for facilitator to start timer. */
  answerWindowActive: boolean;
  blurPx: number;
  cropPct: number;
  revealAnswer: string | null;
  winnerId: string | null;
  correctPlayerIds: string[];
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
  /** Teams: waiting for facilitator to start the current *question* (within Round 1 or 2). */
  pendingRoundMeta?: RoundProgress | null;
  /** Before Round 1 or Round 2: title + description for facilitator; teams wait. */
  metaRoundIntro?: { number: number; title: string; description: string } | null;
  /** Set when a question is active or pending (roundIndex ≥ 0). */
  roundProgress?: RoundProgress | null;
  speedRound: SpeedRoundState | null;
  you?: { id: string; isAdmin: boolean };
  message?: string;
}
