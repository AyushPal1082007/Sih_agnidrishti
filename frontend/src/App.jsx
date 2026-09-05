import { useState, useEffect } from 'react';
import { getIncidents, getMlStatus, getToken, getUser, clearToken, clearUser } from './api.js';
import AlertFeed from './AlertFeed.jsx';
import MLPanel from './MLPanel.jsx';
import EnteringPage from './EnteringPage.jsx';
import Dashboard from './Dashboard.jsx';
import LoginPage from './LoginPage.jsx';
import ProfileBadge from './ProfileBadge.jsx';
import LandingHome from './LandingHome.tsx';

/* ─── Tab config ─────────────────────────────────────────────────────────── */
const TABS = [
    { id: 'map',       label: '🗺️  Live Map' },
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'incidents', label: '⚠️  Incidents' },
];

/* ─── Topbar ML badge ─────────────────────────────────────────────────────── */
function TopbarBadge({ status }) {
    if (!status || status.status === 'never_run') return null;
    if (status.status === 'running') {
        return <span className="badge badge-running pulse-running">⟳ ML Running</span>;
    }
    if (status.status === 'done' && status.summary) {
        const { validated = 0, patched = 0 } = status.summary;
        return (
            <span className="badge badge-done">
                ✓ {(patched || validated).toLocaleString()} classified
            </span>
        );
    }
    if (status.status === 'error') {
        return <span className="badge badge-critical">✗ ML Error</span>;
    }
    return null;
}

/* ─── Incidents list (inline for the incidents tab) ──────────────────────── */
const PRIORITY_COLOR = { CRITICAL: '#ef4444', HIGH: '#f97316', MODERATE: '#f59e0b', LOW: '#22c55e' };
const STATUS_COLOR   = { VALIDATED: '#22c55e', DEBUNKED: '#6b7280', FLAGGED: '#f59e0b' };

function IncidentRow({ inc }) {
    const p = inc.threat_priority || 'LOW';
    const s = inc.status || 'FLAGGED';
    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 10, padding: '12px 14px', marginBottom: 8,
            borderLeft: `3px solid ${PRIORITY_COLOR[p] || '#555'}`,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                        background: `${PRIORITY_COLOR[p]}20`, color: PRIORITY_COLOR[p],
                        border: `1px solid ${PRIORITY_COLOR[p]}40`, textTransform: 'uppercase',
                    }}>{p}</span>
                    <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                        background: `${STATUS_COLOR[s]}18`, color: STATUS_COLOR[s],
                        border: `1px solid ${STATUS_COLOR[s]}35`, textTransform: 'uppercase',
                    }}>{s}</span>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {new Date(inc.created_at).toLocaleString()}
                </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Incident #{inc.id}
                {inc.agent3?.reason && ` — ${inc.agent3.reason}`}
            </div>
        </div>
    );
}

function IncidentsTab() {
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ALL');

    useEffect(() => {
        getIncidents()
            .then(d => { setIncidents(Array.isArray(d) ? d : []); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    const priorities = ['ALL', 'CRITICAL', 'HIGH', 'MODERATE', 'LOW'];
    const visible = filter === 'ALL' ? incidents : incidents.filter(i => i.threat_priority === filter);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Filter pills */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
                {priorities.map(p => (
                    <button key={p} onClick={() => setFilter(p)} style={{
                        padding: '4px 12px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase',
                        letterSpacing: 0.5, transition: 'all 0.15s',
                        background: filter === p ? `${PRIORITY_COLOR[p] || 'rgba(59,130,246'}0.2` : 'rgba(255,255,255,0.04)',
                        border: filter === p
                            ? `1px solid ${PRIORITY_COLOR[p] || '#3b82f6'}60`
                            : '1px solid var(--border)',
                        color: filter === p ? (PRIORITY_COLOR[p] || '#60a5fa') : 'var(--text-secondary)',
                    }}>{p}</button>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
                    {visible.length} incidents
                </span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                {loading && [1,2,3].map(i => (
                    <div key={i} className="shimmer" style={{ height: 72, borderRadius: 10, marginBottom: 8 }} />
                ))}
                {!loading && visible.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                        <div style={{ fontSize: 13 }}>No incidents yet</div>
                        <div style={{ fontSize: 11, marginTop: 4 }}>Run the ML pipeline to generate incident reports</div>
                    </div>
                )}
                {visible.map(inc => <IncidentRow key={inc.id} inc={inc} />)}
            </div>
        </div>
    );
}


/* ─── Main App ────────────────────────────────────────────────────────────── */
export default function App() {
    const [user, setUser] = useState(() => getUser());
    const authed = !!(user && getToken());
    const [viewMode, setViewMode] = useState(() => authed ? 'landing' : 'entering'); // 'entering' | 'landing' | 'login' | 'dashboard'
    const [mlStatus, setMlStatus] = useState(null);
    const [hotspotCount, setHotspotCount] = useState(null);
    const [activeTab, setActiveTab] = useState('map');
    const [landingEntrance, setLandingEntrance] = useState(false);

    useEffect(() => {
        if (!authed) return;
        const load = () => getMlStatus().then(setMlStatus).catch(() => {});
        load();
        const t = setInterval(load, 10000);
        return () => clearInterval(t);
    }, [authed]);

    const handleAuthSuccess = (u) => {
        setUser(u);
        setLandingEntrance(true);
        window.setTimeout(() => setLandingEntrance(false), 4700);
        setViewMode('landing');
    };

    const handleRegistrationSuccess = () => {
        setLandingEntrance(true);
        window.setTimeout(() => setLandingEntrance(false), 4700);
        setViewMode('landing');
    };

    const handleLogout = () => {
        clearToken();
        clearUser();
        setUser(null);
        setViewMode('landing');
    };

    const handleLaunchDashboard = () => {
        if (authed) {
            setViewMode('dashboard');
        } else {
            setViewMode('login');
        }
    };

    if (viewMode === 'entering') {
        return <EnteringPage onEnter={() => setViewMode('login')} />;
    }

    // Render 3D Google Research style Landing Home
    if (viewMode === 'landing') {
        return (
            <>
                <LandingHome
                    workspaceMode
                    landingEntrance={landingEntrance}
                    onWorkspaceNavigate={(tab) => {
                        if (tab === 'map') return;
                        if (!authed) {
                            setViewMode('login');
                            return;
                        }
                        setActiveTab(tab === 'incidents' ? 'incidents' : 'dashboard');
                        setViewMode('dashboard');
                    }}
                    onLogin={() => setViewMode('login')}
                    onSignOut={authed ? handleLogout : undefined}
                />
                {authed && (
                    <aside className="globe-alert-feed" aria-label="Live alert feed">
                        <AlertFeed />
                    </aside>
                )}
            </>
        );
    }

    // Render Login Page
    if (viewMode === 'login') {
        return (
            <LoginPage
                onAuthSuccess={handleAuthSuccess}
                onRegistrationSuccess={handleRegistrationSuccess}
                onBack={() => setViewMode('landing')}
            />
        );
    }

    // Render Full Mission Control (Live Map, Dashboard, Incidents)
    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

            {/* ── Top Bar ── */}
            <header className="topbar">
                <div className="topbar-brand" onClick={() => setViewMode('landing')} style={{ cursor: 'pointer' }} title="Return to Orbital Explorer">
                    <span className="status-dot" />
                    <h1>AgniDrishti</h1>
                </div>

                {/* Return to 3D Earth Globe */}
                <button
                    onClick={() => setViewMode('landing')}
                    style={{
                        padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                        border: '1px solid rgba(56, 189, 248, 0.4)',
                        background: 'rgba(56, 189, 248, 0.12)',
                        color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 5,
                        transition: 'all 0.15s ease',
                    }}
                    title="Switch to 3D Orbital Explorer"
                >
                    🌍 <span>Orbital Explorer</span>
                </button>
                <nav style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center' }}>
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
                                fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                                transition: 'all 0.15s', border: 'none',
                                background: activeTab === tab.id
                                    ? 'rgba(59,130,246,0.2)' : 'transparent',
                                color: activeTab === tab.id ? '#60a5fa' : 'var(--text-secondary)',
                                outline: activeTab === tab.id
                                    ? '1px solid rgba(59,130,246,0.35)' : '1px solid transparent',
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>

                <div className="topbar-stats">
                    {hotspotCount != null && (
                        <div className="topbar-stat">
                            🔥 <b>{hotspotCount.toLocaleString()}</b> hotspots
                        </div>
                    )}
                    <div className="topbar-stat">📡 <b>Gujarat</b> industrial belt</div>
                    <div className="topbar-stat">🛰 VIIRS 375m · NRT</div>
                </div>

                <div className="topbar-right">
                    <TopbarBadge status={mlStatus} />
                    <ProfileBadge user={user} onLogout={handleLogout} />
                </div>
            </header>

            {/* ── Map Tab ── */}
            {activeTab === 'map' && (
                <>
                    <LandingHome
                        workspaceMode
                        onWorkspaceNavigate={setActiveTab}
                        onSignOut={handleLogout}
                    />
                    <aside className="globe-alert-feed" aria-label="Live alert feed">
                        <AlertFeed />
                    </aside>
                </>
            )}

            {/* ── Dashboard Tab ── */}
            {activeTab === 'dashboard' && (
                <div style={{
                    position: 'absolute', top: 'var(--topbar-h)', left: 0, right: 0,
                    bottom: 0, overflowY: 'auto',
                }}>
                    <Dashboard mlStatus={mlStatus} onRunML={setMlStatus} />
                </div>
            )}

            {/* ── Incidents Tab ── */}
            {activeTab === 'incidents' && (
                <div style={{
                    position: 'absolute', top: 'var(--topbar-h)', left: 0, right: 0,
                    bottom: 0, display: 'flex', flexDirection: 'column',
                    background: 'var(--bg-dark)',
                }}>
                    <IncidentsTab />
                </div>
            )}
        </div>
    );
}