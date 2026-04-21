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
    if (state?.phase === "ROUND_PLAY" && state.currentRound) {
      setRoundSync({ at: Date.now(), leftMs: state.currentRound.timeLeftMs });
    }
  }, [state?.phase, state?.currentRound?.index, state?.currentRound?.timeLeftMs]);

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
  const canGuess = state.phase === "ROUND_PLAY" && round && !round.winnerId && you?.id;

  const roundPlayMs =
    state.phase === "ROUND_PLAY" ? Math.max(0, roundSync.leftMs - (now - roundSync.at)) : round?.timeLeftMs ?? 0;

  return (
    <div className="shell">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
        {state.roomCode ? <span className="pill">Room {state.roomCode}</span> : null}
        <span className="pill">Team</span>
        <Link to="/" className="btn btn-ghost" style={{ textDecoration: "none", marginLeft: "auto" }}>
          Home
        </Link>
      </div>

      <div className="grid-2">
        <div className="card">
          {state.phase === "LOBBY" ? (
            <>
              <h2 style={{ marginTop: 0 }}>Lobby</h2>
              <p className="lede" style={{ marginBottom: 0 }}>
                Waiting for the facilitator to start the game…
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
              <h2 style={{ marginTop: 0 }}>Final scores</h2>
              <p className="lede">Thanks for playing.</p>
            </>
          ) : null}

          {(state.phase === "ROUND_PLAY" || state.phase === "ROUND_REVEAL") && round ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
                <h2 style={{ marginTop: 0 }}>
                  Round {round.index + 1} / {round.totalRounds}
                </h2>
                {state.phase === "ROUND_PLAY" ? (
                  <span className="timer">{formatMs(roundPlayMs)}</span>
                ) : (
                  <span className="pill">Reveal</span>
                )}
              </div>

              <div className="asset-frame">
                <img
                  src={round.image}
                  alt="Mystery asset"
                  style={{
                    filter: state.phase === "ROUND_REVEAL" ? "none" : `blur(${round.blurPx}px)`,
                    transform: state.phase === "ROUND_REVEAL" ? "scale(1)" : `scale(${100 / round.cropPct})`,
                    objectPosition: "center",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    boxShadow: state.phase === "ROUND_REVEAL" ? "none" : "inset 0 0 0 120px rgba(0,0,0,0.65)",
                    pointerEvents: "none",
                  }}
                />
              </div>

              {round.hints.length ? (
                <ul className="hint-list">
                  {round.hints.map((h) => (
                    <li key={h}>Hint: {h}</li>
                  ))}
                </ul>
              ) : (
                <p className="lede" style={{ fontSize: "0.95rem" }}>
                  Hints unlock over time — or solve early for more points.
                </p>
              )}

              {state.phase === "ROUND_REVEAL" && round.revealAnswer ? (
                <div className="toast ok">
                  Answer: <strong>{round.revealAnswer}</strong>
                  {round.winnerId ? (
                    <>
                      {" "}
                      — solved by{" "}
                      <strong>{sortedPlayers.find((p) => p.id === round.winnerId)?.name ?? "another team"}</strong>
                    </>
                  ) : null}
                </div>
              ) : null}

              {state.phase === "ROUND_PLAY" ? (
                <form onSubmit={onSubmitGuess}>
                  <div className="field">
                    <label htmlFor="guess">Your guess</label>
                    <input
                      id="guess"
                      value={guess}
                      onChange={(e) => setGuess(e.target.value)}
                      placeholder="What is it?"
                      autoComplete="off"
                      disabled={!canGuess}
                    />
                  </div>
                  <button className="btn btn-primary" type="submit" style={{ marginTop: "0.75rem" }} disabled={!canGuess}>
                    Submit guess
                  </button>
                </form>
              ) : null}
            </>
          ) : null}

          {toast ? (
            <div className={`toast ${toast.kind === "ok" ? "ok" : "err"}`} style={{ marginTop: "0.75rem" }}>
              {toast.text}
            </div>
          ) : null}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Leaderboard</h3>
          <ol className="leaderboard">
            {sortedPlayers.map((p, i) => (
              <li key={p.id} className={p.id === you?.id ? "me" : undefined}>
                <span>
                  <span style={{ opacity: 0.6, marginRight: "0.35rem" }}>{i + 1}.</span>
                  {p.name}
                  {p.id === you?.id ? <span style={{ opacity: 0.55 }}> (you)</span> : null}
                </span>
                <span style={{ fontFamily: "var(--mono)" }}>{p.score}</span>
              </li>
            ))}
          </ol>
          <p className="lede" style={{ fontSize: "0.85rem", marginBottom: 0, marginTop: "1rem" }}>
            Faster correct guesses score higher. First wrong guess each round costs a point.
          </p>
        </div>
      </div>
    </div>
  );
}
