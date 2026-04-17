"use client";

import { useState, useEffect } from "react";

export function MarsLanding() {
  const [phase, setPhase] = useState<"entry" | "landing" | "done">("entry");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already seen this session
    if (sessionStorage.getItem("terraform-landed")) {
      setDismissed(true);
      return;
    }
    const t1 = setTimeout(() => setPhase("landing"), 2000);
    const t2 = setTimeout(() => {
      setPhase("done");
      sessionStorage.setItem("terraform-landed", "1");
    }, 4500);
    const t3 = setTimeout(() => setDismissed(true), 5500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  if (dismissed) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-1000 ${
        phase === "done" ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ background: "#0C0404" }}
      onClick={() => { setDismissed(true); sessionStorage.setItem("terraform-landed", "1"); }}
    >
      {/* Star field */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: `${Math.random() * 2 + 1}px`,
              height: `${Math.random() * 2 + 1}px`,
              top: `${Math.random() * 70}%`,
              left: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.7 + 0.1,
              animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      {/* Mars planet in background */}
      <div
        className="absolute rounded-full"
        style={{
          width: "600px",
          height: "600px",
          bottom: phase === "entry" ? "-400px" : "-200px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "radial-gradient(circle at 40% 35%, #F4A574, #C75B3B 40%, #4A1C1C 70%, #2D1111)",
          transition: "bottom 3s ease-out",
          boxShadow: "0 0 120px rgba(232, 123, 74, 0.15), inset -30px -20px 60px rgba(0,0,0,0.4)",
        }}
      >
        {/* Surface details */}
        <div className="absolute w-16 h-8 rounded-full bg-mars-700/50 top-[35%] left-[25%] blur-sm" />
        <div className="absolute w-24 h-10 rounded-full bg-mars-600/30 top-[45%] left-[50%] blur-sm" />
        <div className="absolute w-10 h-10 rounded-full bg-mars-800/40 top-[30%] left-[65%] blur-sm" />
      </div>

      {/* Spaceship */}
      <div
        className="relative z-10"
        style={{
          animation: phase === "entry"
            ? "shipDescend 2s ease-in forwards"
            : phase === "landing"
            ? "shipLand 2.5s ease-out forwards"
            : "none",
        }}
      >
        {/* Ship body */}
        <div className="relative">
          <svg width="80" height="100" viewBox="0 0 80 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Hull */}
            <path d="M40 5 L60 45 L55 85 L25 85 L20 45 Z" fill="url(#hull)" stroke="#C75B3B" strokeWidth="1" />
            {/* Window */}
            <circle cx="40" cy="35" r="8" fill="#1E3A5F" stroke="#5B8DEF" strokeWidth="1.5" />
            <circle cx="40" cy="35" r="4" fill="#5B8DEF" opacity="0.3" />
            {/* Wings */}
            <path d="M20 45 L5 70 L20 65 Z" fill="#8B3A3A" stroke="#C75B3B" strokeWidth="0.5" />
            <path d="M60 45 L75 70 L60 65 Z" fill="#8B3A3A" stroke="#C75B3B" strokeWidth="0.5" />
            {/* Landing legs */}
            <line x1="25" y1="85" x2="15" y2="98" stroke="#6B4F43" strokeWidth="2" />
            <line x1="55" y1="85" x2="65" y2="98" stroke="#6B4F43" strokeWidth="2" />
            {/* Feet */}
            <line x1="10" y1="98" x2="20" y2="98" stroke="#6B4F43" strokeWidth="2" />
            <line x1="60" y1="98" x2="70" y2="98" stroke="#6B4F43" strokeWidth="2" />
            <defs>
              <linearGradient id="hull" x1="40" y1="5" x2="40" y2="85">
                <stop offset="0%" stopColor="#B89A8A" />
                <stop offset="100%" stopColor="#6B4F43" />
              </linearGradient>
            </defs>
          </svg>

          {/* Engine flame */}
          {phase !== "done" && (
            <div
              className="absolute left-1/2 -translate-x-1/2"
              style={{ bottom: "-30px" }}
            >
              <div
                className="w-6 h-12 rounded-b-full mx-auto"
                style={{
                  background: "linear-gradient(180deg, #FF5733, #FFB547, #FFF0E5)",
                  animation: "flicker 0.1s ease-in-out infinite alternate",
                  opacity: phase === "landing" ? 0.6 : 1,
                  filter: "blur(1px)",
                }}
              />
              <div
                className="w-3 h-8 rounded-b-full mx-auto -mt-6"
                style={{
                  background: "linear-gradient(180deg, #FFF, #FFB547)",
                  animation: "flicker 0.08s ease-in-out infinite alternate",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Text */}
      <div
        className="absolute bottom-[15%] left-1/2 -translate-x-1/2 text-center"
        style={{
          opacity: phase === "landing" || phase === "done" ? 1 : 0,
          transition: "opacity 1s ease-in",
        }}
      >
        <h1
          className="heading-display text-4xl md:text-5xl tracking-[0.3em] text-text-primary"
          style={{ textShadow: "0 0 40px rgba(232, 123, 74, 0.4)" }}
        >
          TERRAFORM
        </h1>
        <p className="text-terra text-sm tracking-[0.25em] mt-3 uppercase">
          Trade perps based on Real Estate
        </p>
      </div>

      <style jsx>{`
        @keyframes shipDescend {
          0% { transform: translateY(-200px) scale(0.5); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes shipLand {
          0% { transform: translateY(0); }
          60% { transform: translateY(80px); }
          80% { transform: translateY(70px); }
          100% { transform: translateY(75px); }
        }
        @keyframes flicker {
          0% { transform: scaleX(1) scaleY(1); }
          100% { transform: scaleX(0.85) scaleY(1.1); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.1; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
