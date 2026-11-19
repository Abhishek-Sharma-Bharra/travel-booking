/** Future adapter contract only. No live seat inventory, prices or sales. */
export const seatTicketingEnabled = false as const;
export interface SeatInventorySnapshot {
  operatorBusinessId: string;
  vehicleId: string;
  tripId: string;
  sourceRevision: string;
  synchronizedAt: string;
  expiresAt: string;
  seats: ReadonlyArray<{
    id: string;
    available: boolean;
    netPaise: number;
    taxPaise: number;
  }>;
}
export interface FutureSeatInventoryAdapter {
  readSnapshot(tripId: string): Promise<SeatInventorySnapshot>;
  reserve(input: {
    tripId: string;
    seatIds: readonly string[];
    sourceRevision: string;
    idempotencyKey: string;
  }): Promise<{ externalHoldId: string; expiresAt: string }>;
  release(externalHoldId: string, idempotencyKey: string): Promise<void>;
}
