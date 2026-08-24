import React from 'react';
import type { ReleaseNote } from '../utils/releaseNotes';

interface ReleaseMessageModalProps {
  releases: ReleaseNote[];
  onDismiss: () => void;
}

const renderTextWithLinks = (text: string, keyPrefix: string): React.ReactNode[] => {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, index) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={`${keyPrefix}-url-${index}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={`${keyPrefix}-text-${index}`}>{part}</React.Fragment>;
  });
};

const renderReleaseMessage = (message: string): React.ReactNode => {
  // Accept both "**bold**" and escaped "\*\*bold\*\*" forms.
  const normalizedMessage = message.replace(/\\\*\\\*/g, '**');
  const lines = normalizedMessage.split('\n');
  return lines.map((line, lineIndex) => {
    const nodes: React.ReactNode[] = [];
    const boldRegex = /\*\*([^*]+)\*\*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let partIndex = 0;

    while ((match = boldRegex.exec(line)) !== null) {
      const [fullMatch, boldText] = match;
      const matchStart = match.index;
      if (matchStart > lastIndex) {
        nodes.push(
          ...renderTextWithLinks(line.slice(lastIndex, matchStart), `pre-${lineIndex}-${partIndex++}`)
        );
      }
      nodes.push(<strong key={`bold-${lineIndex}-${partIndex++}`}>{boldText}</strong>);
      lastIndex = matchStart + fullMatch.length;
    }

    if (lastIndex < line.length) {
      nodes.push(...renderTextWithLinks(line.slice(lastIndex), `tail-${lineIndex}-${partIndex++}`));
    }

    if (nodes.length === 0) {
      nodes.push(<React.Fragment key={`empty-${lineIndex}`}>{line}</React.Fragment>);
    }

    return (
      <React.Fragment key={`line-${lineIndex}`}>
        {nodes}
        {lineIndex < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
};

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
              <div className="release-message-content">{renderReleaseMessage(release.message)}</div>
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
