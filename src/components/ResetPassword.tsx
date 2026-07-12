import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { PasswordField } from './PasswordField';

interface ResetPasswordProps {
  token: string | null;
  onSuccess: () => void;
}

export const ResetPassword: React.FC<ResetPasswordProps> = ({ token, onSuccess }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid reset token');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (!token) {
      setError('Invalid reset token');
      return;
    }

    setLoading(true);

    try {
      await apiClient.resetPassword(token, password);
      setMessage('Password reset successful! Redirecting to login...');
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-container">
        <div className="error-message">Invalid reset token</div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <h2>Reset Password</h2>
      <form onSubmit={handleSubmit}>
        <PasswordField
          id="new-password"
          label="New Password:"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={6}
        />
        <PasswordField
          id="confirm-password"
          label="Confirm Password:"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          minLength={6}
        />
        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}
        <button type="submit" disabled={loading} className="auth-button">
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>
    </div>
  );
};
