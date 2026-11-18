<script lang="ts">
	// The rolling cheat sheet: for a mass of wormhole, what to put through first, and what
	// the hole's answer to "is it reduced?" then calls for. Worked out for the ship typed in
	// rather than printed for one battleship, so it covers every hole the catalog knows and
	// whatever is being rolled with.
	//
	// One hole at a time: the masses are a list to pick from, and the plan beside it is the
	// only thing to read. Sixteen plans on one page is a wall nobody rolls a hole from.
	import * as v from 'valibot';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import FlameIcon from '@lucide/svelte/icons/flame';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
	import SearchIcon from '@lucide/svelte/icons/search';
	import SnowflakeIcon from '@lucide/svelte/icons/snowflake';
	import TrendingDownIcon from '@lucide/svelte/icons/trending-down';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import Undo2Icon from '@lucide/svelte/icons/undo-2';

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

	// A colour per mass, after the chart this grew out of: blue for the 1,000s, green for
	// the 2,000s, yellow and orange above. It is how a roller finds their hole at a glance,
	// which is the one place the sheet uses colour for something other than a status.
	const TONES = {
		slate: {
			dot: 'bg-slate-400',
			tint: 'bg-slate-400/10',
			edge: 'border-slate-400/25',
			text: 'text-slate-500 dark:text-slate-300',
		},
		cyan: {
			dot: 'bg-cyan-500',
			tint: 'bg-cyan-500/10',
			edge: 'border-cyan-500/25',
			text: 'text-cyan-600 dark:text-cyan-400',
		},
		sky: {
			dot: 'bg-sky-500',
			tint: 'bg-sky-500/10',
			edge: 'border-sky-500/25',
			text: 'text-sky-600 dark:text-sky-400',
		},
		emerald: {
			dot: 'bg-emerald-500',
			tint: 'bg-emerald-500/10',
			edge: 'border-emerald-500/25',
			text: 'text-emerald-600 dark:text-emerald-400',
		},
		amber: {
			dot: 'bg-amber-500',
			tint: 'bg-amber-500/10',
			edge: 'border-amber-500/25',
			text: 'text-amber-600 dark:text-amber-400',
		},
		orange: {
			dot: 'bg-orange-500',
			tint: 'bg-orange-500/10',
			edge: 'border-orange-500/25',
			text: 'text-orange-600 dark:text-orange-400',
		},
		rose: {
			dot: 'bg-rose-500',
			tint: 'bg-rose-500/10',
			edge: 'border-rose-500/25',
			text: 'text-rose-600 dark:text-rose-400',
		},
	};
	function tone(totalMass: number) {
		const kt = totalMass / KG_PER_KT;
		if (kt < 750) return TONES.slate;
		if (kt < 1000) return TONES.cyan;
		if (kt < 2000) return TONES.sky;
		if (kt < 3000) return TONES.emerald;
		if (kt < 3300) return TONES.amber;
		if (kt < 5000) return TONES.orange;
		return TONES.rose;
	}
</script>

<!-- Cold and hot are the two things a roller counts, so each has a colour and a mark of
     its own, the same wherever a jump is named. -->
{#snippet jumps(j: Jumps, size: 'lg' | 'md')}
	{@const pill = cn(
		'inline-flex items-center rounded-md font-medium tabular-nums',
		size === 'lg' ? 'gap-1.5 px-3 py-1.5 text-lg' : 'gap-1 px-2 py-1 text-sm',
	)}
	{@const mark = size === 'lg' ? 'size-4' : 'size-3.5'}
	<span class="flex flex-wrap items-center gap-1.5">
		{#if j.cold + j.hot === 0}
			<span class={cn(pill, 'bg-muted text-muted-foreground')}>No more jumps</span>
		{/if}
		{#if j.cold > 0}
			<span class={cn(pill, 'bg-sky-500/10 text-sky-600 dark:text-sky-400')}>
				<SnowflakeIcon class={mark} />
				{j.cold} cold
			</span>
		{/if}
		{#if j.hot > 0}
			<span class={cn(pill, 'bg-orange-500/10 text-orange-600 dark:text-orange-400')}>
				<FlameIcon class={mark} />
				{j.hot} hot
			</span>
		{/if}
	</span>
{/snippet}

{#snippet goal(label: string, Icon: typeof FlameIcon, s: RollSteps, kind: 'roll' | 'crit')}
	{@const idle = s.jumps.cold + s.jumps.hot === 0}
	<div class="flex flex-col gap-1.5 p-3">
		<span
			class="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
		>
			<Icon class="size-3.5" />
			{label}
		</span>
		{@render jumps(s.jumps, 'md')}
		{#if s.last}
			<span class="text-muted-foreground">Fly the last jump home {s.last}.</span>
		{/if}
		{#if kind === 'roll' && !s.certain}
			<span
				class="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-amber-600 dark:text-amber-400"
			>
				<TriangleAlertIcon class="mt-0.5 size-3.5 shrink-0" />
				<span>
					{#if idle}
						Nothing more is safe. Close it with a light ship.
					{:else if s.critical}
						It can stay open, critical. Close it with a light ship.
					{:else}
						It can stay open. Check it, then close it with a light ship.
					{/if}
				</span>
			</span>
		{:else if kind === 'crit' && !s.certain}
			<span class="text-muted-foreground">
				{idle ? 'Any more could close it.' : 'As far as is safe; it may not show critical yet.'}
			</span>
		{/if}
	</div>
{/snippet}

{#snippet answer(
	title: string,
	hint: string,
	Icon: typeof FlameIcon,
	colors: { head: string; edge: string },
	b: RollBranch | null,
	testid: string,
)}
	<div
		class={cn('flex flex-col overflow-hidden rounded-lg border bg-background', colors.edge)}
		data-testid={testid}
	>
		<div class={cn('flex items-center gap-2 px-3 py-2', colors.head)}>
			<Icon class="size-4 shrink-0" />
			<div class="flex flex-col leading-tight">
				<span class="text-sm font-semibold">{title}</span>
				<span class="text-[11px] opacity-80">{hint}</span>
			</div>
		</div>
		{#if b}
			<div class="divide-y divide-border/60">
				{@render goal('To roll it', RefreshCwIcon, b.roll, 'roll')}
				{@render goal('To crit it', TriangleAlertIcon, b.crit, 'crit')}
			</div>
		{:else}
			<p class="p-3 text-muted-foreground">It cannot be, after those jumps.</p>
		{/if}
	</div>
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content
		class="grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-4xl"
		data-testid="rolling-dialog"
	>
		<Dialog.Header class="flex-row items-center gap-3 border-b border-border px-5 py-4">
			<span
				class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
			>
				<ScrollTextIcon class="size-5" />
			</span>
			<div class="flex flex-col gap-0.5">
				<Dialog.Title class="font-heading text-lg leading-none">Rolling cheat sheet</Dialog.Title>
				<Dialog.Description class="text-xs">
					For a hole nothing has gone through yet. Every set of jumps ends with you at home.
				</Dialog.Description>
			</div>
		</Dialog.Header>

		<div class="grid h-[38rem] max-h-[75vh] grid-cols-[15rem_minmax(0,1fr)]">
			<!-- Which hole: by mass, or by typing its code. -->
			<div class="flex min-h-0 flex-col border-r border-border bg-muted/30">
				<div class="relative p-3">
					<SearchIcon
						class="pointer-events-none absolute top-1/2 left-5.5 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						class="h-8 bg-background pl-8 uppercase placeholder:normal-case"
						placeholder="Find a hole, e.g. H296"
						bind:value={find}
						data-testid="rolling-find"
					/>
				</div>
				<div
					class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2"
					data-testid="rolling-masses"
				>
					{#each matches as row (row.key)}
						{@const colors = tone(row.totalMass)}
						{@const on = row.key === selected?.key}
						{#if row.key === firstTooSmall}
							<div
								class="px-2 pt-3 pb-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase"
							>
								Too small for this ship
							</div>
						{/if}
						<button
							type="button"
							class={cn(
								'flex w-full items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left transition-colors',
								on ? cn(colors.tint, colors.edge) : 'border-transparent hover:bg-accent/60',
								row.plan === null && 'opacity-50',
							)}
							aria-pressed={on}
							onclick={() => (picked = row.key)}
						>
							<span class={cn('size-2.5 shrink-0 rounded-full', colors.dot)}></span>
							<span class="flex min-w-0 flex-col leading-tight">
								<span class="text-sm font-medium text-foreground tabular-nums">
									{formatKt(row.totalMass)} kt
								</span>
								<span class="text-[11px] text-muted-foreground tabular-nums">
									{row.maxJump === null ? '' : `${formatKt(row.maxJump)} kt a jump · `}{row.codes
										.length}
									{row.codes.length === 1 ? 'hole' : 'holes'}
								</span>
							</span>
						</button>
					{:else}
						<p class="px-2 py-2 text-muted-foreground">
							{catalog ? 'No hole called that.' : 'Loading…'}
						</p>
					{/each}
				</div>
			</div>

			<!-- The one plan. -->
			<div class="min-h-0 overflow-y-auto p-5">
				{#if !ship}
					<p class="rounded-md bg-destructive/10 px-3 py-2 text-destructive">
						Give the ship's cold and hot mass below, the hot one no lighter than the cold one.
					</p>
				{:else if selected}
					{@const colors = tone(selected.totalMass)}
					<div class="flex flex-col gap-5" data-testid="rolling-class">
						<div class={cn('flex flex-col gap-2 rounded-lg border p-4', colors.tint, colors.edge)}>
							<div class="flex items-baseline justify-between gap-3">
								<h3 class={cn('font-heading text-2xl leading-none tabular-nums', colors.text)}>
									{formatKt(selected.totalMass)} kt
								</h3>
								{#if selected.maxJump !== null}
									<span class="text-foreground/70 tabular-nums">
										up to {formatKt(selected.maxJump)} kt a jump
									</span>
								{/if}
							</div>
							<p class="flex flex-wrap gap-1">
								{#each selected.codes as code (code)}
									<span
										class={cn(
											'rounded px-1.5 py-0.5 font-mono text-[11px]',
											wanted !== '' && code.includes(wanted)
												? cn(colors.dot, 'text-white')
												: 'bg-background/70 text-muted-foreground',
										)}
									>
										{code}
									</span>
								{/each}
							</p>
						</div>

						{#if selected.plan}
							{@const plan = selected.plan}
							<ol class="relative flex flex-col gap-5">
								<!-- The line the two steps hang on. -->
								<span class="absolute top-3 bottom-3 left-3 w-px bg-border"></span>
								<li class="relative flex gap-3">
									<span
										class={cn(
											'z-10 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
											colors.dot,
										)}
									>
										1
									</span>
									<div class="flex min-w-0 flex-1 flex-col gap-2">
										<span class="pt-0.5 text-sm font-semibold text-foreground">
											Put this through
										</span>
										<div data-testid="rolling-first">
											{@render jumps(plan.first, 'lg')}
										</div>
										{#if plan.away}
											<p class="flex items-center gap-1.5 text-muted-foreground">
												<Undo2Icon class="size-3.5 shrink-0" />
												That leaves you on the far side. The jumps below start with the way home.
											</p>
										{/if}
									</div>
								</li>
								<li class="relative flex gap-3">
									<span
										class={cn(
											'z-10 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
											colors.dot,
										)}
									>
										2
									</span>
									<div class="flex min-w-0 flex-1 flex-col gap-2">
										<span class="pt-0.5 text-sm font-semibold text-foreground">
											Look at the hole. Is it reduced?
										</span>
										<div class="grid grid-cols-2 gap-3">
											{@render answer(
												'Reduced',
												'It is on the small side',
												TrendingDownIcon,
												{
													head: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
													edge: 'border-orange-500/25',
												},
												plan.reduced,
												'rolling-reduced',
											)}
											{@render answer(
												'Not reduced',
												'It is on the big side',
												CircleCheckIcon,
												{
													head: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
													edge: 'border-emerald-500/25',
												},
												plan.fresh,
												'rolling-fresh',
											)}
										</div>
									</div>
								</li>
							</ol>
						{:else}
							<p
								class="rounded-md bg-muted px-3 py-2 text-muted-foreground"
								data-testid="rolling-too-small"
							>
								Too small for this ship: it lets {formatKt(selected.maxJump ?? 0)} kt through at a time.
							</p>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<div
			class="flex flex-wrap items-center gap-3 border-t border-border bg-muted/40 px-5 py-3 text-muted-foreground"
		>
			<span class="text-xs font-medium text-foreground">Your rolling ship</span>
			<label
				class="flex items-center gap-1.5 rounded-md bg-sky-500/10 py-1 pr-1 pl-2 text-sky-600 dark:text-sky-400"
			>
				<SnowflakeIcon class="size-3.5" />
				<span>Cold</span>
				<Input
					class="h-6 w-16 bg-background text-center text-foreground tabular-nums"
					inputmode="numeric"
					aria-label="Ship mass cold, in kt"
					bind:value={cold}
					data-testid="rolling-cold"
				/>
			</label>
			<label
				class="flex items-center gap-1.5 rounded-md bg-orange-500/10 py-1 pr-1 pl-2 text-orange-600 dark:text-orange-400"
			>
				<FlameIcon class="size-3.5" />
				<span>Hot</span>
				<Input
					class="h-6 w-16 bg-background text-center text-foreground tabular-nums"
					inputmode="numeric"
					aria-label="Ship mass hot, in kt"
					bind:value={hot}
					data-testid="rolling-hot"
				/>
			</label>
			<span>in kt, propulsion module off and on</span>
		</div>
	</Dialog.Content>
</Dialog.Root>
