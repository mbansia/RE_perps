"use client";

/**
 * Walking astronaut that traverses the bottom of the screen:
 *   0–45%   : walk left → right
 *   45–53%  : stop + look (head tilt)
 *   53–60%  : wait
 *   60–95%  : walk right → left (mirrored)
 *   95–100% : wait
 * Sub-animations on limbs run continuously and are dampened during pauses
 * via a multiplier on opacity/scale… but simpler: the walk cycle just keeps
 * going; during a stop the body translation holds still while legs stop.
 */
export function Astronaut() {
  return (
    <div className="absolute bottom-[14px] left-0 astronaut-path pointer-events-none z-10">
      <div className="astronaut-bob">
        <svg
          width="34"
          height="54"
          viewBox="0 0 34 54"
          xmlns="http://www.w3.org/2000/svg"
          className="astronaut-figure"
        >
          <defs>
            <linearGradient id="suit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F4E8E0" />
              <stop offset="70%" stopColor="#D6C4B5" />
              <stop offset="100%" stopColor="#9A8778" />
            </linearGradient>
            <radialGradient id="visor" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#5B8DEF" />
              <stop offset="60%" stopColor="#1E3A5F" />
              <stop offset="100%" stopColor="#0C1A2E" />
            </radialGradient>
          </defs>

          {/* Shadow */}
          <ellipse cx="17" cy="52" rx="9" ry="1.6" fill="rgba(0,0,0,0.35)" />

          {/* Backpack */}
          <rect x="7" y="20" width="20" height="18" rx="3" fill="#8B3A3A" />
          <rect x="9" y="22" width="16" height="3" rx="1" fill="#C75B3B" />
          <circle cx="12" cy="30" r="1.2" fill="#FF5733" />
          <circle cx="22" cy="30" r="1.2" fill="#00E68A" />

          {/* Left arm (behind torso) */}
          <g className="arm-left">
            <rect x="4" y="21" width="5" height="14" rx="2.5" fill="url(#suit)" />
            <circle cx="6.5" cy="35" r="2.4" fill="#D6C4B5" />
          </g>

          {/* Legs */}
          <g className="leg-left">
            <rect x="11" y="37" width="5" height="12" rx="2" fill="url(#suit)" />
            <rect x="10" y="47" width="7" height="3" rx="1" fill="#4A1C1C" />
          </g>
          <g className="leg-right">
            <rect x="18" y="37" width="5" height="12" rx="2" fill="url(#suit)" />
            <rect x="17" y="47" width="7" height="3" rx="1" fill="#4A1C1C" />
          </g>

          {/* Torso */}
          <rect x="9" y="20" width="16" height="19" rx="4" fill="url(#suit)" />
          {/* Chest unit */}
          <rect x="13" y="26" width="8" height="5" rx="1" fill="#4A1C1C" />
          <circle cx="15" cy="28.5" r="0.9" fill="#00E68A" />
          <circle cx="19" cy="28.5" r="0.9" fill="#FF5733" />
          <rect x="13.5" y="31" width="7" height="0.7" fill="#E87B4A" opacity="0.5" />

          {/* Helmet */}
          <g className="helmet">
            <circle cx="17" cy="13" r="9" fill="url(#suit)" />
            <path
              d="M10 13 Q10 7 17 7 Q24 7 24 13 Q24 17 17 18 Q10 17 10 13 Z"
              fill="url(#visor)"
            />
            {/* Visor reflection */}
            <ellipse cx="14" cy="11.5" rx="2.5" ry="1.4" fill="#F4E8E0" opacity="0.35" />
            <circle cx="13" cy="10.5" r="0.6" fill="#FFF" opacity="0.7" />
          </g>

          {/* Right arm (front) */}
          <g className="arm-right">
            <rect x="25" y="21" width="5" height="14" rx="2.5" fill="url(#suit)" />
            <circle cx="27.5" cy="35" r="2.4" fill="#D6C4B5" />
          </g>

          {/* Antenna */}
          <line x1="17" y1="4" x2="17" y2="1" stroke="#C75B3B" strokeWidth="0.8" />
          <circle cx="17" cy="0.8" r="0.9" fill="#FF5733" className="antenna-tip" />
        </svg>
      </div>

      <style jsx>{`
        /* Horizontal path: walk L→R, pause, walk R→L, pause. One full cycle ~80s. */
        .astronaut-path {
          animation: astronautWalk 80s linear infinite;
        }
        @keyframes astronautWalk {
          0%   { left: -40px;     transform: scaleX(1); }
          42%  { left: calc(100vw - 10px); transform: scaleX(1); }
          46%  { left: calc(100vw - 10px); transform: scaleX(1); }
          50%  { left: calc(100vw - 10px); transform: scaleX(-1); }
          92%  { left: -40px;     transform: scaleX(-1); }
          96%  { left: -40px;     transform: scaleX(-1); }
          100% { left: -40px;     transform: scaleX(1); }
        }

        /* Subtle bob as it walks (disabled feel during pauses via damping) */
        .astronaut-bob {
          animation: astronautBob 0.85s ease-in-out infinite;
        }
        @keyframes astronautBob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-1.5px); }
        }

        /* Leg swing */
        :global(.astronaut-figure .leg-left) {
          transform-origin: 13.5px 37px;
          animation: legSwing 0.85s ease-in-out infinite;
        }
        :global(.astronaut-figure .leg-right) {
          transform-origin: 20.5px 37px;
          animation: legSwing 0.85s ease-in-out infinite reverse;
        }
        @keyframes legSwing {
          0%, 100% { transform: rotate(-14deg); }
          50%      { transform: rotate(14deg); }
        }

        /* Arm swing (opposite of legs) */
        :global(.astronaut-figure .arm-left) {
          transform-origin: 6.5px 22px;
          animation: armSwing 0.85s ease-in-out infinite reverse;
        }
        :global(.astronaut-figure .arm-right) {
          transform-origin: 27.5px 22px;
          animation: armSwing 0.85s ease-in-out infinite;
        }
        @keyframes armSwing {
          0%, 100% { transform: rotate(-10deg); }
          50%      { transform: rotate(10deg); }
        }

        /* Head: occasional look — rotates subtly across the cycle */
        :global(.astronaut-figure .helmet) {
          transform-origin: 17px 15px;
          animation: helmetLook 80s ease-in-out infinite;
        }
        @keyframes helmetLook {
          0%, 40%   { transform: rotate(0deg); }
          44%       { transform: rotate(-12deg); }   /* look up at end-of-leg */
          47%       { transform: rotate(8deg); }     /* look down */
          50%, 90%  { transform: rotate(0deg); }
          94%       { transform: rotate(12deg); }    /* peek back */
          100%      { transform: rotate(0deg); }
        }

        /* Antenna blink */
        :global(.astronaut-figure .antenna-tip) {
          animation: antennaBlink 2s ease-in-out infinite;
        }
        @keyframes antennaBlink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }

        @media (prefers-reduced-motion: reduce) {
          .astronaut-path,
          .astronaut-bob,
          :global(.astronaut-figure .leg-left),
          :global(.astronaut-figure .leg-right),
          :global(.astronaut-figure .arm-left),
          :global(.astronaut-figure .arm-right),
          :global(.astronaut-figure .helmet),
          :global(.astronaut-figure .antenna-tip) {
            animation: none;
          }
          .astronaut-path { left: 20%; }
        }
      `}</style>
    </div>
  );
}
