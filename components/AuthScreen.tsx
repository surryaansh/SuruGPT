import React, { useState, useEffect } from 'react';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile
} from 'firebase/auth';

interface AuthScreenProps {
  onAuthSuccess: () => void;
}

type AuthView = 'welcome' | 'login-email' | 'login-password' | 'signup-name' | 'signup-email' | 'signup-password';

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [view, setView] = useState<AuthView>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const auth = getAuth();

  useEffect(() => {
    setError(null);
  }, [view]);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes('@')) {
        setError("Please enter a valid email.");
        return;
    }
    setView('login-password');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      onAuthSuccess();
    } catch (err: any) {
      console.error("Login error code:", err.code);
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else if (err.code === 'auth/wrong-password') {
        setError('Incorrect password. Try again?');
      } else if (err.code === 'auth/invalid-credential') {
        // Modern Firebase returns this for both wrong password AND missing user
        setError('Invalid credentials. Double check your email or sign up!');
      } else {
        setError('Something went wrong. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match!');
      return;
    }
    if (password.length < 6) {
        setError('Password should be at least 6 characters.');
        return;
    }
    setLoading(true);
    setError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: displayName });
      onAuthSuccess();
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Try logging in!');
      } else {
        setError(err.message || 'Failed to create account.');
      }
    } finally {
      setLoading(false);
    }
  };

  const containerClass = "flex flex-col items-center justify-center h-screen bg-[#2E2B36] text-[#EAE6F0] p-6 text-center";
  const cardClass = "w-full max-w-sm bg-[#393641] p-8 rounded-3xl shadow-2xl border border-[#4A4754] animate-scaleIn relative overflow-hidden";
  // text-base (16px) is required to prevent iOS zoom
  const inputClass = "appearance-none block w-full px-5 py-3.5 bg-[#4A4754] border border-[#5A5666] rounded-2xl shadow-sm placeholder-[#A09CB0] focus:outline-none focus:ring-2 focus:ring-[#FF8DC7] text-[#EAE6F0] transition-all text-base mb-4";
  const buttonClass = "w-full flex justify-center items-center py-3.5 px-4 rounded-2xl text-sm font-semibold text-white bg-[#FF8DC7] hover:bg-opacity-90 disabled:opacity-50 shadow-lg transition-all active:scale-95";
  const backButtonClass = "mt-6 text-xs text-[#A09CB0] hover:text-[#FF8DC7] transition-colors cursor-pointer";

  return (
    <div className={containerClass}>
      <div className={cardClass}>
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#FF8DC7] opacity-10 blur-3xl rounded-full"></div>
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-[#FF8DC7] opacity-10 blur-3xl rounded-full"></div>

        <div className="relative w-32 h-32 mx-auto mb-6">
          {view === 'welcome' && <iframe src="https://giphy.com/embed/eveEChlJE0YhdeVXEj" width="100%" height="100%" style={{ border: '0' }} className="giphy-embed pointer-events-none" allowFullScreen title="Welcome" />}
          {(view.startsWith('signup') || view.startsWith('login')) && <iframe src="https://giphy.com/embed/xX1PKy7MVU4xUvQ7bL" width="100%" height="100%" style={{ border: '0' }} className="giphy-embed pointer-events-none" allowFullScreen title="Auth" />}
          <div className="absolute inset-0 z-10"></div>
        </div>

        {view === 'welcome' && (
          <div className="animate-fadeInContent space-y-6">
            <div>
                <h1 className="text-3xl font-bold mb-2">SuruGPT</h1>
                <p className="text-[#A09CB0] text-sm">Your secret little AI companion.</p>
            </div>
            <div className="space-y-3 pt-4">
              <button onClick={() => setView('login-email')} className={buttonClass}>Login</button>
              <button onClick={() => setView('signup-name')} className="w-full py-3.5 px-4 rounded-2xl text-sm font-semibold text-[#EAE6F0] bg-[#4A4754] hover:bg-[#53505F] border border-[#5A5666] transition-all">Sign Up</button>
            </div>
          </div>
        )}

        {view === 'login-email' && (
          <form onSubmit={handleEmailSubmit} className="animate-fadeInContent">
            <h2 className="text-xl font-bold mb-1">Login</h2>
            <p className="text-xs text-[#A09CB0] mb-6">What's your email address?</p>
            <input 
              type="email" 
              required 
              placeholder="name@example.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className={inputClass} 
              autoFocus 
            />
            {error && <p className="text-xs text-[#FF6B6B] mb-4">{error}</p>}
            <button type="submit" className={buttonClass}>Next</button>
            <div onClick={() => setView('welcome')} className={backButtonClass}>Actually, take me back</div>
          </form>
        )}

        {view === 'login-password' && (
          <form onSubmit={handleLogin} className="animate-fadeInContent">
            <h2 className="text-xl font-bold mb-1">Welcome back!</h2>
            <p className="text-xs text-[#A09CB0] mb-6">Enter your password to unlock Suru.</p>
            <input 
              type="password" 
              required 
              placeholder="Your Password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className={inputClass} 
              autoFocus 
            />
            {error && <p className="text-xs text-[#FF6B6B] mb-4">{error}</p>}
            <button type="submit" disabled={loading} className={buttonClass}>
              {loading ? 'Unlocking...' : 'Login'}
            </button>
            <div onClick={() => setView('login-email')} className={backButtonClass}>Change email</div>
          </form>
        )}

        {view === 'signup-name' && (
          <div className="animate-fadeInContent">
            <h2 className="text-xl font-bold mb-1">New Friend!</h2>
            <p className="text-xs text-[#A09CB0] mb-6">First off, what should I call you?</p>
            <input 
              type="text" 
              required 
              placeholder="Name or Nickname" 
              value={displayName} 
              onChange={e => setDisplayName(e.target.value)} 
              className={inputClass} 
              autoFocus 
              onKeyDown={(e) => e.key === 'Enter' && displayName.trim() && setView('signup-email')}
            />
            <button onClick={() => displayName.trim() && setView('signup-email')} className={buttonClass}>Next</button>
            <div onClick={() => setView('welcome')} className={backButtonClass}>Cancel</div>
          </div>
        )}

        {view === 'signup-email' && (
          <div className="animate-fadeInContent">
            <h2 className="text-xl font-bold mb-1">Hi, {displayName}!</h2>
            <p className="text-xs text-[#A09CB0] mb-6">What's your best email address?</p>
            <input 
              type="email" 
              required 
              placeholder="email@example.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className={inputClass} 
              autoFocus 
              onKeyDown={(e) => e.key === 'Enter' && email.includes('@') && setView('signup-password')}
            />
            <button onClick={() => email.includes('@') && setView('signup-password')} className={buttonClass}>Next</button>
            <div onClick={() => setView('signup-name')} className={backButtonClass}>Back</div>
          </div>
        )}

        {view === 'signup-password' && (
          <form onSubmit={handleSignup} className="animate-fadeInContent">
            <h2 className="text-xl font-bold mb-1">Last Step!</h2>
            <p className="text-xs text-[#A09CB0] mb-6">Create a secure password for your vault.</p>
            <input 
              type="password" 
              required 
              placeholder="Create Password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className={inputClass} 
              autoFocus 
            />
            <input 
              type="password" 
              required 
              placeholder="Confirm Password" 
              value={confirmPassword} 
              onChange={e => setConfirmPassword(e.target.value)} 
              className={inputClass} 
            />
            {error && <p className="text-xs text-[#FF6B6B] mb-4">{error}</p>}
            <button type="submit" disabled={loading} className={buttonClass}>
              {loading ? 'Creating account...' : 'Finish Signup'}
            </button>
            <div onClick={() => setView('signup-email')} className={backButtonClass}>Wait, change email</div>
          </form>
        )}
      </div>
    </div>
  );
};

export default AuthScreen;
