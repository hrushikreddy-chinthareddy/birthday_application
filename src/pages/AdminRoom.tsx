import { type CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  const adminAudioRef = useRef<HTMLAudioElement>(null);

  const code = roomCode.toUpperCase();

  useEffect(() => {
    setJoinUrl(joinUrlForCode(code));
  }, [code]);

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
    const onReplay = () => {
      const a = adminAudioRef.current;
      if (a) {
        a.currentTime = 0;
        void a.play().catch(() => {});
      }
    };
    sock.on("state", onState);
    sock.on("audioReplay", onReplay);
    return () => {
      sock.off("state", onState);
      sock.off("audioReplay", onReplay);
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

  const onBeginRound = () => {
    getSocket().emit("adminBeginRound");
  };

  const onContinueAfterReveal = () => {
    getSocket().emit("adminContinueAfterReveal");
  };

  const onReplayAudio = () => {
    getSocket().emit("replayAudio");
  };

  const onStartAnswerTimer = () => {
    getSocket().emit("startAudioAnswerTimer");
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
  const rp = state.roundProgress;
  const roundPlayMs =
    (state.phase === "ROUND_PLAY" || state.phase === "AUDIO_ANSWER") && round
      ? Math.max(0, roundSync.leftMs - (now - roundSync.at))
      : round?.timeLeftMs ?? 0;
  const inLobby = state.phase === "LOBBY";
  const canStart = inLobby && sortedPlayers.length > 0;

  const questionLabel = (r: typeof round) => {
    const m = r?.metaRoundNumber ?? rp?.metaRoundNumber;
    const q = r?.questionInMeta ?? rp?.questionInMeta;
    const t = r?.questionsInMeta ?? rp?.questionsInMeta;
    if (m != null && q != null && t != null) {
      return `Round ${m} — Question ${q} / ${t}`;
    }
    if (r) return `Question ${r.index + 1} / ${r.totalRounds}`;
    return "Question";
  };

  const centeredCardStyle: CSSProperties = {
    textAlign: "center",
    maxWidth: 520,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  const topBar = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
      {state.roomCode ? <span className="pill">Room {state.roomCode}</span> : null}
      <span className="pill">Admin</span>
      <Link to="/" className="btn btn-ghost" style={{ textDecoration: "none", marginLeft: "auto" }}>
        Home
      </Link>
    </div>
  );

  const leaderboardOl = (
    <ol className="leaderboard" style={{ width: "100%", maxWidth: 400, margin: 0 }}>
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
  );

  if (!inLobby && state.phase === "META_ROUND_PENDING" && state.metaRoundIntro) {
    return (
      <div className="shell">
        {topBar}
        <div className="card" style={{ ...centeredCardStyle, marginTop: "1.5rem" }}>
          <h2 style={{ marginTop: 0, marginBottom: "0.75rem" }}>{state.metaRoundIntro.title}</h2>
          <p className="lede" style={{ color: "var(--text)", marginBottom: "1.5rem", maxWidth: "44ch" }}>
            {state.metaRoundIntro.description}
          </p>
          <button type="button" className="btn btn-primary" onClick={onBeginRound}>
            Start round
          </button>
        </div>
      </div>
    );
  }

  if (!inLobby && state.phase === "ROUND_PENDING" && round) {
    return (
      <div className="shell">
        {topBar}
        <div className="card" style={{ ...centeredCardStyle, marginTop: "1.5rem" }}>
          <span className="pill" style={{ marginBottom: "0.75rem" }}>
            Ready for next question
          </span>
          <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>{questionLabel(round)}</h2>
          {round.roundPrompt ? <p className="round-prompt" style={{ marginBottom: "1rem" }}>{round.roundPrompt}</p> : null}

          {round.kind === "audio" ? (
            <>
              {round.movieQuestion ? (
                <p className="lede" style={{ fontWeight: 600, color: "var(--text)", marginBottom: "0.75rem", maxWidth: "40ch" }}>
                  Teams will see: {round.movieQuestion}
                </p>
              ) : null}
              {round.audioUrl ? (
                <audio
                  key={`pending-${round.index}`}
                  ref={adminAudioRef}
                  src={round.audioUrl}
                  controls
                  style={{ width: "100%", maxWidth: 400, marginBottom: "1rem" }}
                />
              ) : null}
              <p className="lede" style={{ fontSize: "0.9rem", marginBottom: "1.25rem", maxWidth: "40ch" }}>
                Teams wait with no audio on their devices. Start the question, then play the clip and open the answer
                window when ready.
              </p>
            </>
          ) : round.kind === "mcq" || round.kind === "riddle" ? null : (
            <p className="lede" style={{ fontSize: "0.9rem", marginBottom: "1.25rem", maxWidth: "40ch" }}>
              The image stays off your screen until you start — teams then see the same blurred picture and hints.
            </p>
          )}

          <button type="button" className="btn btn-primary" onClick={onBeginRound}>
            Start question
          </button>
        </div>
      </div>
    );
  }

  if (!inLobby && state.phase === "ROUND_REVEAL" && round) {
    const isLastOverall = round.index + 1 >= round.totalRounds;
    const m = round.metaRoundNumber ?? rp?.metaRoundNumber;
    const q = round.questionInMeta ?? rp?.questionInMeta;
    const t = round.questionsInMeta ?? rp?.questionsInMeta;
    const isLastVisual = m === 1 && q === t && t != null && round.kind === "visual";
    const isLastAudioBlock = m === 2 && q === t && t != null && round.kind === "audio";
    const continueLabel = isLastOverall
      ? "Finish game & show final standings"
      : isLastAudioBlock
        ? "Continue to Round 3 (Final)"
        : isLastVisual
          ? "Continue to Round 2"
          : "Next question";

    return (
      <div className="shell">
        {topBar}
        <div className="card" style={{ ...centeredCardStyle, marginTop: "1.5rem" }}>
          <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>Leaderboard</h2>
          {leaderboardOl}
          <button type="button" className="btn btn-primary" style={{ marginTop: "1.5rem" }} onClick={onContinueAfterReveal}>
            {continueLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      {topBar}

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
              Three blocks: five pictures, five audio clips, then a final round (GK with A–D and riddles). Only you play
              audio in Round 2.
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

            {(state.phase === "ROUND_PLAY" || state.phase === "AUDIO_LISTEN" || state.phase === "AUDIO_ANSWER") &&
            round ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
                  <h3 style={{ marginTop: 0 }}>{questionLabel(round)}</h3>
                  {state.phase === "ROUND_PLAY" || state.phase === "AUDIO_ANSWER" ? (
                    <span className="timer">{formatMs(roundPlayMs)}</span>
                  ) : (
                    <span className="pill">Play clip</span>
                  )}
                </div>
                {round.roundPrompt ? <p className="round-prompt">{round.roundPrompt}</p> : null}

                {round.kind === "audio" ? (
                  <>
                    {round.movieQuestion ? (
                      <p className="lede" style={{ fontWeight: 600, color: "var(--text)", marginBottom: "0.75rem" }}>
                        Teams see: {round.movieQuestion}
                      </p>
                    ) : null}
                    {round.audioUrl ? (
                      <audio
                        key={round.index}
                        ref={adminAudioRef}
                        src={round.audioUrl}
                        controls
                        style={{ width: "100%", marginBottom: "1rem" }}
                      />
                    ) : null}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
                      <button type="button" className="btn btn-ghost" onClick={onReplayAudio}>
                        Replay from start
                      </button>
                      {state.phase === "AUDIO_LISTEN" ? (
                        <button type="button" className="btn btn-primary" onClick={onStartAnswerTimer}>
                          Start 15-second answer timer
                        </button>
                      ) : null}
                      {state.phase === "AUDIO_ANSWER" ? (
                        <span className="lede" style={{ margin: 0, fontSize: "0.9rem" }}>
                          Teams can submit movie titles until the timer ends.
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : round.kind === "mcq" || round.kind === "riddle" ? (
                  <>
                    {round.questionText ? (
                      <p className="lede" style={{ color: "var(--text)", marginBottom: "1rem", fontWeight: 500 }}>
                        {round.questionText}
                      </p>
                    ) : null}
                    {round.kind === "mcq" && round.options?.length ? (
                      <ul
                        className="hint-list"
                        style={{ textAlign: "left", width: "100%", listStyle: "none", marginBottom: "1rem" }}
                      >
                        {round.options.map((opt, i) => (
                          <li key={i} style={{ marginBottom: "0.35rem" }}>
                            <strong style={{ marginRight: "0.5rem" }}>{String.fromCharCode(65 + i)}.</strong>
                            {opt}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  <>
                    {round.image ? (
                      <div className="asset-frame">
                        <img
                          src={round.image}
                          alt="Round preview"
                          style={{
                            filter: `blur(${round.blurPx}px)`,
                          }}
                        />
                      </div>
                    ) : null}
                  </>
                )}
              </>
            ) : null}
          </div>

          {state.phase === "ROUND_PLAY" || state.phase === "AUDIO_LISTEN" || state.phase === "AUDIO_ANSWER" ? (
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
          ) : state.phase === "GAME_END" ? (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Final standings</h3>
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
          ) : state.phase === "SPEED_ROUND" ? (
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
          ) : null}
        </div>
      )}
    </div>
  );
}
