/**
 * AgniDrishti authentication portal.
 */
import { useRef, useState } from 'react';
import { login, register, setToken, setUser } from './api.js';
import './LoginPage.css';
import useSeamlessVideo from './useSeamlessVideo.js';

const DEPARTMENTS = [
    'GSDMA - Gujarat State Disaster Management Authority',
    'Gujarat Forest Department',
    'ISRO / SAC - Space Applications Centre',
    'IMD - India Meteorological Department',
    'CPCB / GPCB - Pollution Control Board',
    'Revenue & Relief Commissioner, Gujarat',
    'IIT Gandhinagar / IIT Bombay (Research)',
    'National Disaster Response Force (NDRF)',
    'Other Government Agency',
];

const TEST_ACCOUNTS = [
    { email: 'admin@agnidrishti.gov.in', password: 'Admin@2026', role: 'ADMIN', color: '#f07c4f' },
    { email: 'analyst@agnidrishti.gov.in', password: 'Analyst@2026', role: 'ANALYST', color: '#e4b866' },
    { email: 'viewer@agnidrishti.gov.in', password: 'Viewer@2026', role: 'VIEWER', color: '#72c7b5' },
];

export default function LoginPage({ onAuthSuccess, onRegistrationSuccess }) {
    const [mode, setMode] = useState('login');
    const [contentMode, setContentMode] = useState('login');
    const [form, setForm] = useState({ email: '', password: '', full_name: '', designation: '', department: '' });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [cardHeight, setCardHeight] = useState(null);
    const cardRef = useRef(null);
    const { videoRefs, activeIndex, handleTimeUpdate, handleEnded } = useSeamlessVideo();

    const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
    const fillTest = (account) => {
        setForm(current => ({ ...current, email: account.email, password: account.password }));
        setMode('login');
        setError('');
    };

    const handleLogin = async (event) => {
        event.preventDefault();
        setError('');
        setLoading(true);
        try {
            const { token, user } = await login(form.email, form.password);
            setToken(token);
            setUser(user);
            onAuthSuccess(user);
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (event) => {
        event.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);
        try {
            const data = await register({
                email: form.email, password: form.password, full_name: form.full_name,
                designation: form.designation, department: form.department,
            });
            if (onRegistrationSuccess) {
                onRegistrationSuccess(data);
            } else {
                setSuccess(data.message || 'Registration submitted. Await administrator approval.');
                setForm({ email: '', password: '', full_name: '', designation: '', department: '' });
            }
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setLoading(false);
        }
    };

    const changeMode = (nextMode) => {
        const currentHeight = cardRef.current?.getBoundingClientRect().height;
        if (currentHeight) setCardHeight(`${currentHeight}px`);
        setMode(nextMode);
        setError('');
        setSuccess('');
        if (nextMode === 'login') {
            window.requestAnimationFrame(() => {
                if (!cardRef.current) return;
                const compactCard = cardRef.current.cloneNode(true);
                compactCard.classList.remove('register-mode');
                compactCard.style.cssText = 'position:absolute;visibility:hidden;height:auto;pointer-events:none;';
                compactCard.querySelectorAll('.register-only').forEach(element => element.remove());
                cardRef.current.parentElement?.appendChild(compactCard);
                const nextHeight = `${compactCard.scrollHeight}px`;
                compactCard.remove();
                setCardHeight(nextHeight);
                window.requestAnimationFrame(() => setContentMode('login'));
                window.setTimeout(() => setCardHeight(null), 480);
            });
        } else {
            setContentMode('register');
            window.requestAnimationFrame(() => {
                if (!cardRef.current) return;
                setCardHeight(`${cardRef.current.scrollHeight}px`);
                window.setTimeout(() => setCardHeight(null), 480);
            });
        }
    };

    return (
        <main className="login-page">
            {[0, 1].map(index => <video
                key={index}
                ref={video => { videoRefs.current[index] = video; }}
                className={`login-earth-video ${activeIndex === index ? 'active' : ''}`}
                autoPlay={index === 0}
                muted
                playsInline
                preload="auto"
                onTimeUpdate={() => handleTimeUpdate(index)}
                onEnded={() => handleEnded(index)}
                aria-hidden="true"
            ><source src="/assets/earth_true_rotation_fixed_space.mp4" type="video/mp4" /></video>)}
            <div className="login-overlay" aria-hidden="true" />
            <div className="login-grid" aria-hidden="true" />

            <div className="login-shell">
                <section ref={cardRef} className={`login-card ${contentMode === 'register' ? 'register-mode' : ''}`} style={{ height: cardHeight || undefined }} aria-label="Authentication">
                    <div className="login-card-heading">
                        <p className="login-card-label">Mission control access</p>
                        <h2>{mode === 'login' ? 'Sign in' : 'Request access'}</h2>
                        <p>{mode === 'login' ? 'Authenticate with your authorised agency account.' : 'Submit your details for administrator review.'}</p>
                    </div>
                    <div className="login-tabs" role="tablist" aria-label="Authentication mode">
                        <button className={mode === 'login' ? 'active' : ''} type="button" role="tab" aria-selected={mode === 'login'} onClick={() => changeMode('login')}>Sign in</button>
                        <button className={mode === 'register' ? 'active' : ''} type="button" role="tab" aria-selected={mode === 'register'} onClick={() => changeMode('register')}>Request access</button>
                    </div>
                    <div className="demo-strip">
                        <span>Demo profiles</span>
                        <div>
                            {TEST_ACCOUNTS.map(account => <button key={account.role} type="button" onClick={() => fillTest(account)}>
                                <i style={{ background: account.color }} />{account.role}<b aria-hidden="true">&#8594;</b>
                            </button>)}
                        </div>
                    </div>
                    <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
                        {contentMode === 'register' && <div className="register-only"><Field label="Full name" type="text" placeholder="Dr. Ramesh Patel" value={form.full_name} onChange={value => set('full_name', value)} /></div>}
                        <Field label="Email address" type="email" placeholder={mode === 'login' ? 'officer@agnidrishti.gov.in' : 'you@agency.gov.in'} value={form.email} onChange={value => set('email', value)} />
                        <Field label="Password" type="password" placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter your password'} value={form.password} onChange={value => set('password', value)} />
                        {contentMode === 'register' && <>
                            <div className="register-only"><Field label="Designation" type="text" placeholder="Fire Safety Officer" value={form.designation} onChange={value => set('designation', value)} /></div>
                            <div className="login-field register-only">
                                <label htmlFor="department">Department</label>
                                <select id="department" value={form.department} onChange={event => set('department', event.target.value)} required>
                                    <option value="">Select department</option>
                                    {DEPARTMENTS.map(department => <option key={department} value={department}>{department}</option>)}
                                </select>
                            </div>
                            <div className="login-notice register-only">Your request will be reviewed by an administrator before access is granted.</div>
                        </>}
                        {error && <div className="login-message error" role="alert">{error}</div>}
                        {success && <div className="login-message success" role="status">{success}</div>}
                        <button className="login-submit" type="submit" disabled={loading}>{loading ? 'Authenticating...' : mode === 'login' ? 'Continue to mission control' : 'Submit access request'}</button>
                    </form>
                </section>
            </div>
            <footer className="login-footer"><span>AGNI DRISHTI / AUTH PORTAL</span><span>Gujarat monitoring network</span></footer>
        </main>
    );
}

function Field({ label, type, placeholder, value, onChange }) {
    return <div className="login-field">
        <label>{label}</label>
        <input type={type} placeholder={placeholder} value={value} required onChange={event => onChange(event.target.value)} />
    </div>;
}
