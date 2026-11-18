<script lang="ts">
	// The rolling cheat sheet: for each mass of wormhole, what to put through first, and what
	// the hole's answer to "is it reduced?" then calls for. Worked out for the ship typed in
	// at the top rather than printed for one battleship, so it covers every hole the catalog
	// knows and whatever is being rolled with.
	import * as v from 'valibot';

	import type { SignatureCatalog } from '$lib/api/types/SignatureCatalog';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { formatKt } from '$lib/map/mass';
	import {
		describeJumps,
		massClasses,
		rollPlan,
		type RollBranch,
		type RollSteps,
	} from '$lib/map/rolling';
	import { readStored, writeStored } from '$lib/storage';
	import type { MapState } from '../../state/map-state.svelte';

	let { map, open = $bindable() }: { map: MapState; open: boolean } = $props();

	const KG_PER_KT = 1_000_000;
	const STORED = 'rolling-ship';
	// A battleship with a 100MN prop and plates, near enough: what the chart everyone
	// knows assumes.
	const stored = readStored(
		STORED,
		v.object({
			cold: v.pipe(v.number(), v.minValue(1)),
			hot: v.pipe(v.number(), v.minValue(1)),
		}),
		{ cold: 200, hot: 300 },
	);
	// In kt, as typed. Kept as text so a half-typed number is not rewritten under the cursor.
	let cold = $state(String(stored.cold));
	let hot = $state(String(stored.hot));
	let find = $state('');

	const parsed = (text: string) => {
		const kt = Number(text.replaceAll(',', '').trim());
		return Number.isFinite(kt) && kt > 0 ? kt : null;
	};
	const ship = $derived.by(() => {
		const c = parsed(cold);
		const h = parsed(hot);
		// Hot is the heavier one by definition; the other way round is a typo, not a ship.
		return c === null || h === null || h < c ? null : { cold: c * KG_PER_KT, hot: h * KG_PER_KT };
	});
	$effect(() => {
		if (ship) writeStored(STORED, { cold: ship.cold / KG_PER_KT, hot: ship.hot / KG_PER_KT });
	});

	let catalog = $state<SignatureCatalog | null>(null);
	$effect(() => {
		if (open && catalog === null) void map.loadCatalog().then((loaded) => (catalog = loaded));
	});

	const classes = $derived(catalog ? massClasses(catalog.types) : []);
	const wanted = $derived(find.trim().toUpperCase());
	const rows = $derived(
		classes
			.filter((c) => wanted === '' || c.codes.some((code) => code.includes(wanted)))
			.map((c) => ({ ...c, plan: ship ? rollPlan(c.totalMass, c.maxJump, ship) : null })),
	);
	const rollable = $derived(rows.filter((r) => r.plan !== null));
	const tooSmall = $derived(rows.filter((r) => r.plan === null));
</script>

{#snippet steps(label: string, s: RollSteps, kind: 'roll' | 'crit')}
	{@const idle = s.jumps.cold + s.jumps.hot === 0}
	<div>
		<div class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">{label}</div>
		<div class="text-sm text-foreground">
			{idle ? 'No more jumps' : describeJumps(s.jumps)}
		</div>
		{#if s.last}
			<div class="text-muted-foreground">The last jump home {s.last}.</div>
		{/if}
		{#if kind === 'roll' && !s.certain}
			<div class="text-amber-500">
				{#if idle}
					Nothing is safe from here. Close it with a light ship.
				{:else if s.critical}
					It can stay open, but critical. Close it with a light ship.
				{:else}
					It can stay open. Check the hole, then close it with a light ship.
				{/if}
			</div>
		{:else if kind === 'crit' && !s.certain}
			<div class="text-muted-foreground">
				{idle ? 'Any more could close it.' : 'As far as is safe. It may not show critical yet.'}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet branch(title: string, b: RollBranch | null, testid: string)}
	<div class="flex flex-col gap-2 border border-border/60 p-2" data-testid={testid}>
		<div class="text-xs font-medium text-foreground">{title}</div>
		{#if b}
			{@render steps('To roll', b.roll, 'roll')}
			{@render steps('To crit', b.crit, 'crit')}
		{:else}
			<div class="text-muted-foreground">It cannot be, after those jumps.</div>
		{/if}
	</div>
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content
		class="h-[46rem] max-h-[90vh] w-full grid-rows-[auto_auto_minmax(0,1fr)] sm:max-w-5xl"
		data-testid="rolling-dialog"
	>
		<Dialog.Header>
			<Dialog.Title class="font-heading text-xl">Rolling cheat sheet</Dialog.Title>
			<Dialog.Description class="text-sm">
				For a hole nothing has gone through yet. A hole's real mass is its type's give or take 10%,
				so the first jumps put about half through, and whether it then shows reduced says which side
				of the type's mass it is on. Every set of jumps ends with the roller at home.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-wrap items-end gap-3 border-y border-border/40 py-3">
			<label class="flex flex-col gap-1">
				<span class="text-muted-foreground">Ship cold (kt)</span>
				<Input
					class="w-28 tabular-nums"
					inputmode="numeric"
					bind:value={cold}
					data-testid="rolling-cold"
				/>
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-muted-foreground">Ship hot (kt)</span>
				<Input
					class="w-28 tabular-nums"
					inputmode="numeric"
					bind:value={hot}
					data-testid="rolling-hot"
				/>
			</label>
			<label class="ml-auto flex flex-col gap-1">
				<span class="text-muted-foreground">Find a hole</span>
				<Input
					class="w-32 uppercase"
					placeholder="H296"
					bind:value={find}
					data-testid="rolling-find"
				/>
			</label>
			{#if !ship}
				<p class="basis-full text-destructive">
					Give both masses in kt, the hot one no lighter than the cold one.
				</p>
			{/if}
		</div>

		<div class="-mr-2 overflow-y-auto pr-2">
			{#if ship}
				<div class="grid gap-3 lg:grid-cols-2">
					{#each rollable as row (`${row.totalMass}:${row.maxJump}`)}
						{@const plan = row.plan!}
						<section
							class="flex flex-col gap-2 border border-border bg-card p-3"
							data-testid="rolling-class"
						>
							<header class="flex items-baseline justify-between gap-3">
								<h3 class="font-heading text-base text-foreground tabular-nums">
									{formatKt(row.totalMass)} kt
								</h3>
								{#if row.maxJump !== null}
									<span class="text-muted-foreground tabular-nums">
										{formatKt(row.maxJump)} kt a jump
									</span>
								{/if}
							</header>
							<p class="font-mono text-[11px] leading-relaxed text-muted-foreground">
								{#each row.codes as code (code)}
									<span class={wanted !== '' && code.includes(wanted) ? 'text-foreground' : ''}>
										{code}
									</span>{' '}
								{/each}
							</p>
							<div>
								<div class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
									First
								</div>
								<div class="text-sm text-foreground" data-testid="rolling-first">
									{describeJumps(plan.first)}
								</div>
								{#if plan.away}
									<div class="text-muted-foreground">
										That leaves you on the far side. The jumps below start with the way home.
									</div>
								{/if}
							</div>
							<div class="text-xs text-foreground italic">Is the hole reduced?</div>
							<div class="grid grid-cols-2 gap-2">
								{@render branch('Yes', plan.reduced, 'rolling-reduced')}
								{@render branch('No', plan.fresh, 'rolling-fresh')}
							</div>
						</section>
					{/each}
				</div>

				{#if tooSmall.length > 0}
					<div
						class="mt-4 flex flex-col gap-1 text-muted-foreground"
						data-testid="rolling-too-small"
					>
						<div class="text-xs font-medium text-foreground">Too small for this ship</div>
						{#each tooSmall as row (`${row.totalMass}:${row.maxJump}`)}
							<p>
								<span class="tabular-nums">
									{formatKt(row.totalMass)} kt, {formatKt(row.maxJump ?? 0)} kt a jump:
								</span>
								<span class="font-mono text-[11px]">{row.codes.join(' ')}</span>
							</p>
						{/each}
					</div>
				{/if}

				{#if catalog && rows.length === 0}
					<p class="text-muted-foreground">No hole called that.</p>
				{/if}
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
