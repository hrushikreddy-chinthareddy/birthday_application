import { Navigate, Route, Routes } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { AdminCreate } from "./pages/AdminCreate";
import { AdminRoom } from "./pages/AdminRoom";
import { TeamJoin } from "./pages/TeamJoin";
import { TeamPlay } from "./pages/TeamPlay";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/admin" element={<AdminCreate />} />
      <Route path="/admin/:roomCode" element={<AdminRoom />} />
      <Route path="/join" element={<TeamJoin />} />
      <Route path="/play/:roomCode" element={<TeamPlay />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
