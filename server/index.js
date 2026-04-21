import express from "express";
import http from "http";
import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "url";
import crypto from "node:crypto";
import cors from "cors";
import { Server } from "socket.io";
import {
  ROUNDS,
  ROUND_DURATION_MS,
  HINT_INTERVAL_MS,
  MAX_HINTS,
  WRONG_GUESS_PENALTY,
  MAX_ROUND_SCORE,
  SPEED_ROUND_BONUS,
  getRoundPlayVisuals,
  AUDIO_ANSWER_DURATION_MS,
  AUDIO_MOVIE_QUESTION,
  META_ROUNDS,
  VISUAL_QUESTION_COUNT,
  AUDIO_QUESTION_COUNT,
  getRoundProgress,
  firstQuestionIndexForMetaIntro,
} from "./rounds.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const distIndex = path.join(distDir, "index.html");
const isProd = process.env.NODE_ENV === "production";
/** If dist/ exists (e.g. after `npm run build`), serve the SPA; otherwise API + Socket.IO only (typical on Render when UI is on Vercel). */
const serveSpa = isProd && fs.existsSync(distIndex);

const app = express();
app.use(cors({ origin: true, credentials: true }));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "mystery-asset-pack-api" });
});

if (serveSpa) {
  app.use(express.static(distDir));
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  path: "/socket.io/",
});

/** @type {Map<string, ReturnType<typeof createEmptyRoom>>} */
const rooms = new Map();

function deleteRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit("state", {
    phase: "DISCONNECTED",
    message: "Room closed.",
  });
  clearRoundTimers(room);
  clearSpeedRound(room);
  rooms.delete(code);
}

function newAdminToken() {
  return crypto.randomBytes(24).toString("base64url");
}

/** @returns {{ ok: true, code: string } | { ok: false, error: string }} */
function normalizeRoomCode(raw) {
  const code = String(raw || "")
    .toUpperCase()
    .replace(/\s/g, "");
  const allowed = /^[A-HJ-NP-Z2-9]{4,8}$/;
  if (!code.length) return { ok: false, error: "Enter a room code." };
  if (!allowed.test(code)) {
    return {
      ok: false,
      error: "Use 4–8 characters: A–Z (no I or O) and digits 2–9.",
    };
  }
  return { ok: true, code };
}

function normalizeGuess(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

/** Map MCQ letter A–D to normalized option text for scoring. */
function normalizedGuessWithMcqLetter(rawNormalized, round) {
  if (round.kind !== "mcq" || !round.options?.length) return rawNormalized;
  if (/^[a-d]$/.test(rawNormalized)) {
    const i = rawNormalized.charCodeAt(0) - "a".charCodeAt(0);
    if (i >= 0 && i < round.options.length) {
      return normalizeGuess(round.options[i]);
    }
  }
  return rawNormalized;
}

function matchesAnswer(normalized, round) {
  const answerNorm = normalizeGuess(round.answer);
  if (normalized === answerNorm) return true;
  if (answerNorm.includes(normalized) && normalized.length >= 3) return true;
  if (normalized.includes(answerNorm) && answerNorm.length >= 3) return true;
  for (const a of round.aliases) {
    const an = normalizeGuess(a);
    if (normalized === an) return true;
    if (an.includes(normalized) && normalized.length >= 3) return true;
    if (normalized.includes(an) && an.length >= 3) return true;
  }
  return false;
}

/** Admin-only room: teams live in `players`; admin is not a player row. */
function createEmptyRoom(code, adminSocketId, adminToken, adminDisplayName) {
  return {
    code,
    adminSocketId,
    adminToken,
    adminDisplayName: String(adminDisplayName || "Admin").slice(0, 24),
    /** @type {Map<string, { id: string, name: string, score: number }>} */
    players: new Map(),
    /** team socketId -> playerId */
    socketToPlayer: new Map(),
    phase: "LOBBY",
    roundIndex: -1,
    /** Which block intro to show (0 = Round 1, 1 = Round 2) when phase is META_ROUND_PENDING */
    metaRoundIntroIndex: 0,
    roundTimer: null,
    hintTimer: null,
    tickInterval: null,
    /** @type {Set<string>} teams that already scored this round */
    roundCorrectPlayerIds: new Set(),
    /** @type {Set<string>} */
    wrongGuessers: new Set(),
    speedRound: null,
    /** @type {NodeJS.Timeout | null} */
    speedTimeout: null,
    /** @type {number | null} when facilitator starts the answer window (audio rounds) */
    audioAnswerStartedAt: null,
  };
}

function getPlayerId(room, socketId) {
  return room.socketToPlayer.get(socketId) ?? null;
}

function isAdminSocket(room, socketId) {
  return room.adminSocketId != null && room.adminSocketId === socketId;
}

function clearRoundTimers(room) {
  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }
  if (room.hintTimer) {
    clearInterval(room.hintTimer);
    room.hintTimer = null;
  }
  if (room.tickInterval) {
    clearInterval(room.tickInterval);
    room.tickInterval = null;
  }
}

/** @param {import("socket.io").Socket} socket */
function getRoomForSocket(socket) {
  const codes = [...socket.rooms].filter((r) => r !== socket.id);
  const code = codes[0];
  if (!code) return null;
  return rooms.get(code) ?? null;
}

function clearSpeedRound(room) {
  if (room.speedTimeout) {
    clearTimeout(room.speedTimeout);
    room.speedTimeout = null;
  }
  room.speedRound = null;
}

function buildAdminPendingRound(room) {
  const round = room.roundIndex >= 0 && room.roundIndex < ROUNDS.length ? ROUNDS[room.roundIndex] : null;
  if (!round) return null;
  const kind = round.kind ?? "visual";
  const prog = getRoundProgress(room.roundIndex);
  return {
    kind,
    index: room.roundIndex,
    totalRounds: ROUNDS.length,
    metaRoundNumber: prog?.metaRoundNumber ?? null,
    questionInMeta: prog?.questionInMeta ?? null,
    questionsInMeta: prog?.questionsInMeta ?? null,
    roundPrompt: round.roundPrompt ?? null,
    questionText: round.questionText ?? null,
    options: kind === "mcq" ? (round.options ?? []) : null,
    movieQuestion: round.movieQuestion ?? (kind === "audio" ? AUDIO_MOVIE_QUESTION : null),
    audioUrl: kind === "audio" ? round.audio : null,
    image: kind === "visual" ? round.image : null,
    hints: [],
    timeLeftMs: 0,
    answerWindowActive: false,
    blurPx: 0,
    cropPct: 100,
    revealAnswer: null,
    winnerId: null,
    correctPlayerIds: [],
    roundSolvedAt: null,
  };
}

function buildCurrentRound(room) {
  const round = room.roundIndex >= 0 && room.roundIndex < ROUNDS.length ? ROUNDS[room.roundIndex] : null;
  if (!round) return null;
  const kind = round.kind ?? "visual";

  if (kind === "audio") {
    if (
      room.phase !== "AUDIO_LISTEN" &&
      room.phase !== "AUDIO_ANSWER" &&
      room.phase !== "ROUND_REVEAL"
    ) {
      return null;
    }
    let timeLeftMs = 0;
    if (room.phase === "AUDIO_ANSWER" && room.audioAnswerStartedAt) {
      timeLeftMs = Math.max(
        0,
        AUDIO_ANSWER_DURATION_MS - (Date.now() - room.audioAnswerStartedAt),
      );
    }
    const prog = getRoundProgress(room.roundIndex);
    return {
      kind: "audio",
      index: room.roundIndex,
      totalRounds: ROUNDS.length,
      metaRoundNumber: prog?.metaRoundNumber ?? null,
      questionInMeta: prog?.questionInMeta ?? null,
      questionsInMeta: prog?.questionsInMeta ?? null,
      roundPrompt: round.roundPrompt ?? null,
      questionText: null,
      options: null,
      movieQuestion: round.movieQuestion ?? AUDIO_MOVIE_QUESTION,
      audioUrl: round.audio,
      image: null,
      hints: [],
      timeLeftMs,
      answerWindowActive: room.phase === "AUDIO_ANSWER",
      blurPx: 0,
      cropPct: 100,
      revealAnswer: room.phase === "ROUND_REVEAL" ? round.answer : null,
      winnerId: null,
      correctPlayerIds: [...room.roundCorrectPlayerIds],
      roundSolvedAt: null,
    };
  }

  if (kind === "visual") {
    if (room.phase !== "ROUND_PLAY" && room.phase !== "ROUND_REVEAL") return null;

    const elapsed = room.roundStartedAt ? Date.now() - room.roundStartedAt : 0;
    const hintsAvailable = Math.min(MAX_HINTS, 1 + Math.floor(elapsed / HINT_INTERVAL_MS));
    const hints = round.hints.slice(0, hintsAvailable);

    const timeLeft = Math.max(0, ROUND_DURATION_MS - elapsed);
    const { blurPx, cropPct } = getRoundPlayVisuals(elapsed, room.phase);

    const prog = getRoundProgress(room.roundIndex);
    return {
      kind: "visual",
      index: room.roundIndex,
      totalRounds: ROUNDS.length,
      metaRoundNumber: prog?.metaRoundNumber ?? null,
      questionInMeta: prog?.questionInMeta ?? null,
      questionsInMeta: prog?.questionsInMeta ?? null,
      roundPrompt: round.roundPrompt ?? null,
      questionText: null,
      options: null,
      movieQuestion: null,
      audioUrl: null,
      image: round.image,
      hints,
      timeLeftMs: room.phase === "ROUND_PLAY" ? timeLeft : 0,
      answerWindowActive: true,
      blurPx,
      cropPct,
      revealAnswer: room.phase === "ROUND_REVEAL" ? round.answer : null,
      winnerId: null,
      correctPlayerIds: [...room.roundCorrectPlayerIds],
      roundSolvedAt: null,
    };
  }

  if (kind === "mcq" || kind === "riddle") {
    if (room.phase !== "ROUND_PLAY" && room.phase !== "ROUND_REVEAL") return null;
    const elapsed = room.roundStartedAt ? Date.now() - room.roundStartedAt : 0;
    const timeLeft = Math.max(0, ROUND_DURATION_MS - elapsed);
    const prog = getRoundProgress(room.roundIndex);
    return {
      kind,
      index: room.roundIndex,
      totalRounds: ROUNDS.length,
      metaRoundNumber: prog?.metaRoundNumber ?? null,
      questionInMeta: prog?.questionInMeta ?? null,
      questionsInMeta: prog?.questionsInMeta ?? null,
      roundPrompt: round.roundPrompt ?? null,
      questionText: round.questionText ?? null,
      options: kind === "mcq" ? (round.options ?? []) : null,
      movieQuestion: null,
      audioUrl: null,
      image: null,
      hints: [],
      timeLeftMs: room.phase === "ROUND_PLAY" ? timeLeft : 0,
      answerWindowActive: true,
      blurPx: 0,
      cropPct: 100,
      revealAnswer: room.phase === "ROUND_REVEAL" ? round.answer : null,
      winnerId: null,
      correctPlayerIds: [...room.roundCorrectPlayerIds],
      roundSolvedAt: null,
    };
  }

  return null;
}

function scrubAudioUrlForTeam(round) {
  if (!round || round.kind !== "audio") return round;
  return { ...round, audioUrl: null };
}

function publicStateTeam(room, forSocketId) {
  const players = [...room.players.values()].sort((a, b) => b.score - a.score);

  let currentRound = null;
  let pendingRoundMeta = null;
  let metaRoundIntro = null;
  const roundProgress = room.roundIndex >= 0 ? getRoundProgress(room.roundIndex) : null;

  if (room.phase === "META_ROUND_PENDING") {
    const block = META_ROUNDS[room.metaRoundIntroIndex];
    if (block) {
      metaRoundIntro = { number: block.number, title: block.title, description: block.description };
    }
  } else if (room.phase === "ROUND_PENDING") {
    pendingRoundMeta = getRoundProgress(room.roundIndex);
  } else if (room.phase !== "LOBBY" && room.phase !== "GAME_END" && room.phase !== "SPEED_ROUND") {
    currentRound = scrubAudioUrlForTeam(buildCurrentRound(room));
  }

  let speedRound = null;
  if (room.speedRound) {
    speedRound = {
      endsAt: room.speedRound.endsAt,
      winnerId: room.speedRound.winnerId,
      message: room.speedRound.message,
    };
  }

  return {
    phase: room.phase,
    roomCode: room.code,
    players,
    currentRound,
    pendingRoundMeta,
    metaRoundIntro: metaRoundIntro ?? null,
    roundProgress,
    speedRound,
    you: {
      id: getPlayerId(room, forSocketId) ?? "",
      isAdmin: false,
    },
  };
}

function publicStateAdmin(room) {
  const players = [...room.players.values()].sort((a, b) => b.score - a.score);

  let currentRound = null;
  let metaRoundIntro = null;
  const roundProgress = room.roundIndex >= 0 ? getRoundProgress(room.roundIndex) : null;

  if (room.phase === "META_ROUND_PENDING") {
    const block = META_ROUNDS[room.metaRoundIntroIndex];
    metaRoundIntro = block
      ? { number: block.number, title: block.title, description: block.description }
      : null;
  } else if (room.phase === "ROUND_PENDING") {
    currentRound = buildAdminPendingRound(room);
  } else if (room.phase !== "LOBBY" && room.phase !== "GAME_END" && room.phase !== "SPEED_ROUND") {
    currentRound = buildCurrentRound(room);
  }

  let speedRound = null;
  if (room.speedRound) {
    speedRound = {
      endsAt: room.speedRound.endsAt,
      winnerId: room.speedRound.winnerId,
      message: room.speedRound.message,
    };
  }

  return {
    phase: room.phase,
    roomCode: room.code,
    players,
    currentRound,
    pendingRoundMeta: null,
    metaRoundIntro: metaRoundIntro ?? null,
    roundProgress,
    speedRound,
    you: { id: "", isAdmin: true },
  };
}

function broadcastPublicState(room) {
  for (const socketId of room.socketToPlayer.keys()) {
    const sock = io.sockets.sockets.get(socketId);
    if (sock) sock.emit("state", publicStateTeam(room, socketId));
  }
  if (room.adminSocketId) {
    const sock = io.sockets.sockets.get(room.adminSocketId);
    if (sock) sock.emit("state", publicStateAdmin(room));
  }
}

function startRound(room, index) {
  clearRoundTimers(room);
  room.roundIndex = index;
  room.roundCorrectPlayerIds = new Set();
  room.wrongGuessers = new Set();
  room.audioAnswerStartedAt = null;

  const round = ROUNDS[index];
  if (round?.kind === "audio") {
    room.phase = "AUDIO_LISTEN";
    room.roundStartedAt = null;
    broadcastPublicState(room);
    return;
  }

  room.phase = "ROUND_PLAY";
  room.roundStartedAt = Date.now();

  room.roundTimer = setTimeout(() => endRound(room, "time"), ROUND_DURATION_MS);

  room.tickInterval = setInterval(() => {
    if (room.phase !== "ROUND_PLAY") {
      clearInterval(room.tickInterval);
      room.tickInterval = null;
      return;
    }
    broadcastPublicState(room);
  }, 1500);

  broadcastPublicState(room);
}

function endRound(room, reason) {
  clearRoundTimers(room);
  room.phase = "ROUND_REVEAL";
  broadcastPublicState(room);
}

function finishGame(room) {
  clearRoundTimers(room);
  clearSpeedRound(room);
  const sorted = [...room.players.values()].sort((a, b) => b.score - a.score);
  const top = sorted[0]?.score ?? 0;
  const tied = sorted.filter((p) => p.score === top);
  if (tied.length > 1) {
    room.phase = "SPEED_ROUND";
    const endsAt = Date.now() + 12_000;
    room.speedRound = { endsAt, winnerId: null, message: "Fastest tap wins the tiebreak!" };
    broadcastPublicState(room);
    room.speedTimeout = setTimeout(() => {
      if (room.speedRound && !room.speedRound.winnerId) {
        room.speedRound.message = "Time! No tap — tie stands. Great game!";
        broadcastPublicState(room);
      }
      setTimeout(() => {
        room.phase = "GAME_END";
        clearSpeedRound(room);
        broadcastPublicState(room);
      }, 3000);
    }, 12_500);
  } else {
    room.phase = "GAME_END";
    broadcastPublicState(room);
  }
}

function awardTimedRoundPoints(room, playerId, elapsedMs, durationMs) {
  const ratio = Math.max(0, 1 - elapsedMs / durationMs);
  const points = Math.round(MAX_ROUND_SCORE * ratio);
  const p = room.players.get(playerId);
  if (p) p.score += Math.max(10, points);
}

io.on("connection", (socket) => {
  socket.on("adminCreateRoom", ({ roomCode, adminName }, cb) => {
    const norm = normalizeRoomCode(roomCode);
    if (!norm.ok) {
      cb?.({ ok: false, error: norm.error });
      return;
    }
    if (rooms.has(norm.code)) {
      cb?.({ ok: false, error: "That room code is already in use." });
      return;
    }
    const adminToken = newAdminToken();
    const room = createEmptyRoom(norm.code, socket.id, adminToken, adminName);
    rooms.set(norm.code, room);
    socket.join(room.code);
    cb?.({ ok: true, roomCode: room.code, adminToken });
    socket.emit("state", publicStateAdmin(room));
  });

  socket.on("rejoinAdmin", ({ roomCode, adminToken }, cb) => {
    const code = String(roomCode || "")
      .toUpperCase()
      .replace(/\s/g, "");
    const room = rooms.get(code);
    if (!room || room.adminToken !== String(adminToken || "")) {
      cb?.({ ok: false, error: "Invalid session or room." });
      return;
    }
    room.adminSocketId = socket.id;
    socket.join(room.code);
    cb?.({ ok: true, roomCode: room.code });
    socket.emit("state", publicStateAdmin(room));
  });

  socket.on("joinRoom", ({ roomCode, teamName }, cb) => {
    const code = String(roomCode || "")
      .toUpperCase()
      .replace(/\s/g, "");
    const room = rooms.get(code);
    if (!room) {
      cb?.({ ok: false, error: "Room not found." });
      return;
    }
    if (room.phase !== "LOBBY") {
      cb?.({ ok: false, error: "Game already started." });
      return;
    }
    const name = String(teamName || "").trim().slice(0, 24);
    if (!name.length) {
      cb?.({ ok: false, error: "Enter a team name." });
      return;
    }
    const playerId = `p_${socket.id}`;
    room.players.set(playerId, { id: playerId, name, score: 0 });
    room.socketToPlayer.set(socket.id, playerId);
    socket.join(room.code);
    cb?.({ ok: true, roomCode: room.code, playerId });
    broadcastPublicState(room);
  });

  socket.on("rejoinTeam", ({ roomCode, playerId }, cb) => {
    const code = String(roomCode || "")
      .toUpperCase()
      .replace(/\s/g, "");
    const room = rooms.get(code);
    if (!room || !room.players.has(String(playerId || ""))) {
      cb?.({ ok: false, error: "Room not found or team not in room." });
      return;
    }
    const pid = String(playerId);
    room.socketToPlayer.set(socket.id, pid);
    socket.join(room.code);
    cb?.({ ok: true, roomCode: room.code, playerId: pid });
    socket.emit("state", publicStateTeam(room, socket.id));
  });

  socket.on("startGame", () => {
    const room = getRoomForSocket(socket);
    if (!room || !isAdminSocket(room, socket.id)) return;
    if (room.players.size < 1) return;
    if (room.phase !== "LOBBY") return;
    clearRoundTimers(room);
    room.metaRoundIntroIndex = 0;
    room.roundIndex = -1;
    room.roundCorrectPlayerIds = new Set();
    room.wrongGuessers = new Set();
    room.audioAnswerStartedAt = null;
    room.roundStartedAt = null;
    room.phase = "META_ROUND_PENDING";
    broadcastPublicState(room);
  });

  socket.on("adminBeginRound", () => {
    const room = getRoomForSocket(socket);
    if (!room || !isAdminSocket(room, socket.id)) return;
    if (room.phase === "META_ROUND_PENDING") {
      room.roundIndex = firstQuestionIndexForMetaIntro(room.metaRoundIntroIndex);
      room.phase = "ROUND_PENDING";
      broadcastPublicState(room);
      return;
    }
    if (room.phase !== "ROUND_PENDING") return;
    startRound(room, room.roundIndex);
  });

  socket.on("adminContinueAfterReveal", () => {
    const room = getRoomForSocket(socket);
    if (!room || !isAdminSocket(room, socket.id)) return;
    if (room.phase !== "ROUND_REVEAL") return;
    clearRoundTimers(room);
    if (room.roundIndex >= ROUNDS.length - 1) {
      finishGame(room);
    } else if (room.roundIndex === VISUAL_QUESTION_COUNT - 1) {
      room.metaRoundIntroIndex = 1;
      room.roundIndex = -1;
      room.roundCorrectPlayerIds = new Set();
      room.wrongGuessers = new Set();
      room.audioAnswerStartedAt = null;
      room.roundStartedAt = null;
      room.phase = "META_ROUND_PENDING";
      broadcastPublicState(room);
    } else if (room.roundIndex === VISUAL_QUESTION_COUNT + AUDIO_QUESTION_COUNT - 1) {
      room.metaRoundIntroIndex = 2;
      room.roundIndex = -1;
      room.roundCorrectPlayerIds = new Set();
      room.wrongGuessers = new Set();
      room.audioAnswerStartedAt = null;
      room.roundStartedAt = null;
      room.phase = "META_ROUND_PENDING";
      broadcastPublicState(room);
    } else {
      room.roundIndex += 1;
      room.roundCorrectPlayerIds = new Set();
      room.wrongGuessers = new Set();
      room.audioAnswerStartedAt = null;
      room.roundStartedAt = null;
      room.phase = "ROUND_PENDING";
      broadcastPublicState(room);
    }
  });

  socket.on("submitGuess", ({ guess }) => {
    const room = getRoomForSocket(socket);
    if (!room) return;
    const text = String(guess || "");
    const playerId = getPlayerId(room, socket.id);
    const round = ROUNDS[room.roundIndex];
    if (!playerId || !round) return;

    const isAudio = round.kind === "audio";
    const isMcqOrRiddle =
      round.kind === "mcq" || round.kind === "riddle";
    const canVisual = room.phase === "ROUND_PLAY" && round.kind === "visual";
    const canMcqRiddle = room.phase === "ROUND_PLAY" && isMcqOrRiddle;
    const canAudio = room.phase === "AUDIO_ANSWER" && isAudio && room.audioAnswerStartedAt;
    if (!canVisual && !canAudio && !canMcqRiddle) return;

    let normalized = normalizeGuess(text);
    normalized = normalizedGuessWithMcqLetter(normalized, round);
    const minLen = round.kind === "mcq" ? 1 : 2;
    if (normalized.length < minLen) {
      socket.emit("guessResult", { ok: false, message: "Guess a bit longer." });
      return;
    }

    if (matchesAnswer(normalized, round)) {
      if (room.roundCorrectPlayerIds.has(playerId)) {
        socket.emit("guessResult", { ok: false, message: "You already got this one right!" });
        return;
      }
      const elapsed = canAudio
        ? Date.now() - room.audioAnswerStartedAt
        : Date.now() - room.roundStartedAt;
      const duration =
        canAudio ? AUDIO_ANSWER_DURATION_MS : ROUND_DURATION_MS;
      room.roundCorrectPlayerIds.add(playerId);
      awardTimedRoundPoints(room, playerId, elapsed, duration);
      broadcastPublicState(room);
      socket.emit("guessResult", { ok: true, message: "Correct!" });
      return;
    }

    if (!room.wrongGuessers.has(playerId)) {
      room.wrongGuessers.add(playerId);
      const p = room.players.get(playerId);
      if (p) p.score = Math.max(0, p.score - WRONG_GUESS_PENALTY);
    }
    broadcastPublicState(room);
    socket.emit("guessResult", { ok: false, message: "Not quite — try again!" });
  });

  socket.on("startAudioAnswerTimer", () => {
    const room = getRoomForSocket(socket);
    if (!room || !isAdminSocket(room, socket.id)) return;
    if (room.phase !== "AUDIO_LISTEN") return;
    const round = ROUNDS[room.roundIndex];
    if (!round || round.kind !== "audio") return;
    if (room.audioAnswerStartedAt != null) return;

    room.phase = "AUDIO_ANSWER";
    room.audioAnswerStartedAt = Date.now();

    room.roundTimer = setTimeout(() => endRound(room, "time"), AUDIO_ANSWER_DURATION_MS);
    room.tickInterval = setInterval(() => {
      if (room.phase !== "AUDIO_ANSWER") {
        clearInterval(room.tickInterval);
        room.tickInterval = null;
        return;
      }
      broadcastPublicState(room);
    }, 1500);
    broadcastPublicState(room);
  });

  socket.on("replayAudio", () => {
    const room = getRoomForSocket(socket);
    if (!room || !isAdminSocket(room, socket.id)) return;
    const round = ROUNDS[room.roundIndex];
    if (!round || round.kind !== "audio") return;
    io.to(room.code).emit("audioReplay", { roundIndex: room.roundIndex, t: Date.now() });
  });

  socket.on("speedTap", () => {
    const room = getRoomForSocket(socket);
    if (!room) return;
    const playerId = getPlayerId(room, socket.id);
    if (!playerId || room.phase !== "SPEED_ROUND" || !room.speedRound) return;
    if (room.speedRound.winnerId) return;
    if (Date.now() > room.speedRound.endsAt) return;

    room.speedRound.winnerId = playerId;
    room.speedRound.message = "We have a winner!";
    const p = room.players.get(playerId);
    if (p) p.score += SPEED_ROUND_BONUS;
    broadcastPublicState(room);

    clearTimeout(room.speedTimeout);
    room.speedTimeout = setTimeout(() => {
      room.phase = "GAME_END";
      clearSpeedRound(room);
      broadcastPublicState(room);
    }, 4000);
  });

  socket.on("disconnect", () => {
    for (const [code, room] of rooms.entries()) {
      if (room.adminSocketId === socket.id) {
        room.adminSocketId = null;
        if (room.phase === "LOBBY" && room.players.size === 0) {
          deleteRoom(code);
        } else {
          broadcastPublicState(room);
        }
        continue;
      }
      const pid = room.socketToPlayer.get(socket.id);
      if (pid) {
        room.socketToPlayer.delete(socket.id);
        if (room.phase === "LOBBY") {
          room.players.delete(pid);
          broadcastPublicState(room);
        }
      }
    }

    for (const [code, room] of [...rooms.entries()]) {
      const stale =
        room.phase === "LOBBY" &&
        room.adminSocketId == null &&
        room.players.size === 0;
      if (stale) deleteRoom(code);
    }
  });
});

if (serveSpa) {
  app.get("*", (_req, res) => {
    res.sendFile(distIndex);
  });
}

const PORT = Number(process.env.PORT) || 3001;
server.listen(PORT, () => {
  console.log(`Mystery Asset Pack server on http://localhost:${PORT}`);
});
