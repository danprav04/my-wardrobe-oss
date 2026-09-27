<script lang="ts">
	import { 
		User, 
		Upload, 
		CheckCircle2, 
		AlertTriangle, 
		Sparkles, 
		Server, 
		Database, 
		Cloud, 
		HardDrive,
		Loader2,
		Cpu,
		RefreshCw,
		Zap,
		Check,
		X,
		Key,
		Sliders
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { AppLogo } from '$lib';

	let { data } = $props();

	let portraitInput = $state<HTMLInputElement | null>(null);
	let isUploadingPortrait = $state(false);
	let currentPortraitUrl = $state<string | null>(null);
	let uploadMessage = $state<string | null>(null);

	// Engine selection state
	let selectedEngine = $state<'puter' | 'local' | 'cloud'>(data.activeEngine || 'puter');
	let isSavingEngine = $state(false);
	let engineSaveMessage = $state<string | null>(null);

	// Puter & AI Studio status state
	let isTestingPuter = $state(false);
	let puterTestResult = $state<any>(data.puterStatus || null);

	// Local AI settings state
	let localAiUrl = $state(data.localAiUrl || 'http://localhost:8000');
	let preferLocal = $state(data.preferLocalAi ?? false);
	let isTestingLocalAi = $state(false);
	let testResult = $state<any>(data.localAiHealth || null);
	let isSavingConfig = $state(false);
	let configMessage = $state<string | null>(null);

	// Body Proportions & Fit Preferences state
	let userHeight = $state(data.height || '');
	let userBodyType = $state(data.bodyType || '');
	let userFitPreference = $state(data.fitPreference || '');
	let isSavingBodyProfile = $state(false);
	let bodyProfileMessage = $state<string | null>(null);

	async function handleSaveBodyProfile() {
		isSavingBodyProfile = true;
		bodyProfileMessage = null;
		try {
			const res = await fetch('/api/profile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					height: userHeight.trim(),
					bodyType: userBodyType.trim(),
					fitPreference: userFitPreference.trim()
				})
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || 'Failed to update body profile');
			}
			bodyProfileMessage = 'Body profile updated successfully!';
			await invalidateAll();
		} catch (err: any) {
			alert('Failed to save body profile: ' + err.message);
		} finally {
			isSavingBodyProfile = false;
		}
	}

	$effect(() => {
		if (data.portraitUrl && !currentPortraitUrl) {
			currentPortraitUrl = data.portraitUrl;
		}
	});

	onMount(() => {
		// Run health checks asynchronously in the background so page navigation is instantaneous (<50ms)
		handleTestLocalAiConnection();
		if (data.hasPuterToken) {
			handleTestPuterConnection();
		}
	});

	async function handlePortraitChange(e: Event) {
		const target = e.target as HTMLInputElement;
		if (!target.files || target.files.length === 0) return;

		const file = target.files[0];
		isUploadingPortrait = true;
		uploadMessage = null;

		try {
			const formData = new FormData();
			formData.append('portrait', file);

			const res = await fetch('/api/profile', {
				method: 'POST',
				body: formData
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Failed to upload portrait');
			}

			const result = await res.json();
			currentPortraitUrl = result.portraitUrl;
			uploadMessage = 'Portrait updated successfully!';
		} catch (err: any) {
			alert('Portrait upload failed: ' + err.message);
		} finally {
			isUploadingPortrait = false;
		}
	}

	async function handleTestLocalAiConnection() {
		isTestingLocalAi = true;
		configMessage = null;

		try {
			const res = await fetch('/api/local-ai/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: localAiUrl })
			});
			const result = await res.json();
			testResult = result;
		} catch (err: any) {
			testResult = {
				available: false,
				latencyMs: 0,
				error: err.message
			};
		} finally {
			isTestingLocalAi = false;
		}
	}

	async function handleSelectEngine(engine: 'puter' | 'local' | 'cloud') {
		selectedEngine = engine;
		isSavingEngine = true;
		engineSaveMessage = null;

		try {
			const res = await fetch('/api/puter/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ engine })
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || 'Failed to update active engine');
			}

			engineSaveMessage = `Active engine set to ${engine === 'puter' ? 'Puter.js & AI Studio (Nano Banana)' : engine === 'local' ? 'Local AI (RTX ComfyUI)' : 'Community Cloud'}!`;
			await invalidateAll();
		} catch (err: any) {
			alert('Failed to switch engine: ' + err.message);
		} finally {
			isSavingEngine = false;
		}
	}

	async function handleTestPuterConnection() {
		isTestingPuter = true;

		try {
			const res = await fetch('/api/puter/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			const result = await res.json();
			puterTestResult = result;
		} catch (err: any) {
			puterTestResult = {
				available: false,
				latencyMs: 0,
				model: 'gemini-3.1-flash-image-preview',
				error: err.message
			};
		} finally {
			isTestingPuter = false;
		}
	}

	async function handleSaveLocalAiConfig() {
		isSavingConfig = true;
		configMessage = null;

		try {
			const res = await fetch('/api/local-ai/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					url: localAiUrl,
					preferLocal
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || 'Failed to save configuration');
			}

			configMessage = 'Local AI settings saved successfully!';
			await invalidateAll();
			// Also re-run test with saved config
			await handleTestLocalAiConnection();
		} catch (err: any) {
			alert('Error saving Local AI settings: ' + err.message);
		} finally {
			isSavingConfig = false;
		}
	}
</script>

<div class="max-w-4xl mx-auto space-y-8">
	<!-- Header -->
	<div>
		<h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Settings & Engine Control</h1>
		<p class="text-sm text-zinc-400 mt-1">
			Configure your AI generation engines, manage try-on portrait photos, and view real-time provider statuses.
		</p>
	</div>

	<!-- Section 0: Primary AI Generation Engine Selector -->
	<div class="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
		<div class="flex items-center justify-between pb-4 border-b border-zinc-800 flex-wrap gap-4">
			<div class="flex items-center gap-3">
				<div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
					<Sparkles class="w-5 h-5" />
				</div>
				<div>
					<h2 class="text-lg font-bold text-white flex items-center gap-2">
						<span>Active AI Generation Engine</span>
						{#if isSavingEngine}
							<span class="inline-flex items-center gap-1 text-[11px] text-zinc-400">
								<Loader2 class="w-3 h-3 animate-spin text-amber-400" /> Saving...
							</span>
						{/if}
					</h2>
					<p class="text-xs text-zinc-400">Controls which engine renders e-commerce retail flat-lays and virtual try-ons.</p>
				</div>
			</div>
		</div>

		{#if engineSaveMessage}
			<div class="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 font-semibold flex items-center gap-2">
				<CheckCircle2 class="w-4 h-4 shrink-0" />
				<span>{engineSaveMessage}</span>
			</div>
		{/if}

		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<!-- Option 1: Puter.js & AI Studio Nano Banana (Default) -->
			<button
				type="button"
				onclick={() => handleSelectEngine('puter')}
				class="text-left p-5 rounded-2xl border transition relative flex flex-col justify-between {selectedEngine === 'puter'
					? 'bg-amber-500/5 border-amber-500/40 ring-1 ring-amber-500/40'
					: 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}"
			>
				<div>
					<div class="flex items-center justify-between mb-2">
						<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
							<Sparkles class="w-3 h-3" /> Default (Cloud & AI Studio)
						</span>
						{#if selectedEngine === 'puter'}
							<div class="w-5 h-5 rounded-full bg-amber-500 text-black flex items-center justify-center">
								<Check class="w-3.5 h-3.5 stroke-[3]" />
							</div>
						{/if}
					</div>
					<h3 class="font-bold text-sm text-white">Puter.js & AI Studio (Nano Banana)</h3>
					<p class="text-xs text-zinc-400 mt-1 leading-relaxed">
						Google Gemini 3.1 Flash Image. Free Puter quota with automatic Google AI Studio API key failover. Rapid conditioning in ~4s with zero local GPU required.
					</p>
				</div>
				<div class="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
					<span>Model: gemini-3.1-flash</span>
					<span class="text-emerald-400 font-semibold">Recommended</span>
				</div>
			</button>

			<!-- Option 2: Local AI (ComfyUI RTX) -->
			<button
				type="button"
				onclick={() => handleSelectEngine('local')}
				class="text-left p-5 rounded-2xl border transition relative flex flex-col justify-between {selectedEngine === 'local'
					? 'bg-emerald-500/5 border-emerald-500/40 ring-1 ring-emerald-500/40'
					: 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}"
			>
				<div>
					<div class="flex items-center justify-between mb-2">
						<span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
							<Cpu class="w-3 h-3" /> On-Premise GPU
						</span>
						{#if selectedEngine === 'local'}
							<div class="w-5 h-5 rounded-full bg-emerald-500 text-black flex items-center justify-center">
								<Check class="w-3.5 h-3.5 stroke-[3]" />
							</div>
						{/if}
					</div>
					<h3 class="font-bold text-sm text-white">Local AI (RTX ComfyUI)</h3>
					<p class="text-xs text-zinc-400 mt-1 leading-relaxed">
						Runs locally on your host NVIDIA RTX GPU via ComfyUI. Infinite unmetered generations with complete offline privacy.
					</p>
				</div>
				<div class="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
					<span>Model: Qwen-Image-2.1 DiT</span>
					<span class="{testResult?.available ? 'text-emerald-400' : 'text-zinc-500'} font-semibold flex items-center gap-1">
						{#if isTestingLocalAi}
							<Loader2 class="w-3 h-3 animate-spin text-emerald-400" />
							<span>Checking...</span>
						{:else}
							{testResult?.available ? 'GPU Online' : 'Offline'}
						{/if}
					</span>
				</div>
			</button>

			<!-- Option 3: Public Community Cloud -->
			<button
				type="button"
				onclick={() => handleSelectEngine('cloud')}
				class="text-left p-5 rounded-2xl border transition relative flex flex-col justify-between {selectedEngine === 'cloud'
					? 'bg-blue-500/5 border-blue-500/40 ring-1 ring-blue-500/40'
					: 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}"
			>
				<div>
					<div class="flex items-center justify-between mb-2">
						<span class="inline-flex items-center gap-1 text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
							<Cloud class="w-3 h-3" /> Public Cloud
						</span>
						{#if selectedEngine === 'cloud'}
							<div class="w-5 h-5 rounded-full bg-blue-500 text-black flex items-center justify-center">
								<Check class="w-3.5 h-3.5 stroke-[3]" />
							</div>
						{/if}
					</div>
					<h3 class="font-bold text-sm text-white">Public Cloud Spaces</h3>
					<p class="text-xs text-zinc-400 mt-1 leading-relaxed">
						Hugging Face ZeroGPU Spaces (Leffa & IDM-VTON) + Pollinations.ai FLUX. Free community queues.
					</p>
				</div>
				<div class="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
					<span>HF ZeroGPU + Pollinations</span>
					<span class="text-blue-400 font-semibold">Fallback</span>
				</div>
			</button>
		</div>

		<div class="p-3.5 bg-zinc-950/70 border border-zinc-800/80 rounded-2xl flex items-center justify-between text-xs text-zinc-400 flex-wrap gap-2">
			<div class="flex items-center gap-2">
				<Sparkles class="w-4 h-4 text-amber-400 shrink-0" />
				<span>
					Garment detection & tagging are handled by <strong class="text-white">Gemini 3.5 Flash-Lite</strong> (with fallback to 3.1 Flash-Lite) from Google AI Studio.
				</span>
			</div>
			<div class="text-[11px] text-zinc-500">
				Automatic fallback active if chosen engine is offline.
			</div>
		</div>
	</div>

	<!-- Section 1: Puter.js & Google AI Studio (Nano Banana) Status -->
	<div class="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
		<div class="flex items-center justify-between pb-4 border-b border-zinc-800 flex-wrap gap-4">
			<div class="flex items-center gap-3">
				<div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
					<Key class="w-5 h-5" />
				</div>
				<div>
					<h2 class="text-lg font-bold text-white flex items-center gap-2 flex-wrap">
						<span>Puter.js & Google AI Studio Status</span>
						{#if isTestingPuter}
							<span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
								<Loader2 class="w-3 h-3 animate-spin text-amber-400" />
								<span>Testing Puter...</span>
							</span>
						{:else if puterTestResult?.available}
							<span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
								<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
								Puter Active ({puterTestResult.latencyMs}ms)
							</span>
						{:else}
							<span class="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-400 bg-zinc-800/80 px-2.5 py-0.5 rounded-full border border-zinc-700/60">
								<span class="w-2 h-2 rounded-full {data.hasPuterToken ? 'bg-amber-400' : 'bg-zinc-500'}"></span>
								{data.hasPuterToken ? 'Puter Configured' : 'No Puter Token'}
							</span>
						{/if}

						{#if data.hasGeminiImageKey}
							<span class="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
								<span class="w-2 h-2 rounded-full bg-indigo-400"></span>
								AI Studio Image Key Active
							</span>
						{/if}
					</h2>
					<p class="text-xs text-zinc-400">Managed via environment variables (<code class="text-zinc-300">PUTER_AUTH_TOKENS</code> and <code class="text-zinc-300">GEMINI_IMAGE_API_KEY</code>).</p>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={handleTestPuterConnection}
					disabled={isTestingPuter || !data.hasPuterToken}
					class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700/60 transition"
				>
					{#if isTestingPuter}
						<Loader2 class="w-3.5 h-3.5 animate-spin text-amber-400" />
						<span>Testing...</span>
					{:else}
						<RefreshCw class="w-3.5 h-3.5 text-amber-400" />
						<span>Test Connection</span>
					{/if}
				</button>
			</div>
		</div>

		<div class="space-y-4">
			<!-- Info Banner explaining Dual Cloud Architecture -->
			<div class="p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-2xl flex items-start gap-3 text-xs text-zinc-300">
				<Sparkles class="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
				<div>
					<p class="font-semibold text-amber-300">Hybrid Cloud: Free Allowance + Paid / API Key Failover</p>
					<p class="text-zinc-400 mt-0.5 leading-relaxed">
						Generations first consume your free Puter account quota. If Puter credits are exhausted or unavailable, requests automatically fall back to your Google AI Studio image API key (<code class="text-amber-300">gemini-3.1-flash-image-preview</code>), ensuring high availability with zero downtime.
					</p>
				</div>
			</div>

			<!-- Environment Variables Notice / Status Badges -->
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
				<div class="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 flex items-center justify-between">
					<div>
						<span class="text-zinc-400 block text-[11px] mb-0.5">Puter Auth Token Pool</span>
						<code class="text-amber-400 text-xs font-mono font-semibold">PUTER_AUTH_TOKENS</code>
					</div>
					{#if data.hasPuterToken}
						<span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
							<CheckCircle2 class="w-3.5 h-3.5" /> Configured in .env
						</span>
					{:else}
						<span class="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500 bg-zinc-800/60 px-2.5 py-1 rounded-full">
							Not Set
						</span>
					{/if}
				</div>

				<div class="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 flex items-center justify-between">
					<div>
						<span class="text-zinc-400 block text-[11px] mb-0.5">Google AI Studio Image Key</span>
						<code class="text-indigo-400 text-xs font-mono font-semibold">GEMINI_IMAGE_API_KEY</code>
					</div>
					{#if data.hasGeminiImageKey}
						<span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
							<CheckCircle2 class="w-3.5 h-3.5" /> Configured in .env
						</span>
					{:else}
						<span class="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500 bg-zinc-800/60 px-2.5 py-1 rounded-full">
							Not Set
						</span>
					{/if}
				</div>
			</div>

			{#if puterTestResult?.available}
				<div class="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between text-xs text-emerald-400 flex-wrap gap-2">
					<div class="flex items-center gap-2 font-medium">
						<CheckCircle2 class="w-4 h-4 shrink-0" />
						<span>{puterTestResult.username || 'Puter User'}</span>
						{#if puterTestResult.poolSize && puterTestResult.poolSize > 1}
							<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
								{puterTestResult.poolSize} Accounts in Pool (~{puterTestResult.poolSize * 8}–{puterTestResult.poolSize * 9} gens/mo)
							</span>
						{/if}
					</div>
					<div class="text-[11px] text-zinc-400">
						Active Model: <code class="text-amber-400 font-mono">gemini-3.1-flash-image-preview</code> ({puterTestResult.latencyMs}ms)
					</div>
				</div>
			{:else if puterTestResult?.error}
				<div class="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-2 text-xs text-amber-400">
					<AlertTriangle class="w-4 h-4 shrink-0" />
					<span>{puterTestResult.error}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Section 2: Local AI Engine (Docker RTX 5070 Ti) -->
	<div class="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
		<div class="flex items-center justify-between pb-4 border-b border-zinc-800 flex-wrap gap-4">
			<div class="flex items-center gap-3">
				<div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
					<Cpu class="w-5 h-5" />
				</div>
				<div>
					<h2 class="text-lg font-bold text-white flex items-center gap-2">
						<span>Local AI Docker Engine</span>
						{#if isTestingLocalAi}
							<span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
								<Loader2 class="w-3 h-3 animate-spin text-emerald-400" />
								<span>Checking GPU...</span>
							</span>
						{:else if testResult?.available}
							<span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
								<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
								Connected ({testResult.latencyMs}ms)
							</span>
						{:else}
							<span class="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-400 bg-zinc-800/80 px-2.5 py-0.5 rounded-full border border-zinc-700/60">
								<span class="w-2 h-2 rounded-full bg-zinc-500"></span>
								Offline (Using Cloud Fallback)
							</span>
						{/if}
					</h2>
					<p class="text-xs text-zinc-400">On-premise GPU acceleration with automatic cloud fallback whenever down.</p>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={handleTestLocalAiConnection}
					disabled={isTestingLocalAi}
					class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 transition disabled:opacity-50"
				>
					{#if isTestingLocalAi}
						<Loader2 class="w-3.5 h-3.5 animate-spin text-emerald-400" />
						<span>Testing...</span>
					{:else}
						<Zap class="w-3.5 h-3.5 text-amber-400" />
						<span>Test Connection</span>
					{/if}
				</button>
			</div>
		</div>

		<!-- Configuration Form -->
		<div class="grid grid-cols-1 md:grid-cols-12 gap-6">
			<div class="md:col-span-8 space-y-4">
				<div>
					<label for="local-ai-url" class="block text-xs font-semibold text-zinc-300 mb-1.5">
						Local AI Service URL
					</label>
					<div class="flex gap-2">
						<input
							id="local-ai-url"
							type="text"
							bind:value={localAiUrl}
							placeholder="http://local-ai:8000 or http://localhost:8000"
							class="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono text-xs"
						/>
						<button
							type="button"
							onclick={() => (localAiUrl = 'http://localhost:8000')}
							title="Reset to local machine URL"
							class="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800"
						>
							localhost:8000
						</button>
						<button
							type="button"
							onclick={() => (localAiUrl = 'http://local-ai:8000')}
							title="Reset to default Docker internal network URL"
							class="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-zinc-950 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
						>
							Docker
						</button>
					</div>
					<p class="text-[11px] text-zinc-500 mt-1">
						Inside Docker network use <code class="text-zinc-400">http://local-ai:8000</code>. On host machine use <code class="text-zinc-400">http://localhost:8000</code>.
					</p>
				</div>

				<!-- Preference Toggle -->
				<div class="flex items-center justify-between p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-2xl">
					<div>
						<h4 class="text-sm font-semibold text-zinc-200">Prefer Local AI When Available</h4>
						<p class="text-xs text-zinc-400 mt-0.5">Route virtual try-on, background removal, vision detection, and studio staging to your GPU first.</p>
					</div>
					<label class="relative inline-flex items-center cursor-pointer">
						<input type="checkbox" bind:checked={preferLocal} class="sr-only peer" />
						<div class="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
					</label>
				</div>

				<div class="flex items-center gap-3 pt-2">
					<button
						type="button"
						onclick={handleSaveLocalAiConfig}
						disabled={isSavingConfig}
						class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm shadow-emerald-600/30 disabled:opacity-50"
					>
						{#if isSavingConfig}
							<Loader2 class="w-4 h-4 animate-spin" />
							<span>Saving...</span>
						{:else}
							<Check class="w-4 h-4" />
							<span>Save Local AI Settings</span>
						{/if}
					</button>

					{#if configMessage}
						<span class="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
							<CheckCircle2 class="w-4 h-4" />
							{configMessage}
						</span>
					{/if}
				</div>
			</div>

			<!-- Telemetry Card -->
			<div class="md:col-span-4 bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-3">
				<h4 class="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
					<Server class="w-3.5 h-3.5 text-emerald-400" />
					<span>Engine Telemetry</span>
				</h4>

				{#if isTestingLocalAi && !testResult}
					<div class="py-6 text-center space-y-2">
						<Loader2 class="w-7 h-7 mx-auto text-emerald-400 animate-spin" />
						<p class="text-xs font-medium text-zinc-300">Checking engine status...</p>
						<p class="text-[11px] text-zinc-500 font-mono">{localAiUrl}</p>
					</div>
				{:else if testResult?.available}
					<div class="space-y-2 text-xs">
						<div class="flex justify-between py-1 border-b border-zinc-800/80">
							<span class="text-zinc-500">Hardware:</span>
							<span class="font-semibold text-zinc-200 text-right">{testResult.gpu || 'NVIDIA GPU'}</span>
						</div>
						<div class="flex justify-between py-1 border-b border-zinc-800/80">
							<span class="text-zinc-500">VRAM Free:</span>
							<span class="font-mono text-emerald-400">
								{testResult.vramFreeMb ? `${(testResult.vramFreeMb / 1024).toFixed(1)} GB` : 'Available'}
							</span>
						</div>
						<div class="flex justify-between py-1 border-b border-zinc-800/80">
							<span class="text-zinc-500">Latency:</span>
							<span class="font-mono text-zinc-200">{testResult.latencyMs} ms</span>
						</div>
						<div class="flex justify-between py-1">
							<span class="text-zinc-500">Status:</span>
							<span class="font-semibold text-emerald-400">Operational</span>
						</div>
					</div>
				{:else}
					<div class="py-4 text-center space-y-2">
						<AlertTriangle class="w-8 h-8 mx-auto text-amber-500/60" />
						<p class="text-xs font-medium text-zinc-400">Local service not detected</p>
						<p class="text-[11px] text-zinc-500">
							{testResult?.error || 'Make sure the mywardrobe-local-ai container is running in Docker Desktop.'}
						</p>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Section 1: Try-On Portrait Photo -->
	<div class="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
		<div class="flex items-center gap-3 pb-4 border-b border-zinc-800">
			<div class="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
				<User class="w-5 h-5" />
			</div>
			<div>
				<h2 class="text-lg font-bold text-white">Virtual Try-On Portrait</h2>
				<p class="text-xs text-zinc-400">This photo is used by Leffa and FLUX.1-Fill to render clothes and shoes on you.</p>
			</div>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
			<!-- Photo Preview Area -->
			<div class="md:col-span-4 flex flex-col items-center">
				<div class="w-44 aspect-[3/4] bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 flex items-center justify-center p-2 relative shadow-lg">
					{#if currentPortraitUrl}
						<img
							src={currentPortraitUrl}
							alt="Your Try-On Portrait"
							class="w-full h-full object-contain rounded-xl"
						/>
					{:else}
						<div class="text-center p-4 text-zinc-600 space-y-2">
							<User class="w-12 h-12 mx-auto opacity-30" />
							<p class="text-xs">No portrait uploaded</p>
						</div>
					{/if}

					{#if isUploadingPortrait}
						<div class="absolute inset-0 bg-black/70 flex items-center justify-center">
							<Loader2 class="w-6 h-6 text-indigo-400 animate-spin" />
						</div>
					{/if}
				</div>

				{#if uploadMessage}
					<p class="text-xs text-emerald-400 font-semibold mt-2">{uploadMessage}</p>
				{/if}
			</div>

			<!-- Guidance and Upload Button -->
			<div class="md:col-span-8 space-y-4">
				<div class="bg-zinc-950/60 border border-zinc-800/80 rounded-2xl p-4 space-y-2.5 text-xs text-zinc-300">
					<p class="font-bold text-zinc-200">Tips for Best Try-On Results:</p>
					<ul class="space-y-1.5 list-disc list-inside text-zinc-400">
						<li><strong>Full-body capture:</strong> Ensure your head, torso, legs, and feet are completely visible.</li>
						<li><strong>Front-facing posture:</strong> Stand facing the camera with arms slightly away from sides.</li>
						<li><strong>Plain background:</strong> Stand against a neutral wall with minimal clutter.</li>
						<li><strong>Fitted base clothes:</strong> Wear form-fitting or simple neutral clothing.</li>
					</ul>
				</div>

				<input
					type="file"
					accept="image/*"
					bind:this={portraitInput}
					onchange={handlePortraitChange}
					class="hidden"
				/>

				<button
					onclick={() => portraitInput?.click()}
					disabled={isUploadingPortrait}
					class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition shadow-sm shadow-indigo-600/30"
				>
					<Upload class="w-4 h-4" />
					<span>{currentPortraitUrl ? 'Change Portrait Photo' : 'Upload Full-Body Portrait'}</span>
				</button>
			</div>
		</div>
	</div>

	<!-- Section: Body Proportions & Fit Calibration -->
	<div class="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
		<div class="flex items-center justify-between pb-4 border-b border-zinc-800 flex-wrap gap-4">
			<div class="flex items-center gap-3">
				<div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
					<Sliders class="w-5 h-5" />
				</div>
				<div>
					<h2 class="text-lg font-bold text-white">Body Proportions & Fit Calibration</h2>
					<p class="text-xs text-zinc-400">
						Calibrate how virtual try-on models drape garments onto your frame. Ensures wide-leg jeans, oversized tees, and coats retain true volume without shrink-wrapping.
					</p>
				</div>
			</div>

			<button
				type="button"
				onclick={handleSaveBodyProfile}
				disabled={isSavingBodyProfile}
				class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition shadow-sm shadow-emerald-600/20"
			>
				{#if isSavingBodyProfile}
					<Loader2 class="w-3.5 h-3.5 animate-spin text-white" />
					<span>Saving...</span>
				{:else}
					<Check class="w-3.5 h-3.5 stroke-[3]" />
					<span>Save Fit Preferences</span>
				{/if}
			</button>
		</div>

		{#if bodyProfileMessage}
			<div class="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-2 text-xs text-emerald-400">
				<CheckCircle2 class="w-4 h-4 shrink-0" />
				<span>{bodyProfileMessage}</span>
			</div>
		{/if}

		<div class="grid grid-cols-1 sm:grid-cols-3 gap-5">
			<!-- Height -->
			<div class="space-y-2">
				<label for="profile-height" class="block text-xs font-bold text-zinc-300">
					Approximate Height
				</label>
				<input
					id="profile-height"
					type="text"
					bind:value={userHeight}
					placeholder="e.g. 182 cm, 6'0&quot;"
					class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
				/>
				<p class="text-[11px] text-zinc-500">Helps AI scale pant leg stacking and hem drape correctly.</p>
			</div>

			<!-- Body Build -->
			<div class="space-y-2">
				<label for="profile-body-type" class="block text-xs font-bold text-zinc-300">
					Body Frame / Build
				</label>
				<select
					id="profile-body-type"
					bind:value={userBodyType}
					class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
				>
					<option value="">Default / Standard Build</option>
					<option value="average">Average / Regular</option>
					<option value="athletic">Athletic / Muscular</option>
					<option value="slim">Slim / Lean</option>
					<option value="broad">Broad / Large</option>
					<option value="tall-slender">Tall & Slender</option>
					<option value="stocky">Stocky / Compact</option>
				</select>
				<p class="text-[11px] text-zinc-500">Informs shoulder width, waistline, and thigh clearance.</p>
			</div>

			<!-- Fit Preference -->
			<div class="space-y-2">
				<label for="profile-fit-pref" class="block text-xs font-bold text-zinc-300">
					Default Silhouette Bias
				</label>
				<select
					id="profile-fit-pref"
					bind:value={userFitPreference}
					class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
				>
					<option value="">True to Garment Cut (Recommended)</option>
					<option value="relaxed">Relaxed / Roomy</option>
					<option value="oversized">Oversized / Streetwear Drape</option>
					<option value="fitted">Tailored / Closer Fit</option>
				</select>
				<p class="text-[11px] text-zinc-500">How garments should fall when cut metadata is ambiguous.</p>
			</div>
		</div>
	</div>

	<!-- Section 2: AI & System Integrations Dashboard -->
	<div class="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
		<div class="flex items-center gap-3 pb-4 border-b border-zinc-800">
			<div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
				<Sparkles class="w-5 h-5" />
			</div>
			<div>
				<h2 class="text-lg font-bold text-white">AI Services & Provider Status</h2>
				<p class="text-xs text-zinc-400">Current connectivity and operational status across all pipeline stages.</p>
			</div>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<!-- Puter & AI Studio Nano Banana Status -->
			<div class="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-start gap-3">
				<div class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
					<Sparkles class="w-4 h-4" />
				</div>
				<div class="flex-1 min-w-0">
					<div class="flex items-center justify-between">
						<h4 class="font-bold text-sm text-zinc-200">Puter.js & AI Studio (Nano Banana)</h4>
						{#if data.hasPuterToken || data.hasGeminiImageKey}
							<span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
								<CheckCircle2 class="w-3 h-3" /> Default Engine
							</span>
						{:else}
							<span class="text-[10px] font-bold text-amber-400">Needs Credentials</span>
						{/if}
					</div>
					<p class="text-xs text-zinc-400 mt-1">Model: <code class="text-amber-400">gemini-3.1-flash-image-preview</code></p>
					<p class="text-[11px] text-zinc-500 mt-0.5">Rapid flat-lays & virtual try-on via Puter quota + AI Studio failover</p>
				</div>
			</div>

			<!-- Gemini Status -->
			<div class="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-start gap-3">
				<div class="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
					<Sparkles class="w-4 h-4" />
				</div>
				<div class="flex-1 min-w-0">
					<div class="flex items-center justify-between">
						<h4 class="font-bold text-sm text-zinc-200">Google Gemini (Vision & Text)</h4>
						{#if data.hasGeminiKey}
							<span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
								<CheckCircle2 class="w-3 h-3" /> Active (AI Studio)
							</span>
						{:else}
							<span class="text-[10px] font-bold text-amber-400">Missing Key</span>
						{/if}
					</div>
					<p class="text-xs text-zinc-400 mt-1">Model: <code class="text-zinc-300">gemini-3.5-flash-lite</code> <span class="text-zinc-500 text-[11px]">(fallback: <code class="text-zinc-400">gemini-3.1-flash-lite</code>)</span></p>
					<p class="text-[11px] text-zinc-500 mt-0.5">Garment detection, auto-tagging, and outfit stylist</p>
				</div>
			</div>

			<!-- Cloudinary Status -->
			<div class="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-start gap-3">
				<div class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
					<Cloud class="w-4 h-4" />
				</div>
				<div class="flex-1 min-w-0">
					<div class="flex items-center justify-between">
						<h4 class="font-bold text-sm text-zinc-200">Cloudinary AI</h4>
						{#if data.hasCloudinaryUrl}
							<span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
								<CheckCircle2 class="w-3 h-3" /> Connected
							</span>
						{:else}
							<span class="text-[10px] font-bold text-amber-400">Missing URL</span>
						{/if}
					</div>
					<p class="text-xs text-zinc-400 mt-1">Generative Background Replacement & CDN</p>
					<p class="text-[11px] text-zinc-500 mt-0.5">Transforms phone crops and hosts catalog images</p>
				</div>
			</div>

			<!-- Hugging Face Status -->
			<div class="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-start gap-3">
				<div class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
					<Server class="w-4 h-4" />
				</div>
				<div class="flex-1 min-w-0">
					<div class="flex items-center justify-between">
						<h4 class="font-bold text-sm text-zinc-200">Hugging Face ZeroGPU</h4>
						{#if data.hasHfToken}
							<span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
								<CheckCircle2 class="w-3 h-3" /> Authenticated
							</span>
						{:else}
							<span class="text-[10px] font-bold text-amber-400">Missing Token</span>
						{/if}
					</div>
					<p class="text-xs text-zinc-400 mt-1">Models: Leffa & FLUX.1-Fill-dev</p>
					<p class="text-[11px] text-zinc-500 mt-0.5">Virtual try-on (clothing + footwear inpainting on feet)</p>
				</div>
			</div>

			<!-- PostgreSQL Status -->
			<div class="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-start gap-3">
				<div class="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center shrink-0">
					<Database class="w-4 h-4" />
				</div>
				<div class="flex-1 min-w-0">
					<div class="flex items-center justify-between">
						<h4 class="font-bold text-sm text-zinc-200">PostgreSQL</h4>
						<span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
							<CheckCircle2 class="w-3 h-3" /> Active
						</span>
					</div>
					<p class="text-xs text-zinc-400 mt-1">{data.garmentCount} Garments • {data.outfitCount} Outfits</p>
					<p class="text-[11px] text-zinc-500 mt-0.5">Drizzle ORM with connection pool bounds</p>
				</div>
			</div>
		</div>

		<!-- App Identity Card -->
		<div class="p-5 rounded-3xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
			<div class="flex items-center gap-3.5">
				<AppLogo size={44} class="shadow-lg shadow-indigo-500/20" />
				<div>
					<h4 class="font-bold text-sm text-zinc-100">My Wardrobe</h4>
					<p class="text-xs text-zinc-400">Personal Digital Wardrobe & AI Styling Studio</p>
				</div>
			</div>
			<div class="flex items-center gap-2 text-xs text-zinc-500">
				<span class="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-zinc-400">v0.0.1</span>
				<span class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
					<CheckCircle2 class="w-3 h-3" /> System Operational
				</span>
			</div>
		</div>
	</div>
</div>
