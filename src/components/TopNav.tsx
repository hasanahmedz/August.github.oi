import React from 'react';
import type { NavSection } from '../types/assistant';

interface TopNavProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onRunBriefing: () => void;
  isBusy: boolean;
}

const NAV_ITEMS: Array<{ id: NavSection; label: string }> = [
  { id: 'sandbox', label: 'Live Sandbox' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'guide', label: 'Build Guide' },
  { id: 'code', label: 'Starter Code' },
];

export const TopNav: React.FC<TopNavProps> = ({
  activeSection,
  onSelectSection,
  onRunBriefing,
  isBusy,
}) => {
  const isDarkHud = activeSection === 'sandbox';

  return (
    <header
      className={`sticky top-0 z-30 backdrop-blur-md border-b transition-colors ${
        isDarkHud
          ? 'bg-[#060c18]/90 border-cyan-500/15 text-slate-100'
          : 'bg-white/95 border-slate-200 text-slate-900'
      }`}
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onSelectSection('sandbox')}
          className={`text-base sm:text-lg font-display font-bold tracking-tight whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400 rounded-sm ${
            isDarkHud ? 'text-cyan-50' : 'text-slate-900'
          }`}
        >
          J.A.R.V.I.S.
        </button>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav
          aria-label="Primary sections"
          className="flex items-center gap-5 sm:gap-7 overflow-x-auto no-scrollbar"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400 rounded-sm ${
                  isDarkHud
                    ? isActive
                      ? 'text-cyan-300'
                      : 'text-slate-400 hover:text-slate-100'
                    : isActive
                    ? 'text-slate-900'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 right-0 bottom-0 h-0.5 rounded-full ${
                      isDarkHud ? 'bg-cyan-400' : 'bg-blue-600'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action button */}
        <div className="shrink-0 hidden sm:block">
          <button
            type="button"
            onClick={onRunBriefing}
            disabled={isBusy}
            className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:opacity-50 ${
              isDarkHud
                ? 'text-cyan-200 bg-cyan-500/15 border border-cyan-400/35 hover:bg-cyan-500/25'
                : 'text-white bg-slate-900 hover:bg-slate-800'
            }`}
          >
            Run Briefing
          </button>
        </div>
      </div>
    </header>
  );
};
