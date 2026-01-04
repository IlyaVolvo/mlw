import React, { useState } from 'react';
import { apiClient } from '../api/client';

interface LoginProps {
  onLogin: (user: { id: number; email: string }) => void;
  onSwitchToRegister: () => void;
  onSwitchToForgotPassword: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin, onSwitchToRegister, onSwitchToForgotPassword }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiClient.login(email, password);
      onLogin(response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email:</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password:</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {error && <div className="error-message">{error}</div>}
        <button type="submit" disabled={loading} className="auth-button">
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      <p className="auth-switch">
        <button type="button" onClick={onSwitchToForgotPassword} className="link-button">
          Forgot password?
        </button>
        {' | '}
        Don't have an account?{' '}
        <button type="button" onClick={onSwitchToRegister} className="link-button">
          Register
        </button>
      </p>
    </div>
  );
};

