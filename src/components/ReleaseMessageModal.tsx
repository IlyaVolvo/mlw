import React from 'react';
import type { ReleaseNote } from '../utils/releaseNotes';

interface ReleaseMessageModalProps {
  releases: ReleaseNote[];
  onDismiss: () => void;
}

export const ReleaseMessageModal: React.FC<ReleaseMessageModalProps> = ({ releases, onDismiss }) => {
  if (releases.length === 0) return null;

  return (
    <div className="word-index-overlay release-modal-overlay" onClick={onDismiss}>
      <div className="release-modal" onClick={(e) => e.stopPropagation()}>
        <h3>What&apos;s New</h3>
        <div className="release-messages">
          {releases.map((release, index) => (
            <div key={index} className="release-message-block">
              {releases.length > 1 && (
                <div className="release-message-label">Update {index + 1}</div>
              )}
              <div className="release-message-content">{release.message}</div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="tutorial-next-button release-modal-dismiss"
          onClick={onDismiss}
        >
          Got it
        </button>
      </div>
    </div>
  );
};
