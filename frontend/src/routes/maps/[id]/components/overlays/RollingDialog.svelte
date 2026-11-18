<script lang="ts">
	// The rolling cheat sheet: for a mass of wormhole, what to put through first, and what
	// the hole's answer to "is it reduced?" then calls for. Worked out for the ship typed in
	// rather than printed for one battleship, so it covers every hole the catalog knows and
	// whatever is being rolled with.
	//
	// One hole at a time: the masses are a list to pick from, and the plan beside it is the
	// only thing to read. Sixteen plans on one page is a wall nobody rolls a hole from.
	import * as v from 'valibot';

	import type { SignatureCatalog } from '$lib/api/types/SignatureCatalog';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { formatKt } from '$lib/map/mass';
	import { cn } from '$lib/utils';
	import {
		massClasses,
		rollPlan,
		type Jumps,
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
	const keyOf = (c: { totalMass: number; maxJump: number | null }) => `${c.totalMass}:${c.maxJump}`;
	const rows = $derived(
		classes.map((c) => ({
			...c,
			key: keyOf(c),
			plan: ship ? rollPlan(c.totalMass, c.maxJump, ship) : null,
		})),
	);

	const wanted = $derived(find.trim().toUpperCase());
	// What the ship can roll first; the holes it does not fit through go last, under a line
	// of their own, so the list starts with what there is a plan for.
	const matches = $derived(
		(wanted === '' ? rows : rows.filter((r) => r.codes.some((code) => code.includes(wanted))))
			.map((r, i) => ({ r, i }))
			.sort((a, b) => Number(a.r.plan === null) - Number(b.r.plan === null) || a.i - b.i)
			.map(({ r }) => r),
	);
	const firstTooSmall = $derived(ship ? matches.find((r) => r.plan === null)?.key : undefined);
	/** The mass picked by hand; a search or a first look falls back to the first that fits. */
	let picked = $state<string | null>(null);
	const selected = $derived(
		matches.find((r) => r.key === picked) ??
			matches.find((r) => r.plan !== null) ??
			matches[0] ??
			null,
	);
</script>

{#snippet jumps(j: Jumps, size: 'lg' | 'md')}
	<span
		class={cn(
			'font-heading text-foreground tabular-nums',
			size === 'lg' ? 'text-2xl' : 'text-base',
		)}
	>
		{#if j.cold + j.hot === 0}
			No more jumps
		{:else}
			{#if j.cold > 0}{j.cold} cold{/if}{#if j.cold > 0 && j.hot > 0}<span
					class="px-1.5 text-muted-foreground">+</span
				>{/if}{#if j.hot > 0}{j.hot} hot{/if}
		{/if}
	</span>
{/snippet}

{#snippet goal(label: string, s: RollSteps, kind: 'roll' | 'crit')}
	{@const idle = s.jumps.cold + s.jumps.hot === 0}
	<div class="grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-x-3 px-3 py-2.5">
		<span class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span
		>
		<div class="flex flex-col gap-0.5">
			{@render jumps(s.jumps, 'md')}
			{#if s.last}
				<span class="text-muted-foreground">Fly the last jump home {s.last}.</span>
			{/if}
			{#if kind === 'roll' && !s.certain}
				<span class="text-amber-500">
					{#if idle}
						Nothing more is safe. Close it with a light ship.
					{:else if s.critical}
						It can stay open, critical. Close it with a light ship.
					{:else}
						It can stay open. Check it, then close it with a light ship.
					{/if}
				</span>
			{:else if kind === 'crit' && !s.certain}
				<span class="text-muted-foreground">
					{idle ? 'Any more could close it.' : 'As far as is safe; it may not show critical yet.'}
				</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet answer(title: string, dot: string, b: RollBranch | null, testid: string)}
	<div class="flex flex-col border border-border" data-testid={testid}>
		<div class="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
			<span class={cn('size-2 rounded-full', dot)}></span>
			<span class="text-sm font-medium text-foreground">{title}</span>
		</div>
		{#if b}
			<div class="divide-y divide-border/60">
				{@render goal('Roll', b.roll, 'roll')}
				{@render goal('Crit', b.crit, 'crit')}
			</div>
		{:else}
			<p class="px-3 py-2.5 text-muted-foreground">It cannot be, after those jumps.</p>
		{/if}
	</div>
{/snippet}

{#snippet step(n: number, title: string)}
	<div class="flex items-center gap-2">
		<span
			class="flex size-5 items-center justify-center border border-border font-mono text-[11px] text-muted-foreground"
		>
			{n}
		</span>
		<span class="text-sm font-medium text-foreground">{title}</span>
	</div>
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content
		class="grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-3xl"
		data-testid="rolling-dialog"
	>
		<Dialog.Header class="border-b border-border px-4 py-3">
			<Dialog.Title class="font-heading text-lg">Rolling cheat sheet</Dialog.Title>
			<Dialog.Description class="text-xs">
				For a hole nothing has gone through yet. Every set of jumps ends with you at home.
			</Dialog.Description>
		</Dialog.Header>

		<div class="grid h-[29rem] max-h-[70vh] grid-cols-[13rem_minmax(0,1fr)]">
			<!-- Which hole: by mass, or by typing its code. -->
			<div class="flex min-h-0 flex-col border-r border-border">
				<div class="border-b border-border p-2">
					<Input
						class="uppercase placeholder:normal-case"
						placeholder="Find a hole, e.g. H296"
						bind:value={find}
						data-testid="rolling-find"
					/>
				</div>
				<div class="min-h-0 flex-1 overflow-y-auto" data-testid="rolling-masses">
					{#each matches as row (row.key)}
						{#if row.key === firstTooSmall}
							<div
								class="mt-1 border-t border-border px-3 pt-2 pb-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase"
							>
								Too small for this ship
							</div>
						{/if}
						<button
							type="button"
							class={cn(
								'flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left transition-colors',
								row.key === selected?.key
									? 'bg-accent text-foreground'
									: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
								row.plan === null && 'opacity-50',
							)}
							aria-pressed={row.key === selected?.key}
							onclick={() => (picked = row.key)}
						>
							<span class="text-sm tabular-nums">{formatKt(row.totalMass)} kt</span>
							<span class="text-[11px] tabular-nums">
								{row.maxJump === null ? '' : `${formatKt(row.maxJump)} a jump`}
							</span>
						</button>
					{:else}
						<p class="px-3 py-2 text-muted-foreground">
							{catalog ? 'No hole called that.' : 'Loading…'}
						</p>
					{/each}
				</div>
			</div>

			<!-- The one plan. -->
			<div class="min-h-0 overflow-y-auto p-4">
				{#if !ship}
					<p class="text-destructive">
						Give the ship's cold and hot mass below, the hot one no lighter than the cold one.
					</p>
				{:else if selected}
					<div class="flex flex-col gap-4" data-testid="rolling-class">
						<div>
							<div class="flex items-baseline justify-between gap-3">
								<h3 class="font-heading text-xl text-foreground tabular-nums">
									{formatKt(selected.totalMass)} kt
								</h3>
								{#if selected.maxJump !== null}
									<span class="text-muted-foreground tabular-nums">
										{formatKt(selected.maxJump)} kt a jump
									</span>
								{/if}
							</div>
							<p class="mt-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
								{#each selected.codes as code (code)}
									<span class={wanted !== '' && code.includes(wanted) ? 'text-foreground' : ''}>
										{code}
									</span>{' '}
								{/each}
							</p>
						</div>

						{#if selected.plan}
							{@const plan = selected.plan}
							<div class="flex flex-col gap-2">
								{@render step(1, 'Put through')}
								<div class="pl-7" data-testid="rolling-first">
									{@render jumps(plan.first, 'lg')}
								</div>
								{#if plan.away}
									<p class="pl-7 text-muted-foreground">
										That leaves you on the far side. The jumps below start with the way home.
									</p>
								{/if}
							</div>

							<div class="flex flex-col gap-2">
								{@render step(2, 'Is the hole reduced?')}
								<div class="grid grid-cols-2 gap-3 pl-7">
									{@render answer('Reduced', 'bg-orange-500', plan.reduced, 'rolling-reduced')}
									{@render answer(
										'Not reduced',
										'bg-muted-foreground/40',
										plan.fresh,
										'rolling-fresh',
									)}
								</div>
							</div>
						{:else}
							<p class="text-muted-foreground" data-testid="rolling-too-small">
								Too small for this ship: it lets {formatKt(selected.maxJump ?? 0)} kt through at a time.
							</p>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<div
			class="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-4 py-2 text-muted-foreground"
		>
			<span>Rolling with a ship of</span>
			<Input
				class="w-16 text-center tabular-nums"
				inputmode="numeric"
				aria-label="Ship mass cold, in kt"
				bind:value={cold}
				data-testid="rolling-cold"
			/>
			<span>kt cold and</span>
			<Input
				class="w-16 text-center tabular-nums"
				inputmode="numeric"
				aria-label="Ship mass hot, in kt"
				bind:value={hot}
				data-testid="rolling-hot"
			/>
			<span>kt hot.</span>
		</div>
	</Dialog.Content>
</Dialog.Root>
