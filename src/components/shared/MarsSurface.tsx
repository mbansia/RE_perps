"use client";

export function MarsSurface() {
  return (
    <div className="fixed bottom-0 left-0 right-0 h-32 pointer-events-none z-0 overflow-hidden">
      {/* Atmosphere haze */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgb(var(--c-bg-base) / 0) 20%, rgb(var(--c-oxide) / 0.1) 60%, rgb(var(--c-oxide) / 0.18) 100%)",
        }}
      />

      {/* Scrolling terrain layer 1 (far, slow) */}
      <div className="absolute bottom-0 left-0 w-[200%] h-20" style={{ animation: "terrainScroll 90s linear infinite" }}>
        <svg viewBox="0 0 2400 80" className="w-full h-full" preserveAspectRatio="none">
          <path
            d="M0 60 Q100 30 200 55 Q300 70 400 45 Q500 25 600 50 Q700 65 800 40 Q900 20 1000 55 Q1100 70 1200 45 Q1300 30 1400 55 Q1500 65 1600 40 Q1700 25 1800 50 Q1900 60 2000 35 Q2100 20 2200 55 Q2300 65 2400 45 L2400 80 L0 80 Z"
            fill="rgb(var(--c-oxide) / 0.3)"
          />
        </svg>
      </div>

      {/* Scrolling terrain layer 2 (mid, medium) */}
      <div className="absolute bottom-0 left-0 w-[200%] h-16" style={{ animation: "terrainScroll 60s linear infinite" }}>
        <svg viewBox="0 0 2400 64" className="w-full h-full" preserveAspectRatio="none">
          <path
            d="M0 40 Q150 50 300 35 Q450 20 600 40 Q750 55 900 30 Q1050 15 1200 40 Q1350 55 1500 35 Q1650 20 1800 45 Q1950 50 2100 30 Q2250 18 2400 40 L2400 64 L0 64 Z"
            fill="rgb(var(--c-terra-dark) / 0.25)"
          />
          {/* Craters */}
          <circle cx="350" cy="50" r="6" fill="rgb(var(--c-void) / 0.4)" />
          <circle cx="900" cy="45" r="4" fill="rgb(var(--c-void) / 0.3)" />
          <circle cx="1500" cy="48" r="5" fill="rgb(var(--c-void) / 0.35)" />
          <circle cx="2100" cy="42" r="3" fill="rgb(var(--c-void) / 0.3)" />
        </svg>
      </div>

      {/* Scrolling terrain layer 3 (near, fast) */}
      <div className="absolute bottom-0 left-0 w-[200%] h-10" style={{ animation: "terrainScroll 40s linear infinite" }}>
        <svg viewBox="0 0 2400 40" className="w-full h-full" preserveAspectRatio="none">
          <path
            d="M0 25 Q200 15 400 28 Q600 35 800 20 Q1000 10 1200 25 Q1400 32 1600 18 Q1800 12 2000 28 Q2200 35 2400 22 L2400 40 L0 40 Z"
            fill="rgb(var(--c-terra) / 0.16)"
          />
        </svg>
      </div>

      {/* Dust particles rising from surface */}
      <div className="absolute bottom-4 left-[20%] w-1 h-1 rounded-full bg-terra/25 animate-dust-float" />
      <div className="absolute bottom-6 left-[50%] w-0.5 h-0.5 rounded-full bg-terra/20 animate-dust-float" style={{ animationDelay: "3s" }} />
      <div className="absolute bottom-3 left-[75%] w-1 h-1 rounded-full bg-terra/15 animate-dust-float" style={{ animationDelay: "7s" }} />
      <div className="absolute bottom-5 left-[35%] w-0.5 h-0.5 rounded-full bg-terra/25 animate-dust-float" style={{ animationDelay: "11s" }} />

      <style jsx>{`
        @keyframes terrainScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
