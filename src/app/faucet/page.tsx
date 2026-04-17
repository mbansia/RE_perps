"use client";

import { useAccount } from "wagmi";
import { useAccountHealth } from "@/hooks/useAccountHealth";
import { FAUCET_URL, EXPLORER_URL } from "@/lib/constants";

export default function FaucetPage() {
  const { address, isConnected } = useAccount();
  const { tUsdiBalance, collateral } = useAccountHealth();

  const steps = [
    { label: "Connect Wallet", desc: isConnected ? `Connected: ${address?.slice(0, 6)}...${address?.slice(-4)}` : "Sign in with Google, X, or Email via Web3Auth", done: isConnected },
    { label: "Get Testnet Tokens", desc: "The Integra faucet gives 10 IRL (gas) + 1,000 tUSDI (collateral)", done: tUsdiBalance > 0 },
    { label: "Deposit Collateral", desc: "Go to Portfolio and deposit tUSDI into your margin account", done: collateral > 0 },
    { label: "Open Your First Trade", desc: "Pick NYC or Dubai, choose long or short, set your size", done: false },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-slide-up">
      <div>
        <h1 className="heading-display text-2xl text-text-primary tracking-[0.15em]">MISSION BRIEFING</h1>
        <p className="text-text-secondary mt-2 text-sm">Get testnet tokens and start trading real estate indices</p>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className={`card p-6 transition-all ${step.done ? "border-long/20" : ""}`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                step.done
                  ? "bg-long/15 text-long border border-long/20"
                  : "text-text-muted border border-border"
              }`} style={!step.done ? { background: "rgba(74, 28, 28, 0.3)" } : {}}>
                {step.done ? "✓" : i + 1}
              </div>
              <div>
                <h3 className="font-semibold text-text-primary">{step.label}</h3>
                <p className="text-sm text-text-secondary mt-1">{step.desc}</p>
                {i === 1 && (
                  <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="btn-terra inline-block text-sm mt-3">
                    Open Faucet
                  </a>
                )}
                {i === 1 && tUsdiBalance > 0 && (
                  <span className="ml-3 text-sm pnl-positive">{tUsdiBalance.toFixed(2)} tUSDI</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-6">
        <h3 className="label mb-3">Resources</h3>
        <ul className="space-y-2 text-sm">
          <li><a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="text-terra hover:text-terra-hover transition-colors">Integra Testnet Faucet</a></li>
          <li><a href={EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="text-terra hover:text-terra-hover transition-colors">Block Explorer (Blockscout)</a></li>
        </ul>
      </div>
    </div>
  );
}
