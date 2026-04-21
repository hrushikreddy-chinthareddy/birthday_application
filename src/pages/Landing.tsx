import { Link } from "react-router-dom";

export function Landing() {
  return (
    <div className="shell">
      <h1>Mystery Asset Pack</h1>
      <p className="lede">
        Teams guess blurred assets; the facilitator runs the session from the admin view. Share a join link or QR so
        teams can enter the room code and their team name.
      </p>
      <div className="grid-2" style={{ maxWidth: 640 }}>
        <Link className="card" to="/admin" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
          <h2 style={{ marginTop: 0 }}>Admin</h2>
          <p className="lede" style={{ marginBottom: 0, fontSize: "0.95rem" }}>
            Create a room with your own code, watch teams join, start the game, and see the live leaderboard.
          </p>
        </Link>
        <Link className="card" to="/join" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
          <h2 style={{ marginTop: 0 }}>Team</h2>
          <p className="lede" style={{ marginBottom: 0, fontSize: "0.95rem" }}>
            Enter the room code and your team name, then play each round when the admin starts.
          </p>
        </Link>
      </div>
    </div>
  );
}
