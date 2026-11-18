<script lang="ts">
	// The rolling cheat sheet: for a mass of wormhole, what to put through first, and what
	// the hole's answer to "is it reduced?" then calls for. Worked out for the ship typed in
	// rather than printed for one battleship, so it covers every hole the catalog knows and
	// whatever is being rolled with.
	//
	// One mass at a time, picked from the tabs or found by a hole's code. The plan is a
	// first set of jumps and then a small table: the hole's answer down the side, what you
	// want from it across the top. Holes of one mass roll alike whatever their jump limit,
	// as long as the ship fits, so a tab is a total mass and not a hole type.
	import * as v from 'valibot';
	import FlameIcon from '@lucide/svelte/icons/flame';
	import SearchIcon from '@lucide/svelte/icons/search';
	import SnowflakeIcon from '@lucide/svelte/icons/snowflake';
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
		type RollPlan,
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

	interface Section {
		plan: RollPlan | null;
		/** The holes that roll this way, by the jump limit they are listed under. */
		limits: { maxJump: number | null; codes: string[] }[];
	}
	/** The classes of one total mass, with those that get the same plan folded together. */
	const groups = $derived.by(() => {
		const byMass = new Map<number, Map<string, Section>>();
		for (const c of classes) {
			const plan = ship ? rollPlan(c.totalMass, c.maxJump, ship) : null;
			const sections = byMass.get(c.totalMass) ?? new Map<string, Section>();
			byMass.set(c.totalMass, sections);
			const key = JSON.stringify(plan);
			const section = sections.get(key) ?? { plan, limits: [] };
			sections.set(key, section);
			section.limits.push({ maxJump: c.maxJump, codes: c.codes });
		}
		const masses = [...byMass].map(([totalMass, sections]) => {
			const all = [...sections.values()];
			return {
				totalMass,
				// What there is a plan for comes first; what the ship does not fit through, last.
				sections: [...all.filter((x) => x.plan), ...all.filter((x) => !x.plan)],
				rollable: all.some((x) => x.plan),
				codes: all.flatMap((x) => x.limits.flatMap((l) => l.codes)),
			};
		});
		// The masses there is a plan for first, lightest to heaviest; the rest after them.
		return [...masses.filter((g) => g.rollable), ...masses.filter((g) => !g.rollable)];
	});

	const wanted = $derived(find.trim().toUpperCase());
	const hit = (code: string) => wanted !== '' && code.includes(wanted);
	/** The tab picked by hand; a search goes to the first mass with such a hole. */
	let picked = $state<number | null>(null);
	const selected = $derived(
		(wanted !== '' ? groups.find((g) => g.codes.some(hit)) : undefined) ??
			groups.find((g) => g.totalMass === picked) ??
			groups.find((g) => g.rollable) ??
			groups[0] ??
			null,
	);
	/** A search shows the plan of the hole it found, not its neighbours of the same mass. */
	const sections = $derived(
		(selected?.sections ?? []).filter(
			(section) => wanted === '' || section.limits.some((l) => l.codes.some(hit)),
		),
	);
	const nothingFound = $derived(wanted !== '' && !groups.some((g) => g.codes.some(hit)));
</script>

<!-- The same two marks wherever a jump is named: a snowflake for cold, a flame for hot. -->
{#snippet jumps(j: Jumps, size: 'lg' | 'md')}
	{@const pill = cn(
		'inline-flex items-center border border-border bg-background font-medium text-foreground tabular-nums',
		size === 'lg' ? 'gap-2 px-3 py-1.5 text-lg' : 'gap-1.5 px-2 py-1 text-sm',
	)}
	{@const mark = cn('text-muted-foreground', size === 'lg' ? 'size-4' : 'size-3.5')}
	<span class="flex flex-wrap items-center gap-1.5">
		{#if j.cold + j.hot === 0}
			<span class="text-sm text-muted-foreground">No more jumps</span>
		{/if}
		{#if j.cold > 0}
			<span class={pill}><SnowflakeIcon class={mark} />{j.cold} cold</span>
		{/if}
		{#if j.hot > 0}
			<span class={pill}><FlameIcon class={mark} />{j.hot} hot</span>
		{/if}
	</span>
{/snippet}

{#snippet goal(s: RollSteps, kind: 'roll' | 'crit', testid: string)}
	{@const idle = s.jumps.cold + s.jumps.hot === 0}
	<div class="flex flex-col gap-1.5 border-l border-border px-4 py-3" data-testid={testid}>
		{@render jumps(s.jumps, 'md')}
		{#if s.last}
			<span class="text-muted-foreground">Fly the last jump home {s.last}.</span>
		{/if}
		{#if kind === 'roll' && !s.certain}
			<span class="flex items-start gap-1.5 text-amber-600 dark:text-amber-500">
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

{#snippet answer(title: string, hint: string, dot: string, b: RollBranch | null, testid: string)}
	<div class="col-span-full grid grid-cols-subgrid border-t border-border" data-testid={testid}>
		<div class="flex flex-col justify-center gap-0.5 px-4 py-3">
			<span class="flex items-center gap-2 text-sm font-medium text-foreground">
				<span class={cn('size-2 rounded-full', dot)}></span>
				{title}
			</span>
			<span class="pl-4 text-muted-foreground">{hint}</span>
		</div>
		{#if b}
			{@render goal(b.roll, 'roll', `${testid}-roll`)}
			{@render goal(b.crit, 'crit', `${testid}-crit`)}
		{:else}
			<p class="col-span-2 border-l border-border px-4 py-3 text-muted-foreground">
				It cannot be, after those jumps.
			</p>
		{/if}
	</div>
{/snippet}

{#snippet holes(section: Section)}
	<div class="flex flex-col gap-1">
		{#each section.limits as limit (limit.maxJump)}
			<p class="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
				<span class="mr-1 text-muted-foreground tabular-nums">
					{limit.maxJump === null ? 'Any size' : `${formatKt(limit.maxJump)} kt a jump`}
				</span>
				{#each limit.codes as code (code)}
					<span
						class={cn(
							'font-mono text-[11px]',
							hit(code) ? 'bg-foreground px-1 text-background' : 'text-foreground/80',
						)}
					>
						{code}
					</span>
				{/each}
			</p>
		{/each}
	</div>
{/snippet}

{#snippet stepTitle(n: number, title: string)}
	<div class="flex items-center gap-2.5">
		<span
			class="flex size-5 items-center justify-center bg-foreground font-mono text-[11px] text-background"
		>
			{n}
		</span>
		<span class="text-sm font-medium text-foreground">{title}</span>
	</div>
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content
		class="grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-5xl"
		data-testid="rolling-dialog"
	>
		<Dialog.Header class="px-6 pt-5 pb-4">
			<Dialog.Title class="font-heading text-xl">Rolling cheat sheet</Dialog.Title>
			<Dialog.Description class="text-sm">
				For a hole nothing has gone through yet. Every set of jumps ends with you at home.
			</Dialog.Description>
		</Dialog.Header>

		<!-- Which hole: its mass, or its code. -->
		<div class="flex items-end justify-between gap-4 border-b border-border px-6">
			<div class="flex flex-wrap" role="tablist" data-testid="rolling-masses">
				{#each groups as group (group.totalMass)}
					{@const on = group.totalMass === selected?.totalMass}
					<button
						type="button"
						role="tab"
						aria-selected={on}
						class={cn(
							'-mb-px border-b-2 px-3 py-2 text-sm tabular-nums transition-colors',
							on
								? 'border-foreground font-medium text-foreground'
								: 'border-transparent text-muted-foreground hover:text-foreground',
							!group.rollable && !on && 'text-muted-foreground/50',
						)}
						onclick={() => {
							picked = group.totalMass;
							find = '';
						}}
					>
						{formatKt(group.totalMass)} kt
					</button>
				{/each}
			</div>
			<div class="relative mb-2 shrink-0">
				<SearchIcon
					class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					class="h-8 w-44 pl-8 uppercase placeholder:normal-case"
					placeholder="Find a hole, e.g. H296"
					bind:value={find}
					data-testid="rolling-find"
				/>
			</div>
		</div>

		<div class="h-[34rem] max-h-[70vh] overflow-y-auto px-6 py-6">
			{#if !ship}
				<p class="text-destructive">
					Give the ship's cold and hot mass below, the hot one no lighter than the cold one.
				</p>
			{:else if nothingFound}
				<p class="text-muted-foreground" data-testid="rolling-none">No hole called that.</p>
			{:else if selected}
				<div class="flex flex-col gap-8" data-testid="rolling-class">
					{#each sections as section, index (index)}
						{#if section.plan}
							{@const plan = section.plan}
							<section class="flex flex-col gap-5" data-testid="rolling-plan">
								<div class="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
									<div class="flex flex-col gap-1">
										<h3 class="font-heading text-3xl leading-none text-foreground tabular-nums">
											{formatKt(selected.totalMass)} kt
										</h3>
										<span class="text-muted-foreground">
											somewhere between {formatKt(selected.totalMass * 0.9)} and
											{formatKt(selected.totalMass * 1.1)}
										</span>
									</div>
									{@render holes(section)}
								</div>

								<div class="flex flex-col gap-2.5 bg-muted/40 p-4">
									{@render stepTitle(1, 'Put this through')}
									<div class="pl-7.5" data-testid="rolling-first">
										{@render jumps(plan.first, 'lg')}
									</div>
									{#if plan.away}
										<p class="flex items-center gap-1.5 pl-7.5 text-muted-foreground">
											<Undo2Icon class="size-3.5 shrink-0" />
											That leaves you on the far side. The jumps below start with the way home.
										</p>
									{/if}
								</div>

								<div class="flex flex-col gap-2.5 bg-muted/40 p-4">
									{@render stepTitle(2, 'Look at the hole. Is it reduced?')}
									<div
										class="ml-7.5 grid grid-cols-[13rem_minmax(0,1fr)_minmax(0,1fr)] border border-border bg-background"
									>
										<div class="col-span-full grid grid-cols-subgrid">
											<span></span>
											<span
												class="border-l border-border px-4 py-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
											>
												To roll it
											</span>
											<span
												class="border-l border-border px-4 py-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
											>
												To crit it
											</span>
										</div>
										{@render answer(
											'Reduced',
											'It is on the small side',
											'bg-orange-500',
											plan.reduced,
											'rolling-reduced',
										)}
										{@render answer(
											'Not reduced',
											'It is on the big side',
											'bg-muted-foreground/40',
											plan.fresh,
											'rolling-fresh',
										)}
									</div>
								</div>
							</section>
						{:else}
							<section
								class="flex flex-col gap-2 border-t border-border pt-4 first:border-t-0 first:pt-0"
								data-testid="rolling-too-small"
							>
								{#if index === 0}
									<h3 class="font-heading text-3xl leading-none text-foreground tabular-nums">
										{formatKt(selected.totalMass)} kt
									</h3>
								{/if}
								<span class="text-sm font-medium text-foreground">Too small for this ship</span>
								{@render holes(section)}
							</section>
						{/if}
					{/each}
				</div>
			{/if}
		</div>

		<div
			class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-muted/40 px-6 py-3 text-muted-foreground"
		>
			<span class="text-sm font-medium text-foreground">Your rolling ship</span>
			<label class="flex items-center gap-1.5">
				<SnowflakeIcon class="size-3.5" />
				<span>Cold</span>
				<Input
					class="h-7 w-20 bg-background text-center text-foreground tabular-nums"
					inputmode="numeric"
					aria-label="Ship mass cold, in kt"
					bind:value={cold}
					data-testid="rolling-cold"
				/>
			</label>
			<label class="flex items-center gap-1.5">
				<FlameIcon class="size-3.5" />
				<span>Hot</span>
				<Input
					class="h-7 w-20 bg-background text-center text-foreground tabular-nums"
					inputmode="numeric"
					aria-label="Ship mass hot, in kt"
					bind:value={hot}
					data-testid="rolling-hot"
				/>
			</label>
			<span>in kt, with the propulsion module off and on</span>
		</div>
	</Dialog.Content>
</Dialog.Root>
