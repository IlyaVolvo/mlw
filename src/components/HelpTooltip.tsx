import React, { useState, useEffect, useRef } from 'react';
import { loadHelpTip } from '../data/dictionaryLoader';

interface HelpTooltipProps {
  language: string;
  children: React.ReactNode;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ language, children }) => {
  const [helpText, setHelpText] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load help tip text when language changes
    const loadTip = async () => {
      console.log(`[HelpTooltip] Loading help tip for language: ${language}`);
      const text = await loadHelpTip(language);
      console.log(`[HelpTooltip] Loaded help text:`, text ? `"${text}"` : 'null');
      setHelpText(text);
    };
    loadTip();
  }, [language]);


  const handleMouseEnter = (e: React.MouseEvent) => {
    if (!helpText) return;
    
    setIsVisible(true);
    // Use requestAnimationFrame to ensure tooltip is rendered before positioning
    requestAnimationFrame(() => {
      updatePosition(e);
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isVisible || !helpText) return;
    updatePosition(e);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
    setPosition(null);
  };

  const updatePosition = (e: React.MouseEvent) => {
    if (!containerRef.current || !tooltipRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    
    // Calculate position relative to container
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;
    
    // Default: position above cursor, centered horizontally
    let left = mouseX - tooltipRect.width / 2;
    let top = mouseY - tooltipRect.height - 10;
    
    // Adjust if tooltip would go off screen horizontally
    if (left < 10) {
      left = 10; // Keep some margin from left edge
    } else if (left + tooltipRect.width > containerRect.width - 10) {
      left = containerRect.width - tooltipRect.width - 10; // Keep margin from right edge
    }
    
    // Adjust if tooltip would go off screen vertically (above)
    if (top < 10) {
      // Position below cursor instead
      top = mouseY + 20;
    }
    
    setPosition({ top, left });
  };

  // Always render the container and children, but only show tooltip if helpText exists
  return (
    <div
      ref={containerRef}
      className="help-tooltip-container"
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      {children}
      {isVisible && helpText && (
        <div
          ref={tooltipRef}
          className="help-tooltip"
          style={{
            position: 'absolute',
            top: position ? `${position.top}px` : 'auto',
            left: position ? `${position.left}px` : 'auto',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          {helpText}
        </div>
      )}
    </div>
  );
};
