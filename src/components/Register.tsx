import React, { useState } from 'react';
import { apiClient } from '../api/client';
import { loadReleaseNotes } from '../utils/releaseNotes';
import { PasswordField } from './PasswordField';

interface RegisterProps {
  onRegister: (user: { id: number; email: string; verified?: number }) => void;
  onSwitchToLogin: () => void;
}

export const Register: React.FC<RegisterProps> = ({ onRegister, onSwitchToLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const releases = await loadReleaseNotes();
      const nextUnseenIndex = releases.length;
      const response = await apiClient.register(email, password, nextUnseenIndex);
      onRegister(response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h2>Register</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="reg-email">Email:</label>
          <input
            id="reg-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <PasswordField
          id="reg-password"
          label="Password:"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={6}
          hint="Minimum 6 characters"
        />
        {error && <div className="error-message">{error}</div>}
        <button type="submit" disabled={loading} className="auth-button">
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>
      <p className="auth-switch">
        Already have an account?{' '}
        <button type="button" onClick={onSwitchToLogin} className="link-button">
          Login
        </button>
      </p>
    </div>
  );
};
