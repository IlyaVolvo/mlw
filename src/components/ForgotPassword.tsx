import React, { useState } from 'react';
import { apiClient } from '../api/client';

interface ForgotPasswordProps {
  onSwitchToLogin: () => void;
}

export const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onSwitchToLogin }) => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const baseUrl = window.location.origin;
      await apiClient.forgotPassword(email, baseUrl);
      setMessage('If the email exists, a password reset link has been sent to your email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h2>Reset Password</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="reset-email">Email:</label>
          <input
            id="reset-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}
        <button type="submit" disabled={loading} className="auth-button">
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>
      <p className="auth-switch">
        <button type="button" onClick={onSwitchToLogin} className="link-button">
          Back to Login
        </button>
      </p>
    </div>
  );
};

