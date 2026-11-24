import { describe, expect, it } from 'vitest';

import { detectJump, type Reading } from './jump-detection';

const inSpace = (characterId: number | null, systemId: number | null): Reading => ({
	characterId,
	systemId,
	docked: false,
});
const docked = (characterId: number, systemId: number): Reading => ({
	characterId,
	systemId,
	docked: true,
});

describe('detectJump', () => {
	it('accepts the same character in two different systems', () => {
		expect(detectJump(inSpace(9, 100), inSpace(9, 200))).toEqual({ from: 100, to: 200 });
	});

	it('rejects the first reading of a session', () => {
		expect(detectJump(inSpace(null, null), inSpace(9, 100))).toBeNull();
	});

	it('rejects a logout, where the new reading has no system', () => {
		expect(detectJump(inSpace(9, 100), inSpace(9, null))).toBeNull();
	});

	it('rejects standing still', () => {
		expect(detectJump(inSpace(9, 100), inSpace(9, 100))).toBeNull();
	});

	it('rejects a character switch, even across systems', () => {
		expect(detectJump(inSpace(9, 100), inSpace(7, 200))).toBeNull();
	});

	it('rejects a move that lands docked: a clone jump, not a hole', () => {
		expect(detectJump(docked(9, 100), docked(9, 200))).toBeNull();
		expect(detectJump(inSpace(9, 100), docked(9, 200))).toBeNull();
	});

	it('accepts a move that began docked and landed in space', () => {
		expect(detectJump(docked(9, 100), inSpace(9, 200))).toEqual({ from: 100, to: 200 });
	});
});
