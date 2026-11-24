// Telling a jump apart from everything else that moves the watched system id: switching
// character, logging in or out, the first reading of a session, a clone jump. Anything
// ambiguous is rejected rather than guessed at.

/** One reading of the acting character's position. */
export interface Reading {
	characterId: number | null;
	/** Null when offline or unknown: a stale location is not a location. */
	systemId: number | null;
	/** In a station or structure. */
	docked: boolean;
}

/**
 * Two consecutive readings of the same character in two different systems, landing in
 * space, is the only shape a jump can have. Anything else is null.
 */
export function detectJump(prev: Reading, next: Reading): { from: number; to: number } | null {
	// A missing reading on either side is a login, a logout, or the first poll of the
	// session. None of them is a jump, and the last known system may be hours stale.
	if (prev.systemId === null || next.systemId === null) return null;
	if (prev.systemId === next.systemId) return null;
	// Switching character moves the watched system id without anyone flying anywhere;
	// acting on it would connect two pilots' systems.
	if (prev.characterId !== next.characterId) return null;
	// A wormhole always drops you in space. Landing docked is a jump clone, a capsule
	// self-destructed to wake up in another one, or a pod death. Where the move began is
	// not asked: a station kept from before a logout would hide the jump of a pilot who
	// logs in, undocks and takes the static before the next poll.
	if (next.docked) return null;
	return { from: prev.systemId, to: next.systemId };
}
