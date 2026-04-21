import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getSocket } from "../getSocket";
import { teamSessionKey } from "../storageKeys";

export function TeamJoin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCode = useMemo(() => (searchParams.get("code") || "").toUpperCase(), [searchParams]);

  const [roomCode, setRoomCode] = useState(initialCode);
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = searchParams.get("code");
    if (c) setRoomCode(c.toUpperCase().replace(/\s/g, ""));
  }, [searchParams]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const code = roomCode.trim().toUpperCase().replace(/\s/g, "");
    const sock = getSocket();
    sock.emit("joinRoom", { roomCode: code, teamName: teamName.trim() }, (res: { ok: boolean; playerId?: string; error?: string }) => {
      setBusy(false);
      if (!res?.ok || !res.playerId) {
        setError(res?.error ?? "Could not join.");
        return;
      }
      sessionStorage.setItem(
        teamSessionKey(code),
        JSON.stringify({ playerId: res.playerId, teamName: teamName.trim() }),
      );
      navigate(`/play/${code}`);
    });
  };

  return (
    <div className="shell">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
        <Link to="/" className="btn btn-ghost" style={{ textDecoration: "none" }}>
          Home
        </Link>
      </div>
      <h1>Join as a team</h1>
      <p className="lede">Enter the room code from your facilitator and your team name.</p>

      <form className="card" onSubmit={onSubmit} style={{ maxWidth: 480 }}>
        <div className="field" style={{ marginBottom: "1rem" }}>
          <label htmlFor="code">Room code</label>
          <input
            id="code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="FUN2DAY"
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
          />
        </div>
        <div className="field" style={{ marginBottom: "1rem" }}>
          <label htmlFor="team">Team name</label>
          <input
            id="team"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="The Quizzards"
            maxLength={24}
            autoComplete="off"
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Join room
        </button>
      </form>

      {error ? (
        <p className="toast err" style={{ marginTop: "1.25rem" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
