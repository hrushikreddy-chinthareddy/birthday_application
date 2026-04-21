import express from "express";
import http from "http";
import path from "path";
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
} from "./rounds.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const isProd = process.env.NODE_ENV === "production";

const app = express();
app.use(cors({ origin: true, credentials: true }));

if (isProd) {
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
    roundTimer: null,
    hintTimer: null,
    tickInterval: null,
    roundWinnerId: null,
    roundSolvedAt: null,
    /** @type {Set<string>} */
    wrongGuessers: new Set(),
    speedRound: null,
    /** @type {NodeJS.Timeout | null} */
    speedTimeout: null,
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

function publicStateTeam(room, forSocketId) {
  const players = [...room.players.values()].sort((a, b) => b.score - a.score);
  const round = room.roundIndex >= 0 && room.roundIndex < ROUNDS.length ? ROUNDS[room.roundIndex] : null;

  let currentRound = null;
  if (
    room.phase !== "LOBBY" &&
    room.phase !== "GAME_END" &&
    room.phase !== "SPEED_ROUND" &&
    round
  ) {
    const elapsed = room.roundStartedAt ? Date.now() - room.roundStartedAt : 0;
    const hintsAvailable = Math.min(MAX_HINTS, Math.floor(elapsed / HINT_INTERVAL_MS));
    const hints = round.hints.slice(0, hintsAvailable);

    const timeLeft = Math.max(0, ROUND_DURATION_MS - elapsed);
    const blur =
      room.phase === "ROUND_REVEAL" || room.phase === "SPEED_ROUND"
        ? 0
        : Math.max(0, 12 - hintsAvailable * 3);

    currentRound = {
      index: room.roundIndex,
      totalRounds: ROUNDS.length,
      image: round.image,
      hints,
      timeLeftMs: room.phase === "ROUND_PLAY" ? timeLeft : 0,
      blurPx: blur,
      cropPct:
        room.phase === "ROUND_REVEAL" || room.phase === "SPEED_ROUND"
          ? 100
          : 55 + hintsAvailable * 12,
      revealAnswer: room.phase === "ROUND_REVEAL" ? round.answer : null,
      winnerId: room.roundWinnerId,
      roundSolvedAt: room.roundSolvedAt,
    };
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
    speedRound,
    you: {
      id: getPlayerId(room, forSocketId) ?? "",
      isAdmin: false,
    },
  };
}

function publicStateAdmin(room) {
  const players = [...room.players.values()].sort((a, b) => b.score - a.score);
  const round = room.roundIndex >= 0 && room.roundIndex < ROUNDS.length ? ROUNDS[room.roundIndex] : null;

  let currentRound = null;
  if (
    room.phase !== "LOBBY" &&
    room.phase !== "GAME_END" &&
    room.phase !== "SPEED_ROUND" &&
    round
  ) {
    const elapsed = room.roundStartedAt ? Date.now() - room.roundStartedAt : 0;
    const hintsAvailable = Math.min(MAX_HINTS, Math.floor(elapsed / HINT_INTERVAL_MS));
    const hints = round.hints.slice(0, hintsAvailable);

    const timeLeft = Math.max(0, ROUND_DURATION_MS - elapsed);
    const blur =
      room.phase === "ROUND_REVEAL" || room.phase === "SPEED_ROUND"
        ? 0
        : Math.max(0, 12 - hintsAvailable * 3);

    currentRound = {
      index: room.roundIndex,
      totalRounds: ROUNDS.length,
      image: round.image,
      hints,
      timeLeftMs: room.phase === "ROUND_PLAY" ? timeLeft : 0,
      blurPx: blur,
      cropPct:
        room.phase === "ROUND_REVEAL" || room.phase === "SPEED_ROUND"
          ? 100
          : 55 + hintsAvailable * 12,
      revealAnswer: room.phase === "ROUND_REVEAL" ? round.answer : null,
      winnerId: room.roundWinnerId,
      roundSolvedAt: room.roundSolvedAt,
    };
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
  room.phase = "ROUND_PLAY";
  room.roundIndex = index;
  room.roundStartedAt = Date.now();
  room.roundWinnerId = null;
  room.roundSolvedAt = null;
  room.wrongGuessers = new Set();

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

  setTimeout(() => {
    if (room.roundIndex >= ROUNDS.length - 1) {
      finishGame(room);
    } else {
      startRound(room, room.roundIndex + 1);
    }
  }, 5000);
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

function awardRoundPoints(room, playerId, elapsedMs) {
  const ratio = Math.max(0, 1 - elapsedMs / ROUND_DURATION_MS);
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
    startRound(room, 0);
  });

  socket.on("submitGuess", ({ guess }) => {
    const room = getRoomForSocket(socket);
    if (!room) return;
    const text = String(guess || "");
    const playerId = getPlayerId(room, socket.id);
    if (!playerId || room.phase !== "ROUND_PLAY") return;

    const round = ROUNDS[room.roundIndex];
    if (!round) return;

    if (room.roundWinnerId) {
      socket.emit("guessResult", { ok: false, message: "Someone already solved this round!" });
      return;
    }

    const normalized = normalizeGuess(text);
    if (normalized.length < 2) {
      socket.emit("guessResult", { ok: false, message: "Guess a bit longer." });
      return;
    }

    if (matchesAnswer(normalized, round)) {
      const elapsed = Date.now() - room.roundStartedAt;
      room.roundWinnerId = playerId;
      room.roundSolvedAt = Date.now();
      awardRoundPoints(room, playerId, elapsed);
      broadcastPublicState(room);
      clearRoundTimers(room);
      setTimeout(() => endRound(room, "solved"), 3500);
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

if (isProd) {
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

const PORT = Number(process.env.PORT) || 3001;
server.listen(PORT, () => {
  console.log(`Mystery Asset Pack server on http://localhost:${PORT}`);
});
