# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/zhangliulian645-beep/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/zhangliulian645-beep/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of the DefiLlama protocol universe (758 protocols), screens out the products that can never issue a token of their own (bridges, liquid staking and restaking wrappers, wrapped and staked products, versioned pools, exchange house brands), and ranks the 178 launch-plausible pre-token protocols that remain by an implied launch value computed from the snapshot alone: implied = 186 × TVL^0.72 × growth × maturity, where growth saturates the 7-day TVL change and maturity pays for time run with no token. Every row carries a farm plan whose steps, costs and times are derived from the protocol's own category, chains, TVL tier and age, and the static dashboard (no network, no framework) presents the ranked board with sorting and filters, a per-protocol detail view with the full value breakdown, and a separate table of already-trading protocols at the market's own prices.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=a1d5ff81&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
