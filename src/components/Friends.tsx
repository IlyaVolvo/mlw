import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

interface Friend {
  id: number;
  email: string;
  createdAt: string;
}

interface Invitation {
  id: number;
  friendId: number;
  friendEmail: string;
  invitedBy: number;
  createdAt: string;
}

interface FriendsProps {
  onFriendSelect?: (friendId: number | null, friendEmail?: string | null) => void;
  selectedFriendId?: number | null;
  isOpen?: boolean;
  onInvitationsChange?: (hasInvitations: boolean) => void;
  onNewFriendChange?: (hasNewFriend: boolean) => void;
}

export const Friends: React.FC<FriendsProps> = ({ onFriendSelect, selectedFriendId, isOpen = false, onInvitationsChange, onNewFriendChange }) => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);

  const loadFriends = async () => {
    try {
      const response = await apiClient.getFriends();
      setFriends(response.friends || []);
      if (onNewFriendChange) {
        onNewFriendChange(response.hasNewFriend || false);
      }
    } catch (err) {
      console.error('Failed to load friends', err);
      setFriends([]);
      if (onNewFriendChange) {
        onNewFriendChange(false);
      }
    }
  };

  const loadInvitations = async () => {
    try {
      const response = await apiClient.getFriendInvitations();
      const invs = response.invitations || [];
      setInvitations(invs);
      if (onInvitationsChange) {
        onInvitationsChange(invs.length > 0);
      }
    } catch (err) {
      console.error('Failed to load invitations', err);
      setInvitations([]);
      if (onInvitationsChange) {
        onInvitationsChange(false);
      }
    }
  };

  useEffect(() => {
    loadFriends();
    loadInvitations();
  }, []);

  useEffect(() => {
    // Reload invitations and friends when panel opens
    if (isOpen) {
      loadInvitations();
      loadFriends();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const response = await apiClient.inviteFriend(inviteEmail);
      if (response.wasRejected) {
        setSuccess(`${inviteEmail} will be notified (previously rejected)`);
      } else {
        setSuccess(`${inviteEmail} will be notified`);
      }
      setInviteEmail('');
      setShowInviteForm(false);
      // Reload friends in case of auto-accept
      loadFriends();
      // Reload invitations to update the indicator
      loadInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (friendId: number) => {
    try {
      await apiClient.acceptFriendInvitation(friendId);
      loadInvitations();
      loadFriends();
      // Update invitation indicator
      if (onInvitationsChange) {
        const remaining = invitations.filter(inv => inv.friendId !== friendId);
        onInvitationsChange(remaining.length > 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation');
    }
  };

  const handleReject = async (friendId: number) => {
    try {
      await apiClient.rejectFriendInvitation(friendId);
      loadInvitations();
      // Update invitation indicator
      if (onInvitationsChange) {
        const remaining = invitations.filter(inv => inv.friendId !== friendId);
        onInvitationsChange(remaining.length > 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject invitation');
    }
  };

  const handleRemove = async (friendId: number) => {
    if (!confirm('Are you sure you want to remove this friend?')) {
      return;
    }
    try {
      await apiClient.removeFriend(friendId);
      loadFriends();
      if (selectedFriendId === friendId && onFriendSelect) {
        onFriendSelect(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove friend');
    }
  };

  if (!isOpen) {
    return null; // Don't render anything when closed
  }

  return (
    <div className="friends-panel">
      <div className="friends-content">
          <div className="friends-header">
            <h3>Friends</h3>
            <button
              className="invite-friend-button"
              onClick={() => setShowInviteForm(!showInviteForm)}
            >
              {showInviteForm ? 'Cancel' : '+ Invite Friend'}
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          {showInviteForm && (
            <form onSubmit={handleInvite} className="invite-form">
              <input
                type="email"
                placeholder="Enter friend's email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                disabled={loading}
              />
              <button type="submit" disabled={loading}>
                {loading ? 'Sending...' : 'Send Invitation'}
              </button>
            </form>
          )}

          {invitations.length > 0 && (
            <div className="invitations-section">
              <h4>Pending Invitations</h4>
              {invitations.map((inv) => (
                <div key={inv.id} className="invitation-item">
                  <span>{inv.friendEmail}</span>
                  <div>
                    <button onClick={() => handleAccept(inv.friendId)} className="accept-button">
                      Accept
                    </button>
                    <button onClick={() => handleReject(inv.friendId)} className="reject-button">
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="friends-list">
            {friends.length === 0 ? (
              <p className="no-friends">No friends yet. Invite someone to get started!</p>
            ) : (
              friends.map((friend) => (
                <div
                  key={friend.id}
                  className={`friend-item ${selectedFriendId === friend.id ? 'selected' : ''}`}
                >
                  <label className="friend-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedFriendId === friend.id}
                      onChange={() => {
                        if (onFriendSelect) {
                          onFriendSelect(selectedFriendId === friend.id ? null : friend.id, selectedFriendId === friend.id ? null : friend.email);
                        }
                      }}
                    />
                    <span>{friend.email}</span>
                  </label>
                  <button
                    onClick={() => handleRemove(friend.id)}
                    className="remove-friend-button"
                    title="Remove friend"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18"></path>
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
    </div>
  );
};
