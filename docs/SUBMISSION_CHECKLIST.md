# Submission Checklist

## Core Requirements
- [ ] Public repository link
- [ ] Updated README with architecture and run instructions
- [ ] Deployed contracts on Westend Asset Hub (addresses documented)
- [ ] Frontend demo running and usable
- [ ] 2-5 minute demo video

## Track 2 Alignment (PVM Smart Contracts)
- [ ] Solidity contract calls Rust contract on PolkaVM
- [ ] Non-trivial application logic (private governance voting)
- [ ] Explain why Rust verification is used (perf/safety/no_std)

## Security and Correctness
- [ ] One-vote-per-wallet-per-proposal enforced
- [ ] Nullifier-based anti-double-vote in contract
- [ ] Vote selection persisted and highlighted in UI
- [ ] Contract interaction failures surfaced in UI status messages

## Demo Readiness
- [ ] Prepare two funded wallets for YES/NO demo
- [ ] Run through docs/DEMO_RUNBOOK.md once before recording
- [ ] Validate proposal creation, voting, and results pages

## Optional OpenZeppelin Sponsor Track
- [ ] Integrate OpenZeppelin libraries with non-trivial logic
- [ ] Document why OZ primitives were chosen
