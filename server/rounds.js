/**
 * Game structure:
 * Round 1 — picture questions · Round 2 — audio · Round 3 — final (5 GK MCQ + 5 riddles).
 */

export const AUDIO_MOVIE_QUESTION =
  "Guess the movie from which this dialogue/song is taken from?";

/** Answer window after the facilitator starts the timer (same scoring curve as picture rounds). */
export const AUDIO_ANSWER_DURATION_MS = 45_000;

const VISUAL_ROUNDS = [
  {
    kind: "visual",
    id: "breaking-bad",
    roundPrompt: "Guess the series",
    answer: "Breaking Bad",
    aliases: [
      "breaking bad",
      "breakingbad",
      "breaking bad series",
      "br ba",
      "brbad",
      "breakingbad series",
      "break bad",
    ],
    hints: [
      "This guy went from teaching boring classes to “cooking” something… definitely not in a kitchen",
      "Blue is not just a color here… it’s very famous",
      "Say my name",
    ],
    image: "/assets/Round-1/BreakingBad.jpg",
  },
  {
    kind: "visual",
    id: "brad-medd",
    roundPrompt: "Guess the person",
    answer: "Brad Medd",
    aliases: ["brad medd", "brad mead", "bradd medd", "brad med", "brad midd"],
    hints: [
      "Not always in the spotlight, but without them… things might just stop working one fine day",
      "One of the key brains behind the tech side of your company… think leadership + engineering",
      "Somewhere between ideas and execution… this person makes sure things actually work",
    ],
    image: "/assets/Round-1/Brad_Medd_CTO.jpg",
  },
  {
    kind: "visual",
    id: "mrf",
    roundPrompt: "Guess the company",
    answer: "MRF",
    aliases: [
      "mrf",
      "mrf tyres",
      "mrf tires",
      "mrf tyre",
      "mrf limited",
      "mrf india",
      "madras rubber factory",
    ],
    hints: [
      "This brand sticks with you… literally",
      "You’ve definitely seen it on cricket bats smashing sixes",
      "Big red letters, super famous for tyres in India",
    ],
    image: "/assets/Round-1/MRF.jpg",
  },
  {
    kind: "visual",
    id: "statue-of-unity",
    roundPrompt: "Guess the monument",
    answer: "Statue of Unity",
    aliases: [
      "statue of unity",
      "unity statue",
      "sardar patel statue",
      "statue of sardar patel",
      "worlds tallest statue",
      "world's tallest statue",
    ],
    hints: [
      "This man united a whole nation… no pressure, right?",
      "He’s standing very tall near a river in Gujarat",
      "World’s tallest statue — dedicated to Sardar Vallabhbhai Patel",
    ],
    image: "/assets/Round-1/statueOfUnity.jpg",
  },
  {
    kind: "visual",
    id: "table-tennis",
    roundPrompt: "Guess the sport",
    answer: "Table Tennis",
    aliases: ["table tennis", "ping pong", "ping-pong", "pingpong", "table tennis sport"],
    hints: [
      "Small ball, big ego battles… meetings suddenly feel less important",
      "Work can wait… this game cannot priorities first",
      "Also called ping-pong… where people casually disappear from their desks",
    ],
    image: "/assets/Round-1/TableTennis.jpg",
  },
];

const AUDIO_ROUNDS = [
  {
    kind: "audio",
    id: "rani-main-raja",
    roundPrompt: "Song clip",
    movieQuestion: AUDIO_MOVIE_QUESTION,
    answer: "Son of Sardaar",
    aliases: ["son of sardaar", "sonofsardaar", "son of sardar", "sos", "s o s"],
    audio: "/assets/Round-2/rani_main_tu_raja.mp3",
    hints: [],
  },
  {
    kind: "audio",
    id: "zingaat",
    roundPrompt: "Song clip",
    movieQuestion: AUDIO_MOVIE_QUESTION,
    answer: "Sairat",
    aliases: ["sairat", "dhadak", "zingaat", "zingat"],
    audio: "/assets/Round-2/zingaat.mp3",
    hints: [],
  },
  {
    kind: "audio",
    id: "ready-dialogue",
    roundPrompt: "Dialogue clip",
    movieQuestion: AUDIO_MOVIE_QUESTION,
    answer: "Ready",
    aliases: ["ready", "ready 2011", "ready movie"],
    audio: "/assets/Round-2/ready_dialogue.mp3",
    hints: [],
  },
  {
    kind: "audio",
    id: "salman-guitar",
    roundPrompt: "Song clip",
    movieQuestion: AUDIO_MOVIE_QUESTION,
    answer: "Pyaar Kiya To Darna Kya",
    aliases: [
      "pyaar kiya to darna kya",
      "pyar kiya to darna kya",
      "pktdk",
      "p k t d k",
    ],
    audio: "/assets/Round-2/salman_guitar.mp3",
    hints: [],
  },
  {
    kind: "audio",
    id: "deewaar",
    roundPrompt: "Dialogue clip",
    movieQuestion: AUDIO_MOVIE_QUESTION,
    answer: "Deewaar",
    aliases: ["deewaar", "deewar", "dewaar", "the wall 1975", "wall amitabh"],
    audio: "/assets/Round-2/amitabh_deewaar.mp3",
    hints: [],
  },
];

/** Round 3: five multiple-choice GK, then five text riddles (45s each, same scoring as pictures). */
const FINAL_ROUNDS = [
  {
    kind: "mcq",
    id: "gk-capital",
    roundPrompt: "General Knowledge",
    questionText: "What is the capital of Japan?",
    options: ["Seoul", "Beijing", "Tokyo", "Bangkok"],
    answer: "Tokyo",
    aliases: ["tokyo"],
    hints: [],
  },
  {
    kind: "mcq",
    id: "gk-planets",
    roundPrompt: "General Knowledge",
    questionText: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Saturn"],
    answer: "Mars",
    aliases: ["mars"],
    hints: [],
  },
  {
    kind: "mcq",
    id: "gk-ocean",
    roundPrompt: "General Knowledge",
    questionText: "What is the largest ocean on Earth?",
    options: ["Atlantic", "Indian", "Arctic", "Pacific"],
    answer: "Pacific",
    aliases: ["pacific", "pacific ocean"],
    hints: [],
  },
  {
    kind: "mcq",
    id: "gk-h2o",
    roundPrompt: "General Knowledge",
    questionText: "What is the chemical symbol for gold?",
    options: ["Go", "Gd", "Au", "Ag"],
    answer: "Au",
    aliases: ["au"],
    hints: [],
  },
  {
    kind: "mcq",
    id: "gk-sun",
    roundPrompt: "General Knowledge",
    questionText: "How many continents are there on Earth? (commonly taught count)",
    options: ["5", "6", "7", "8"],
    answer: "7",
    aliases: ["seven", "7 continents"],
    hints: [],
  },
  {
    kind: "riddle",
    id: "riddle-echo",
    roundPrompt: "Riddle",
    questionText: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?",
    answer: "Echo",
    aliases: ["an echo", "the echo", "echo"],
    hints: [],
  },
  {
    kind: "riddle",
    id: "riddle-sponge",
    roundPrompt: "Riddle",
    questionText: "What is full of holes but still holds water?",
    answer: "Sponge",
    aliases: ["a sponge", "the sponge", "sponge"],
    hints: [],
  },
  {
    kind: "riddle",
    id: "riddle-candle",
    roundPrompt: "Riddle",
    questionText: "I’m tall when I’m young and I’m short when I’m old. What am I?",
    answer: "Candle",
    aliases: ["a candle", "the candle", "candle"],
    hints: [],
  },
  {
    kind: "riddle",
    id: "riddle-map",
    roundPrompt: "Riddle",
    questionText: "I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?",
    answer: "Map",
    aliases: ["a map", "the map", "map"],
    hints: [],
  },
  {
    kind: "riddle",
    id: "riddle-towel",
    roundPrompt: "Riddle",
    questionText: "What gets wetter as it dries?",
    answer: "Towel",
    aliases: ["a towel", "the towel", "towel"],
    hints: [],
  },
];

export const ROUNDS = [...VISUAL_ROUNDS, ...AUDIO_ROUNDS, ...FINAL_ROUNDS];

/** How many picture questions are in “Round 1”. */
export const VISUAL_QUESTION_COUNT = VISUAL_ROUNDS.length;

/** How many audio questions are in “Round 2”. */
export const AUDIO_QUESTION_COUNT = AUDIO_ROUNDS.length;

/** First index in ROUNDS for Round 3 (final). */
export const FINAL_ROUND_START_INDEX = VISUAL_QUESTION_COUNT + AUDIO_QUESTION_COUNT;

/** How many questions in Round 3. */
export const FINAL_QUESTION_COUNT = FINAL_ROUNDS.length;

/** Facilitator-facing block before each game round (not per image/track). */
export const META_ROUNDS = [
  {
    number: 1,
    title: "Round 1 — Picture round",
    description:
      "Five blurred-image questions (series, people, brands, places, sports — different each time). Teams guess on their phones. Start each question when you are ready; scores stay on your screen until you continue.",
  },
  {
    number: 2,
    title: "Round 2 — Music",
    description:
      "Five audio clips (songs and dialogue). Only you can play sound — teams see the question and type the movie title after you open the answer window.",
  },
  {
    number: 3,
    title: "Round 3 — Final",
    description:
      "Ten quick questions: five general knowledge (teams tap A–D) and five riddles (type the answer). Same 45-second timer and scoring as earlier rounds.",
  },
];

/**
 * @param {number} questionIndex index into ROUNDS (0-based)
 */
export function getRoundProgress(questionIndex) {
  if (questionIndex < 0 || questionIndex >= ROUNDS.length) return null;
  if (questionIndex < VISUAL_ROUNDS.length) {
    return {
      metaRoundNumber: 1,
      questionInMeta: questionIndex + 1,
      questionsInMeta: VISUAL_ROUNDS.length,
    };
  }
  if (questionIndex < VISUAL_ROUNDS.length + AUDIO_ROUNDS.length) {
    const inAudio = questionIndex - VISUAL_ROUNDS.length;
    return {
      metaRoundNumber: 2,
      questionInMeta: inAudio + 1,
      questionsInMeta: AUDIO_ROUNDS.length,
    };
  }
  const inFinal = questionIndex - VISUAL_ROUNDS.length - AUDIO_ROUNDS.length;
  return {
    metaRoundNumber: 3,
    questionInMeta: inFinal + 1,
    questionsInMeta: FINAL_ROUNDS.length,
  };
}

/** First ROUNDS index when entering a meta-block (0, 1, or 2). */
export function firstQuestionIndexForMetaIntro(metaIntroIndex) {
  if (metaIntroIndex === 0) return 0;
  if (metaIntroIndex === 1) return VISUAL_QUESTION_COUNT;
  return FINAL_ROUND_START_INDEX;
}

/** Round 1 (visual) guessing window — 45s; see getRoundPlayVisuals for blur timing. */
export const ROUND_DURATION_MS = 45_000;
/** Seconds between hint unlocks: 0s, 15s, 30s elapsed (3 hints). */
export const HINT_INTERVAL_MS = 15_000;
export const MAX_HINTS = 3;
export const WRONG_GUESS_PENALTY = 1;
export const MAX_ROUND_SCORE = 100;
export const SPEED_ROUND_BONUS = 25;

export const ROUND_CLARITY_BLUR_MAX = 26;

/**
 * Blur stays at max for the first 30s (no decrease).
 * Then three small step-downs over the last 15s (still blurred; full clarity only on ROUND_REVEAL).
 * Hints still unlock at 0 / 15 / 30s elapsed — independent of blur.
 */
export function getRoundPlayVisuals(elapsedMs, phase, durationMs = ROUND_DURATION_MS) {
  if (phase === "ROUND_REVEAL" || phase === "SPEED_ROUND") {
    return { blurPx: 0, cropPct: 100 };
  }
  if (elapsedMs < 30_000) {
    return { blurPx: ROUND_CLARITY_BLUR_MAX, cropPct: 100 };
  }
  const late = Math.min(elapsedMs - 30_000, durationMs - 30_000);
  const lateSpan = Math.max(1, durationMs - 30_000);
  const step = lateSpan / 3;
  let blurRatio = 0.7;
  if (late >= step) blurRatio = 0.52;
  if (late >= 2 * step) blurRatio = 0.34;
  const blurPx = Math.round(ROUND_CLARITY_BLUR_MAX * blurRatio);
  return { blurPx, cropPct: 100 };
}
