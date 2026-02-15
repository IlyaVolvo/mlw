import React, { useState } from 'react';

interface IconsTutorialProps {
  onComplete: () => void;
}

interface IconStep {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const ICON_STEPS: IconStep[] = [
  {
    title: 'Statistics',
    description: 'View your game statistics by language and word length. See your win rate, average attempts, and guess distribution.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"></line>
        <line x1="12" y1="20" x2="12" y2="4"></line>
        <line x1="6" y1="20" x2="6" y2="14"></line>
      </svg>
    ),
  },
  {
    title: 'Cross-Language Comparison',
    description: 'Compare your performance across all languages. See a bar chart of your average attempts per language and word length.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"></rect>
        <rect x="14" y="3" width="7" height="7" rx="1"></rect>
        <rect x="3" y="14" width="7" height="7" rx="1"></rect>
        <rect x="14" y="14" width="7" height="7" rx="1"></rect>
      </svg>
    ),
  },
  {
    title: 'Languages',
    description: 'Mark one or more languages you\'d like to appear in the language selection menu. Choose which languages you play.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      </svg>
    ),
  },
  {
    title: 'Mail',
    description: 'Send comments, report bugs, or suggest incorrect or missing words. Want to add a new language? Contact the author — it\'s relatively easy with a couple of dictionaries per word length.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
        <polyline points="22,6 12,13 2,6"></polyline>
      </svg>
    ),
  },
  {
    title: 'Logout',
    description: 'Sign out of your account. Your progress is saved and you can log back in anytime.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16 17 21 12 16 7"></polyline>
        <line x1="21" y1="12" x2="9" y2="12"></line>
      </svg>
    ),
  },
];

export const IconsTutorial: React.FC<IconsTutorialProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);

  const currentStep = ICON_STEPS[step];

  const handleNext = () => {
    if (step < ICON_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const handlePrev = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const isLastStep = step === ICON_STEPS.length - 1;

  return (
    <div className="tutorial-container icons-tutorial-container">
      <div className="tutorial-card icons-tutorial-card">
        <div className="tutorial-header">
          <h2>Header Icons</h2>
          <div className="tutorial-progress">
            {ICON_STEPS.map((_, i) => (
              <div
                key={i}
                className={`tutorial-progress-dot ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
              />
            ))}
          </div>
        </div>

        <div className="icons-tutorial-content">
          <div className="icons-tutorial-icon">{currentStep.icon}</div>
          <h3 className="icons-tutorial-title">{currentStep.title}</h3>
          <div className="tutorial-explanation">
            <p>{currentStep.description}</p>
          </div>
        </div>

        <div className="tutorial-actions">
          <button
            type="button"
            className="tutorial-skip-button"
            onClick={handleSkip}
          >
            Skip
          </button>
          <div className="tutorial-nav-buttons">
            {step > 0 && (
              <button
                type="button"
                className="tutorial-prev-button"
                onClick={handlePrev}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="tutorial-next-button"
              onClick={handleNext}
            >
              {isLastStep ? 'Start Playing!' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
