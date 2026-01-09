
import React, { useState } from 'react';
import { signInWithEmailAndPassword, getAuth } from 'firebase/auth';

interface LoginScreenProps {
  onLoginSuccess: () => void;
  designatedEmail: string;
  displayName: string;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, designatedEmail, displayName }) => {
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const auth = getAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, designatedEmail, passwordInput);
      onLoginSuccess();
    } catch (error: any) {
      setLoginError('Invalid password. Please try again.');
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#2E2B36] text-[#EAE6F0] p-4">
      <div className="relative w-40 h-40 mb-6">
        <iframe
          src="https://giphy.com/embed/xX1PKy7MVU4xUvQ7bL"
          width="100%" height="100%"
          style={{ border: '0' }}
          className="giphy-embed"
          allowFullScreen
          title="Login Animation"
        />
        <div className="absolute inset-0 z-[1]" aria-hidden="true"></div> 
      </div>
      <h1 className="text-3xl font-semibold mb-3">Welcome back, {displayName}!</h1>
      <p className="text-md text-[#A09CB0] mb-8">Please enter your password to continue.</p>
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-6">
        <input
          type="password"
          required
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          placeholder="Password"
          className="appearance-none block w-full px-4 py-3 bg-[#4A4754] border border-[#5A5666] rounded-xl shadow-sm placeholder-[#A09CB0] focus:outline-none focus:ring-2 focus:ring-[#FF8DC7] text-[#EAE6F0]"
        />
        {loginError && <p className="text-sm text-[#FF6B6B] text-center">{loginError}</p>}
        <button
          type="submit"
          disabled={isLoggingIn}
          className="w-full flex justify-center py-3 px-4 rounded-xl text-sm font-medium text-white bg-[#FF8DC7] hover:bg-opacity-80 disabled:opacity-50"
        >
          {isLoggingIn ? 'Signing In...' : 'Login'}
        </button>
      </form>
    </div>
  );
};

export default LoginScreen;
