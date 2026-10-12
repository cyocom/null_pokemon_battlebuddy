export interface ScoreOption {
  p: number;
  delta: number;
}

export type Clause =
  | { kind: 'fixed'; delta: number; reason: string }
  | { kind: 'dist'; reason: string; options: ScoreOption[] };

export function fixed(delta: number, reason: string): Clause {
  return { kind: 'fixed', delta, reason };
}

export function chance(p: number, delta: number, reason: string): Clause {
  return { kind: 'dist', reason, options: [{ p, delta }, { p: 1 - p, delta: 0 }] };
}

export function pick(reason: string, options: ScoreOption[]): Clause {
  return { kind: 'dist', reason, options };
}

/** Probability of each total score. Independent clauses are convolved. */
export function convolve(clauses: Clause[]): Map<number, number> {
  let dist = new Map<number, number>([[0, 1]]);
  for (const clause of clauses) {
    const options = clause.kind === 'fixed' ? [{ p: 1, delta: clause.delta }] : clause.options;
    const next = new Map<number, number>();
    for (const [score, pScore] of dist) {
      for (const option of options) {
        if (option.p <= 1e-12) continue;
        const scoreNext = score + option.delta;
        next.set(scoreNext, (next.get(scoreNext) ?? 0) + pScore * option.p);
      }
    }
    dist = next;
  }
  return dist;
}

/** Share of the probability mass each distribution wins, splitting exact ties evenly. */
export function winShares(distributions: Map<number, number>[]): number[] {
  type State = { best: number; mask: number; p: number };
  let states: State[] = [{ best: -9999, mask: 0, p: 1 }];
  distributions.forEach((dist, index) => {
    const next: State[] = [];
    for (const state of states) {
      for (const [score, pScore] of dist) {
        if (pScore <= 0) continue;
        let best = state.best;
        let mask = state.mask;
        if (score > best) {
          best = score;
          mask = 1 << index;
        } else if (score === best) {
          mask |= 1 << index;
        }
        const p = state.p * pScore;
        const found = next.find((row) => row.best === best && row.mask === mask);
        if (found) found.p += p;
        else next.push({ best, mask, p });
      }
    }
    states = next;
  });
  const shares = distributions.map(() => 0);
  for (const state of states) {
    let winners = 0;
    for (let i = 0; i < distributions.length; i++) if (state.mask & (1 << i)) winners++;
    if (!winners) continue;
    for (let i = 0; i < distributions.length; i++) {
      if (state.mask & (1 << i)) shares[i] += state.p / winners;
    }
  }
  return shares;
}

export function modalScore(dist: Map<number, number>): number {
  let best = 0;
  let p = -1;
  for (const [score, prob] of dist) {
    if (prob > p) {
      best = score;
      p = prob;
    }
  }
  return best;
}

/** Gate a block of clauses so it applies with probability `p` and otherwise adds nothing. */
export function gate(p: number, clauses: Clause[], reason: string): Clause {
  const inner = convolve(clauses);
  const options: ScoreOption[] = [{ p: 1 - p, delta: 0 }];
  for (const [delta, prob] of inner) options.push({ p: p * prob, delta });
  return { kind: 'dist', reason, options };
}
