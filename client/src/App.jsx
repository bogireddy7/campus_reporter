import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { session } from './api.js';
import Report from './pages/Report.jsx';
import Track from './pages/Track.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';

const ROLE_LABEL = { hod: 'HOD', office: 'Admin Office' };

export default function App() {
  const [user, setUser] = useState(session.user);
  const navigate = useNavigate();

  useEffect(() => {
    const onLogout = () => { setUser(null); navigate('/admin/login'); };
    window.addEventListener('cr-logout', onLogout);
    return () => window.removeEventListener('cr-logout', onLogout);
  }, [navigate]);

  const logout = () => { session.clear(); setUser(null); navigate('/'); };

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">◎</span> Campus Reporter
        </Link>
        <nav>
          <NavLink to="/" end>Report issue</NavLink>
          <NavLink to="/track">Track</NavLink>
          {user ? (
            <>
              <NavLink to="/admin">Dashboard</NavLink>
              <span className="who">{ROLE_LABEL[user.role]}</span>
              <button className="link" onClick={logout}>Log out</button>
            </>
          ) : (
            <NavLink to="/admin/login">Staff login</NavLink>
          )}
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Report />} />
          <Route path="/track" element={<Track />} />
          <Route path="/track/:tid" element={<Track />} />
          <Route path="/admin/login" element={user ? <Navigate to="/admin" /> : <Login onLogin={setUser} />} />
          <Route path="/admin/register" element={user ? <Navigate to="/admin" /> : <Register onLogin={setUser} />} />
          <Route path="/admin" element={user ? <Dashboard user={user} /> : <Navigate to="/admin/login" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  );
}
