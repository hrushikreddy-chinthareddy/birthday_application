import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getSocket } from "../getSocket";
import { adminSessionKey } from "../storageKeys";

export function AdminCreate() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState("");
  const [adminName, setAdminName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const sock = getSocket();
    sock.emit(
      "adminCreateRoom",
      { roomCode: roomCode.trim(), adminName: adminName.trim() || "Admin" },
      (res: { ok: boolean; roomCode?: string; adminToken?: string; error?: string }) => {
        setBusy(false);
        if (!res?.ok || !res.roomCode || !res.adminToken) {
          setError(res?.error ?? "Could not create room.");
          return;
        }
        sessionStorage.setItem(
          adminSessionKey(res.roomCode),
          JSON.stringify({ adminToken: res.adminToken, adminName: adminName.trim() || "Admin" }),
        );
        navigate(`/admin/${res.roomCode}`);
      },
    );
  };

  return (
    <div className="shell">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
        <Link to="/" className="btn btn-ghost" style={{ textDecoration: "none" }}>
          Home
        </Link>
      </div>
      <h1>Admin — new session</h1>
      <p className="lede">Choose a room code teams will use (4–8 characters: A–Z except I/O, and digits 2–9).</p>

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
          <label htmlFor="adminName">Your name (optional)</label>
          <input
            id="adminName"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            placeholder="Alex"
            maxLength={24}
            autoComplete="nickname"
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Create room
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
