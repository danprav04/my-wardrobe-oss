<script lang="ts">
	import './layout.css';
	import { page, navigating } from '$app/state';
	import { onMount } from 'svelte';
	import { AppLogo } from '$lib';
	import { 
		Shirt, 
		PlusCircle, 
		Layers, 
		Sparkles, 
		Settings, 
		FolderHeart,
		Cpu,
		Cloud,
		Zap,
		Loader2,
		X,
		CheckCircle2,
		AlertTriangle,
		LogOut
	} from '@lucide/svelte';

	let { children } = $props();

	let isLoginPage = $derived(page.url.pathname === '/login');

	let localStatus = $state<{
		available: boolean;
		gpu?: string;
		vramTotalMb?: number;
		vramFreeMb?: number;
		latencyMs: number;
		url: string;
		error?: string;
	} | null>(null);

	let isTesting = $state(false);
	let showModal = $state(false);

	const navItems = [
		{ href: '/', label: 'Wardrobe', icon: Shirt },
		{ href: '/outfit/builder', label: 'Build Fit', icon: Sparkles },
		{ href: '/outfit', label: 'Outfits', icon: FolderHeart },
		{ href: '/garment/add', label: 'Add Item', icon: PlusCircle },
		{ href: '/settings', label: 'Settings', icon: Settings }
	];

	async function fetchStatus() {
		try {
			const res = await fetch('/api/local-ai/status');
			if (res.ok) {
				localStatus = await res.json();
			}
		} catch {
			localStatus = { available: false, latencyMs: 0, url: '' };
		}
	}

	async function triggerTest() {
		isTesting = true;
		try {
			const res = await fetch('/api/local-ai/status', { method: 'POST', body: JSON.stringify({}) });
			if (res.ok) {
				localStatus = await res.json();
			}
		} catch (e: any) {
			localStatus = { available: false, latencyMs: 0, url: '', error: e.message };
		} finally {
			isTesting = false;
		}
	}

	onMount(() => {
		if (page.url.pathname === '/login') return;
		fetchStatus();
		// Periodic heartbeat check every 30 seconds
		const interval = setInterval(() => {
			if (page.url.pathname !== '/login') {
				fetchStatus();
			}
		}, 30000);
		return () => clearInterval(interval);
	});
</script>

<svelte:head>
	<title>My Wardrobe</title>
	<meta name="theme-color" content="#09090b" />
</svelte:head>

{#if isLoginPage}
	<div class="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
		{@render children()}
	</div>
{:else}
	<div class="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white pb-20 md:pb-0">
		<!-- Global Navigation Loading Bar -->
		{#if navigating.to}
			<div class="fixed top-0 left-0 right-0 z-50 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-400 animate-pulse shadow-sm shadow-indigo-500/50"></div>
		{/if}

		<!-- Desktop & Tablet Header -->
		<header class="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
			<div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
				<AppLogo href="/" withText size={36} class="shadow-lg shadow-indigo-500/25" />

				<!-- Desktop Nav -->
				<nav class="hidden md:flex items-center gap-1">
					{#each navItems as item}
						{@const active = page.url.pathname === item.href || (item.href !== '/' && page.url.pathname.startsWith(item.href))}
						{@const isTarget = navigating.to?.url.pathname === item.href}
						<a
							href={item.href}
							class="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all {active
								? 'bg-zinc-800 text-zinc-100 shadow-sm'
								: 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'}"
						>
							{#if isTarget}
								<Loader2 class="w-4 h-4 animate-spin text-indigo-400" />
							{:else}
								<item.icon class="w-4 h-4 {active ? 'text-indigo-400' : ''}" />
							{/if}
							<span>{item.label}</span>
						</a>
					{/each}
				</nav>

				<!-- Engine Indicator & Quick Actions -->
				<div class="flex items-center gap-2 sm:gap-2.5">
					<!-- Live AI Status Indicator Pill -->
					<button
						type="button"
						onclick={() => (showModal = true)}
						title="Click to inspect AI Engine & GPU Status"
						class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition border backdrop-blur-sm cursor-pointer {localStatus?.available
							? 'bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border-emerald-700/60'
							: 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 border-zinc-800'}"
					>
						{#if localStatus?.available}
							<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
							<Cpu class="w-3.5 h-3.5 text-emerald-400" />
							<span class="hidden sm:inline">Local AI</span>
							<span class="text-[10px] text-emerald-400/80 font-mono">({localStatus.latencyMs}ms)</span>
						{:else}
							<span class="w-2 h-2 rounded-full bg-zinc-600"></span>
							<Cloud class="w-3.5 h-3.5 text-zinc-400" />
							<span class="hidden sm:inline">Cloud AI</span>
						{/if}
					</button>

					<!-- Quick Add Action -->
					<a
						href="/garment/add"
						class="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm shadow-indigo-600/30 shrink-0"
					>
						<PlusCircle class="w-4 h-4" />
						<span>Add Clothes</span>
					</a>

					<!-- Logout Action Button -->
					<a
						href="/logout"
						title="Log Out"
						class="inline-flex items-center justify-center p-2 rounded-xl text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10 border border-zinc-800 transition shrink-0"
						aria-label="Log Out"
					>
						<LogOut class="w-4 h-4" />
					</a>
				</div>
			</div>
		</header>

		<!-- Main Content Area -->
		<main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
			{@render children()}
		</main>

		<!-- Mobile Bottom Navigation Bar -->
		<nav class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-lg border-t border-zinc-800/80 px-2 py-1.5 flex justify-around items-center">
			{#each navItems as item}
				{@const active = page.url.pathname === item.href || (item.href !== '/' && page.url.pathname.startsWith(item.href))}
				{@const isTarget = navigating.to?.url.pathname === item.href}
				<a
					href={item.href}
					class="flex flex-col items-center gap-1 py-1.5 px-3 rounded-lg text-[11px] font-medium transition-all {active
						? 'text-indigo-400 font-semibold'
						: 'text-zinc-400 hover:text-zinc-200'}"
				>
					{#if isTarget}
						<Loader2 class="w-5 h-5 animate-spin text-indigo-400" />
					{:else}
						<item.icon class="w-5 h-5 {active ? 'text-indigo-400' : 'text-zinc-400'}" />
					{/if}
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>
	</div>

	<!-- AI Engine Status Modal -->
	{#if showModal}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
			<div class="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
				<div class="flex items-center justify-between pb-3 border-b border-zinc-800">
					<div class="flex items-center gap-2.5">
						<div class="w-8 h-8 rounded-lg {localStatus?.available ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'} flex items-center justify-center">
							{#if localStatus?.available}
								<Cpu class="w-4 h-4" />
							{:else}
								<Cloud class="w-4 h-4" />
							{/if}
						</div>
						<h3 class="font-bold text-base text-white">AI Engine Status</h3>
					</div>
					<button
						type="button"
						onclick={() => (showModal = false)}
						class="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
					>
						<X class="w-4 h-4" />
					</button>
				</div>

				<!-- Status Info -->
				<div class="space-y-3">
					{#if localStatus?.available}
						<div class="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/40 space-y-2">
							<div class="flex items-center justify-between text-xs">
								<span class="text-zinc-400">Current Provider:</span>
								<span class="font-bold text-emerald-300">Local Docker AI</span>
							</div>
							<div class="flex items-center justify-between text-xs">
								<span class="text-zinc-400">Device Hardware:</span>
								<span class="font-semibold text-zinc-200">{localStatus.gpu || 'NVIDIA RTX'}</span>
							</div>
							<div class="flex items-center justify-between text-xs">
								<span class="text-zinc-400">Response Latency:</span>
								<span class="font-mono text-emerald-400">{localStatus.latencyMs} ms</span>
							</div>
							<div class="flex items-center justify-between text-xs">
								<span class="text-zinc-400">Endpoint:</span>
								<span class="font-mono text-zinc-300 text-[11px]">{localStatus.url}</span>
							</div>
						</div>
						<p class="text-xs text-zinc-400 leading-relaxed">
							All vision detection, auto-tagging, and outfit stylist suggestions run accelerated on your local GPU with zero API charges or quota limits.
						</p>
					{:else}
						<div class="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
							<div class="flex items-center justify-between text-xs">
								<span class="text-zinc-400">Current Provider:</span>
								<span class="font-bold text-zinc-200">Cloud AI Fallback</span>
							</div>
							<div class="flex items-center justify-between text-xs">
								<span class="text-zinc-400">Vision & Tagging:</span>
								<span class="text-zinc-300">Google Gemini 3.5 Flash-Lite</span>
							</div>
							<div class="flex items-center justify-between text-xs">
								<span class="text-zinc-400">Retail Flat-Lays:</span>
								<span class="text-zinc-300">Pollinations.ai FLUX</span>
							</div>
						</div>
						<p class="text-xs text-zinc-400 leading-relaxed">
							Local AI is currently offline. The application seamlessly handles all features using free cloud models so your workflow is never interrupted.
						</p>
					{/if}
				</div>

				<!-- Actions -->
				<div class="flex items-center justify-between gap-3 pt-2">
					<a
						href="/settings"
						onclick={() => (showModal = false)}
						class="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
					>
						Configure in Settings
					</a>

					<button
						type="button"
						onclick={triggerTest}
						disabled={isTesting}
						class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
					>
						{#if isTesting}
							<Loader2 class="w-3.5 h-3.5 animate-spin" />
							<span>Pinging...</span>
						{:else}
							<Zap class="w-3.5 h-3.5 text-amber-300" />
							<span>Test Connection</span>
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}
