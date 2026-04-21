import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { getSocket } from "../getSocket";
import type { GameState } from "../types";
import { adminSessionKey, joinUrlForCode } from "../storageKeys";

function formatMs(ms: number) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function AdminRoom() {
  const { roomCode = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<GameState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [roundSync, setRoundSync] = useState({ at: Date.now(), leftMs: 0 });
  const [joinUrl, setJoinUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const code = roomCode.toUpperCase();

  useEffect(() => {
    setJoinUrl(joinUrlForCode(code));
  }, [code]);

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
    const raw = sessionStorage.getItem(adminSessionKey(code));
    if (!raw) {
      navigate("/admin", { replace: true });
      return;
    }
    const { adminToken } = JSON.parse(raw) as { adminToken: string; adminName?: string };
    sock.emit("rejoinAdmin", { roomCode: code, adminToken }, (res: { ok: boolean }) => {
      if (!res?.ok) {
        sessionStorage.removeItem(adminSessionKey(code));
        navigate("/admin", { replace: true });
      }
    });

    const onState = (s: GameState) => setState(s);
    sock.on("state", onState);
    return () => {
      sock.off("state", onState);
    };
  }, [code, navigate]);

  const sortedPlayers = useMemo(() => {
    if (!state?.players) return [];
    return [...state.players].sort((a, b) => b.score - a.score);
  }, [state?.players]);

  const onStart = (e: FormEvent) => {
    e.preventDefault();
    getSocket().emit("startGame");
  };

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
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
        <Link className="btn btn-primary" to="/admin" style={{ display: "inline-block", textDecoration: "none" }}>
          New session
        </Link>
      </div>
    );
  }

  const round = state.currentRound;
  const roundPlayMs =
    state.phase === "ROUND_PLAY" && round
      ? Math.max(0, roundSync.leftMs - (now - roundSync.at))
      : round?.timeLeftMs ?? 0;
  const inLobby = state.phase === "LOBBY";
  const canStart = inLobby && sortedPlayers.length > 0;

  return (
    <div className="shell">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
        {state.roomCode ? <span className="pill">Room {state.roomCode}</span> : null}
        <span className="pill">Admin</span>
        <Link to="/" className="btn btn-ghost" style={{ textDecoration: "none", marginLeft: "auto" }}>
          Home
        </Link>
      </div>

      {inLobby ? (
        <div className="grid-2">
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Share with teams</h2>
            <p className="lede" style={{ fontSize: "0.95rem" }}>
              Teams open this link or scan the QR, then enter their team name.
            </p>
            {joinUrl ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
                <QRCodeSVG value={joinUrl} size={180} level="M" />
                <code style={{ fontSize: "0.8rem", wordBreak: "break-all", textAlign: "center", color: "var(--muted)" }}>
                  {joinUrl}
                </code>
                <button type="button" className="btn btn-ghost" onClick={onCopyLink}>
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            ) : null}

            <h3 style={{ marginBottom: "0.5rem" }}>Teams in lobby</h3>
            {sortedPlayers.length === 0 ? (
              <p className="lede" style={{ marginBottom: "1rem" }}>
                No teams yet — share the link or code <strong>{state.roomCode}</strong>.
              </p>
            ) : (
              <ol className="leaderboard">
                {sortedPlayers.map((p, i) => (
                  <li key={p.id}>
                    <span>
                      <span style={{ opacity: 0.6, marginRight: "0.35rem" }}>{i + 1}.</span>
                      {p.name}
                    </span>
                    <span style={{ fontFamily: "var(--mono)", opacity: 0.5 }}>ready</span>
                  </li>
                ))}
              </ol>
            )}

            <form onSubmit={onStart} style={{ marginTop: "1.25rem" }}>
              <button className="btn btn-primary" type="submit" disabled={!canStart}>
                Start game
              </button>
              {!canStart && sortedPlayers.length === 0 ? (
                <p className="lede" style={{ fontSize: "0.85rem", marginTop: "0.75rem", marginBottom: 0 }}>
                  At least one team must join before you can start.
                </p>
              ) : null}
            </form>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Facilitator</h2>
            <p className="lede" style={{ fontSize: "0.95rem" }}>
              You control when the run begins. Teams only see rounds after you start.
            </p>
            <p className="lede" style={{ fontSize: "0.9rem", marginBottom: 0 }}>
              If you refresh this page, your session is restored from this browser as long as the room still exists.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid-2">
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Live session</h2>
            {state.phase === "SPEED_ROUND" && state.speedRound ? (
              <p className="lede">{state.speedRound.message}</p>
            ) : null}
            {state.phase === "GAME_END" ? <p className="lede">Game over — final standings are on the right.</p> : null}

            {(state.phase === "ROUND_PLAY" || state.phase === "ROUND_REVEAL") && round ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
                  <h3 style={{ marginTop: 0 }}>
                    Round {round.index + 1} / {round.totalRounds}
                  </h3>
                  {state.phase === "ROUND_PLAY" ? (
                    <span className="timer">{formatMs(roundPlayMs)}</span>
                  ) : (
                    <span className="pill">Reveal</span>
                  )}
                </div>
                <div className="asset-frame">
                  <img
                    src={round.image}
                    alt="Round preview"
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
                {state.phase === "ROUND_REVEAL" && round.revealAnswer ? (
                  <div className="toast ok">
                    Answer: <strong>{round.revealAnswer}</strong>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Leaderboard</h3>
            <ol className="leaderboard">
              {sortedPlayers.map((p, i) => (
                <li key={p.id}>
                  <span>
                    <span style={{ opacity: 0.6, marginRight: "0.35rem" }}>{i + 1}.</span>
                    {p.name}
                  </span>
                  <span style={{ fontFamily: "var(--mono)" }}>{p.score}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
