import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getSocket } from "../getSocket";
import type { GameState } from "../types";
import { teamSessionKey } from "../storageKeys";

function formatMs(ms: number) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function TeamPlay() {
  const { roomCode = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<GameState | null>(null);
  const [guess, setGuess] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [roundSync, setRoundSync] = useState({ at: Date.now(), leftMs: 0 });

  const code = roomCode.toUpperCase();

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (
      (state?.phase === "ROUND_PLAY" || state?.phase === "AUDIO_ANSWER") &&
      state.currentRound
    ) {
      setRoundSync({ at: Date.now(), leftMs: state.currentRound.timeLeftMs });
    }
  }, [state?.phase, state?.currentRound?.index, state?.currentRound?.timeLeftMs]);

  useEffect(() => {
    setToast(null);
  }, [state?.phase, state?.currentRound?.index]);

  useEffect(() => {
    const sock = getSocket();
    const raw = sessionStorage.getItem(teamSessionKey(code));
    if (!raw) {
      navigate(`/join?code=${encodeURIComponent(code)}`, { replace: true });
      return;
    }
    const { playerId } = JSON.parse(raw) as { playerId: string; teamName: string };
    sock.emit("rejoinTeam", { roomCode: code, playerId }, (res: { ok: boolean }) => {
      if (!res?.ok) {
        sessionStorage.removeItem(teamSessionKey(code));
        navigate("/join", { replace: true });
      }
    });

    const onState = (s: GameState) => setState(s);
    const onGuess = (g: { ok: boolean; message: string }) => {
      setToast({ kind: g.ok ? "ok" : "err", text: g.message });
      if (g.ok) setGuess("");
    };

    sock.on("state", onState);
    sock.on("guessResult", onGuess);
    return () => {
      sock.off("state", onState);
      sock.off("guessResult", onGuess);
    };
  }, [code, navigate]);

  const you = state?.you;
  const sortedPlayers = useMemo(() => {
    if (!state?.players) return [];
    return [...state.players].sort((a, b) => b.score - a.score);
  }, [state?.players]);

  const onSubmitGuess = (e: FormEvent) => {
    e.preventDefault();
    const g = guess.trim();
    if (!g) return;
    getSocket().emit("submitGuess", { guess: g });
  };

  const onSpeedTap = () => {
    getSocket().emit("speedTap");
  };

  if (!state) {
    return (
      <div className="shell">
        <p className="lede">Connecting…</p>
      </div>
    );
  }

  if (state.phase === "DISCONNECTED") {
    return (
      <div className="shell">
        <h1>Room closed</h1>
        <p className="lede">{state.message ?? "The session ended."}</p>
        <Link className="btn btn-primary" to="/join" style={{ display: "inline-block", textDecoration: "none" }}>
          Join again
        </Link>
      </div>
    );
  }

  const round = state.currentRound;
  const rp = state.roundProgress;
  const questionLabel = () => {
    const r = round;
    const m = r?.metaRoundNumber ?? rp?.metaRoundNumber;
    const q = r?.questionInMeta ?? rp?.questionInMeta;
    const t = r?.questionsInMeta ?? rp?.questionsInMeta;
    if (m != null && q != null && t != null) {
      return `Round ${m} — Question ${q} / ${t}`;
    }
    if (r) return `Question ${r.index + 1} / ${r.totalRounds}`;
    return "Question";
  };
  const youSolvedThisRound = Boolean(
    you?.id && round?.correctPlayerIds?.includes(you.id),
  );
  const canGuess = Boolean(
    round &&
      you?.id &&
      !youSolvedThisRound &&
      ((state.phase === "ROUND_PLAY" && round.kind === "visual") ||
        (state.phase === "ROUND_PLAY" && (round.kind === "mcq" || round.kind === "riddle")) ||
        (state.phase === "AUDIO_ANSWER" && round.kind === "audio" && round.answerWindowActive)),
  );

  const roundPlayMs =
    state.phase === "ROUND_PLAY" || state.phase === "AUDIO_ANSWER"
      ? Math.max(0, roundSync.leftMs - (now - roundSync.at))
      : round?.timeLeftMs ?? 0;

  const pending = state.pendingRoundMeta;

  return (
    <div className="shell">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
        {state.roomCode ? <span className="pill">Room {state.roomCode}</span> : null}
        <span className="pill">Team</span>
        <Link to="/" className="btn btn-ghost" style={{ textDecoration: "none", marginLeft: "auto" }}>
          Home
        </Link>
      </div>

      <div
        className="card"
        style={
          state.phase === "META_ROUND_PENDING"
            ? { textAlign: "center", maxWidth: 480, margin: "2rem auto 0" }
            : undefined
        }
      >
          {state.phase === "LOBBY" ? (
            <>
              <h2 style={{ marginTop: 0 }}>Lobby</h2>
              <p className="lede" style={{ marginBottom: 0 }}>
                Wait until the facilitator starts the game…
              </p>
            </>
          ) : null}

          {state.phase === "META_ROUND_PENDING" && state.metaRoundIntro ? (
            <>
              <h2 style={{ marginTop: 0 }}>{state.metaRoundIntro.title}</h2>
              <p className="lede" style={{ marginBottom: 0 }}>
                Wait until the facilitator starts this round…
              </p>
            </>
          ) : null}

          {state.phase === "ROUND_PENDING" && pending ? (
            <>
              <h2 style={{ marginTop: 0 }}>
                Round {pending.metaRoundNumber} — Question {pending.questionInMeta} / {pending.questionsInMeta}
              </h2>
              <p className="lede" style={{ marginBottom: 0 }}>
                Wait until the facilitator starts this question…
              </p>
            </>
          ) : null}

          {state.phase === "SPEED_ROUND" && state.speedRound ? (
            <>
              <h2 style={{ marginTop: 0 }}>Tiebreak</h2>
              <p className="lede">{state.speedRound.message}</p>
              <button
                className="btn btn-tap"
                type="button"
                onClick={onSpeedTap}
                disabled={Boolean(state.speedRound.winnerId) || now > state.speedRound.endsAt}
              >
                TAP!
              </button>
              <p className="timer" style={{ marginTop: "0.75rem", textAlign: "center" }}>
                {formatMs(Math.max(0, state.speedRound.endsAt - now))} left
              </p>
            </>
          ) : null}

          {state.phase === "GAME_END" ? (
            <>
              <h2 style={{ marginTop: 0 }}>Game over</h2>
              <p className="lede" style={{ marginBottom: 0 }}>
                Thanks for playing. The facilitator has the final standings.
              </p>
            </>
          ) : null}

          {(state.phase === "ROUND_PLAY" ||
            state.phase === "ROUND_REVEAL" ||
            state.phase === "AUDIO_LISTEN" ||
            state.phase === "AUDIO_ANSWER") &&
          round ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
                <h2 style={{ marginTop: 0 }}>{questionLabel()}</h2>
                {state.phase === "ROUND_PLAY" || state.phase === "AUDIO_ANSWER" ? (
                  <span className="timer">{formatMs(roundPlayMs)}</span>
                ) : state.phase === "ROUND_REVEAL" ? (
                  <span className="pill">Reveal</span>
                ) : (
                  <span className="pill">Listen</span>
                )}
              </div>

              {round.roundPrompt ? <p className="round-prompt">{round.roundPrompt}</p> : null}

              {round.kind === "audio" ? (
                <>
                  {round.movieQuestion ? (
                    <p className="lede" style={{ fontWeight: 600, color: "var(--text)", marginBottom: "0.75rem" }}>
                      {round.movieQuestion}
                    </p>
                  ) : null}
                  {state.phase === "AUDIO_LISTEN" ? (
                    <p className="lede" style={{ marginBottom: "1rem" }}>
                      Listen while the facilitator plays the clip from their screen. The answer box opens when they start
                      the 45-second timer.
                    </p>
                  ) : null}
                </>
              ) : round.kind === "mcq" ? (
                <>
                  {round.questionText ? (
                    <p className="lede" style={{ fontWeight: 600, color: "var(--text)", marginBottom: "1rem" }}>
                      {round.questionText}
                    </p>
                  ) : null}
                  {round.options?.length && state.phase === "ROUND_PLAY" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                      {round.options.map((opt, i) => (
                        <button
                          key={i}
                          type="button"
                          className="btn btn-ghost"
                          style={{ justifyContent: "flex-start", textAlign: "left" }}
                          disabled={!canGuess}
                          onClick={() => getSocket().emit("submitGuess", { guess: String.fromCharCode(65 + i) })}
                        >
                          <strong style={{ marginRight: "0.5rem" }}>{String.fromCharCode(65 + i)}.</strong>
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : round.kind === "riddle" ? (
                <>
                  {round.questionText ? (
                    <p className="lede" style={{ fontWeight: 600, color: "var(--text)", marginBottom: "1rem" }}>
                      {round.questionText}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  {round.image ? (
                    <div className="asset-frame">
                      <img
                        src={round.image}
                        alt="Mystery asset"
                        style={{
                          filter: state.phase === "ROUND_REVEAL" ? "none" : `blur(${round.blurPx}px)`,
                        }}
                      />
                    </div>
                  ) : null}

                  {round.hints.length ? (
                    <ul className="hint-list">
                      {round.hints.map((h) => (
                        <li key={h}>Hint: {h}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="lede" style={{ fontSize: "0.95rem" }}>
                      Hints unlock at the start, then at 15s and 30s. The image stays fully blurred for the first 30s, then
                      clears slightly in steps. You have 45 seconds — faster correct guesses score higher.
                    </p>
                  )}
                </>
              )}

              {state.phase === "ROUND_REVEAL" && round.revealAnswer ? (
                <>
                  <div className="toast ok">
                    Answer: <strong>{round.revealAnswer}</strong>
                    {round.correctPlayerIds?.length ? (
                      <>
                        {" "}
                        — scored this round:{" "}
                        <strong>
                          {round.correctPlayerIds
                            .map((id) => sortedPlayers.find((p) => p.id === id)?.name ?? id)
                            .join(", ")}
                        </strong>
                      </>
                    ) : (
                      <> — no team scored this round.</>
                    )}
                  </div>
                  <p className="lede" style={{ fontSize: "0.9rem", marginBottom: 0, marginTop: "1rem" }}>
                    Hold tight — the facilitator will move everyone to the next round when ready.
                  </p>
                </>
              ) : null}

              {(state.phase === "ROUND_PLAY" || state.phase === "AUDIO_ANSWER") &&
                round.kind !== "mcq" && (
                <form onSubmit={onSubmitGuess}>
                  <div className="field">
                    <label htmlFor="guess">
                      {round.kind === "audio"
                        ? "Movie name"
                        : round.kind === "riddle"
                          ? "Your answer"
                          : "Your guess"}
                    </label>
                    <input
                      id="guess"
                      value={guess}
                      onChange={(e) => setGuess(e.target.value)}
                      placeholder={
                        round.kind === "audio"
                          ? "Type the movie title…"
                          : round.kind === "riddle"
                            ? "Type the riddle answer…"
                            : "What is it?"
                      }
                      autoComplete="off"
                      disabled={!canGuess}
                    />
                  </div>
                  <button className="btn btn-primary" type="submit" style={{ marginTop: "0.75rem" }} disabled={!canGuess}>
                    Submit
                  </button>
                </form>
              )}
            </>
          ) : null}

          {toast ? (
            <div className={`toast ${toast.kind === "ok" ? "ok" : "err"}`} style={{ marginTop: "0.75rem" }}>
              {toast.text}
            </div>
          ) : null}
      </div>
    </div>
  );
}
