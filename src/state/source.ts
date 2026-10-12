import type { BattleSnapshot, BattleStateSource } from './types';

export class ManualSource implements BattleStateSource {
  readonly kind = 'manual' as const;

  constructor(private snapshot: BattleSnapshot) {}

  read(): BattleSnapshot {
    return this.snapshot;
  }

  update(snapshot: BattleSnapshot): void {
    this.snapshot = snapshot;
  }
}

/** Same snapshot shape as the form. Memory reading is intentionally not implemented. */
export class EmulatorSource implements BattleStateSource {
  readonly kind = 'emulator' as const;

  read(): BattleSnapshot {
    throw new Error('Emulator reading is not connected yet. The manual form is the battle state.');
  }
}
