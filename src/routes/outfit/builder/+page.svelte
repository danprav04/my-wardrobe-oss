<script lang="ts">
	import { 
		Sparkles, 
		Plus, 
		X, 
		Check, 
		Shirt, 
		Footprints, 
		Layers, 
		Eye, 
		Save, 
		Loader2, 
		AlertCircle,
		RotateCcw,
		ChevronRight,
		Search
	} from '@lucide/svelte';
	import { goto } from '$app/navigation';

	interface GarmentItem {
		id: string;
		name: string;
		description: string | null;
		category: string;
		fit?: string | null;
		tags: string[];
		imageUrl: string;
		cropPath: string;
	}

	let { data } = $props();

	let editingOutfitId = $state<string | null>(data.editOutfit?.id || null);
	let outfitName = $state(data.editOutfit?.name || '');
	let tryOnResultUrl = $state<string | null>(data.editOutfit?.tryonUrl || null);

	function buildInitialSlots() {
		const slots: Record<string, GarmentItem | null> = {
			top: null,
			bottom: null,
			shoes: null,
			outerwear: null,
			accessory: null
		};
		if (data.editOutfit && Array.isArray(data.editOutfit.items)) {
			for (const item of data.editOutfit.items) {
				const found = data.garments.find((g: GarmentItem) => g.id === item.garmentId);
				if (found && item.slot in slots) {
					slots[item.slot] = found;
				}
			}
		}
		return slots;
	}

	function getSlotSignature(slots: Record<string, GarmentItem | null>): string {
		return Object.entries(slots)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${k}:${v?.id || 'none'}`)
			.join('|');
	}

	let lastTriedSlotSignature = $state<string | null>(data.editOutfit?.tryonUrl ? getSlotSignature(buildInitialSlots()) : null);

	// Current equipped items per slot
	let selectedSlots = $state<Record<string, GarmentItem | null>>(buildInitialSlots());

	// UI State
	let activePickerSlot = $state<string | null>(null);
	let isSuggesting = $state(false);
	let stylistReasoning = $state<string | null>(null);
	let slotSuggestions = $state<Record<string, string[]>>({});
	let isSaving = $state(false);
	let showSaveModal = $state(false);

	// Try-On State
	let isTryingOn = $state(false);
	let tryOnStep = $state('');
	let tryOnError = $state<string | null>(null);

	$effect(() => {
		if (data.editOutfit && data.editOutfit.id !== editingOutfitId) {
			editingOutfitId = data.editOutfit.id;
			outfitName = data.editOutfit.name;
			tryOnResultUrl = data.editOutfit.tryonUrl || null;
			selectedSlots = buildInitialSlots();
			lastTriedSlotSignature = data.editOutfit.tryonUrl ? getSlotSignature(selectedSlots) : null;
		}
	});

	const slotDefinitions = [
		{ id: 'top', label: 'Top', category: 'tops', icon: Shirt, placeholder: 'Select t-shirt, shirt, hoodie...' },
		{ id: 'bottom', label: 'Bottom', category: 'bottoms', icon: Layers, placeholder: 'Select pants, jeans, shorts...' },
		{ id: 'shoes', label: 'Shoes', category: 'shoes', icon: Footprints, placeholder: 'Select sneakers, boots, loafers...' },
		{ id: 'outerwear', label: 'Outerwear', category: 'outerwear', icon: Layers, placeholder: 'Select jacket, coat, overshirt...' },
		{ id: 'accessory', label: 'Accessory', category: 'accessories', icon: Sparkles, placeholder: 'Select watch, hat, belt...' }
	];

	let pickerSearch = $state('');

	let activeSlotDef = $derived(slotDefinitions.find((s) => s.id === activePickerSlot));

	function openPicker(slotId: string) {
		activePickerSlot = slotId;
		pickerSearch = '';
	}

	// Get garments available for the active picker slot - strictly matching slot category
	let candidatesForPicker = $derived.by(() => {
		if (!activePickerSlot || !activeSlotDef) return [];
		return data.garments.filter((g) => {
			const matchesCategory = g.category === activeSlotDef.category;
			const q = pickerSearch.toLowerCase().trim();
			const matchesSearch =
				!q ||
				g.name.toLowerCase().includes(q) ||
				(g.description && g.description.toLowerCase().includes(q)) ||
				g.tags.some((t) => t.toLowerCase().includes(q));

			return matchesCategory && matchesSearch;
		});
	});

	let hasAnyItem = $derived(Object.values(selectedSlots).some(Boolean));

	function equipItem(slotId: string, item: GarmentItem) {
		if (selectedSlots[slotId]?.id !== item.id) {
			selectedSlots[slotId] = item;
			tryOnResultUrl = null;
			lastTriedSlotSignature = null;
		}
		activePickerSlot = null;
		// Keep slotSuggestions and stylistReasoning active so remaining empty slots continue showing suggestions!
	}

	function clearSlot(slotId: string) {
		if (selectedSlots[slotId]) {
			selectedSlots[slotId] = null;
			tryOnResultUrl = null;
			lastTriedSlotSignature = null;
		}
	}

	function resetFit() {
		selectedSlots = {
			top: null,
			bottom: null,
			shoes: null,
			outerwear: null,
			accessory: null
		};
		stylistReasoning = null;
		slotSuggestions = {};
		tryOnResultUrl = null;
		lastTriedSlotSignature = null;
	}

	let hasApplicableSuggestions = $derived.by(() => {
		for (const [slotId, ids] of Object.entries(slotSuggestions)) {
			if (!selectedSlots[slotId] && ids && ids.length > 0) return true;
		}
		return false;
	});

	function applyAllSuggestions() {
		let changed = false;
		for (const [slotId, garmentIds] of Object.entries(slotSuggestions)) {
			if (!selectedSlots[slotId] && Array.isArray(garmentIds) && garmentIds.length > 0) {
				const topId = garmentIds[0];
				const found = data.garments.find((g: GarmentItem) => g.id === topId);
				if (found) {
					selectedSlots[slotId] = found;
					changed = true;
				}
			}
		}
		if (changed) {
			tryOnResultUrl = null;
			lastTriedSlotSignature = null;
		}
	}

	// Trigger AI Stylist Suggestion (Gemini 3.5 Flash-Lite)
	async function handleGetSuggestions() {
		if (data.garments.length === 0) {
			alert('Your wardrobe is currently empty. Please add clothes before requesting stylist recommendations.');
			return;
		}

		isSuggesting = true;
		stylistReasoning = null;
		slotSuggestions = {};

		try {
			const payloadSlots: Record<string, string> = {};
			for (const [slot, item] of Object.entries(selectedSlots)) {
				if (item) payloadSlots[slot] = item.id;
			}

			const res = await fetch('/api/suggest', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ selectedSlots: payloadSlots })
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Failed to generate suggestions');
			}

			const result = await res.json();
			stylistReasoning = result.reasoning;
			slotSuggestions = result.suggestions || {};
		} catch (e: any) {
			alert('Stylist error: ' + e.message);
		} finally {
			isSuggesting = false;
		}
	}

	// Save Outfit
	async function handleSaveOutfit() {
		if (!outfitName.trim()) {
			alert('Please give your outfit a name.');
			return;
		}

		isSaving = true;
		try {
			const itemsPayload = Object.entries(selectedSlots)
				.filter(([_, item]) => Boolean(item))
				.map(([slot, item]) => ({
					slot,
					garmentId: item!.id
				}));

			const url = editingOutfitId ? `/api/outfits/${editingOutfitId}` : '/api/outfits';
			const method = editingOutfitId ? 'PUT' : 'POST';

			const currentSig = getSlotSignature(selectedSlots);
			const validTryonUrl = lastTriedSlotSignature === currentSig ? tryOnResultUrl : null;

			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: outfitName.trim(),
					items: itemsPayload,
					tryonUrl: validTryonUrl
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || `Failed to ${editingOutfitId ? 'update' : 'save'} outfit`);
			}

			showSaveModal = false;
			await goto('/outfit');
		} catch (e: any) {
			alert('Error saving outfit: ' + e.message);
		} finally {
			isSaving = false;
		}
	}

	// Virtual Try-On
	async function handleVirtualTryOn() {
		if (!data.hasPortrait) {
			alert('You need to upload your full-body portrait photo in Settings before generating a Virtual Try-On.');
			await goto('/settings');
			return;
		}

		if (!selectedSlots.top && !selectedSlots.bottom && !selectedSlots.shoes) {
			alert('Please select at least a top, bottom, or shoes to preview the fit.');
			return;
		}

		isTryingOn = true;
		tryOnError = null;
		const engineLabel = data.activeEngine === 'puter'
			? 'Puter.js & AI Studio (Gemini 3.1 Flash Image)...'
			: data.activeEngine === 'local'
				? 'Local AI GPU Engine (RTX ComfyUI)...'
				: 'Community Cloud (Leffa Space)...';
		tryOnStep = `Generating virtual try-on with ${engineLabel}`;

		try {
			const res = await fetch('/api/tryon', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					outfitId: editingOutfitId || undefined,
					slots: {
						top: selectedSlots.top?.id,
						bottom: selectedSlots.bottom?.id,
						shoes: selectedSlots.shoes?.id
					}
				})
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Virtual try-on failed');
			}

			const result = await res.json();
			tryOnResultUrl = result.tryonUrl;
			lastTriedSlotSignature = getSlotSignature(selectedSlots);
		} catch (err: any) {
			console.error('Tryon error:', err);
			tryOnError = err.message || 'Virtual try-on failed. Please check engine settings.';
		} finally {
			isTryingOn = false;
		}
	}
</script>

<div class="max-w-6xl mx-auto space-y-8">
	<!-- Page Header & Action Bar -->
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
		<div>
			<h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
				<span>Outfit Builder</span>
				{#if editingOutfitId}
					<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
						Editing Fit
					</span>
				{:else}
					<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
						Interactive
					</span>
				{/if}
			</h1>
			<p class="text-sm text-zinc-400 mt-1">
				{#if editingOutfitId}
					Editing "<span class="text-zinc-200 font-medium">{outfitName || 'Saved Outfit'}</span>". Swap items, regenerate try-ons, or rename.
					<a href="/outfit/builder" class="text-indigo-400 hover:underline ml-1.5 font-medium">Create new fit instead &rarr;</a>
				{:else}
					Assemble clothing & footwear, get AI match suggestions, and see the full fit on you with Virtual Try-On.
				{/if}
			</p>
		</div>

		<div class="flex items-center gap-2.5 w-full sm:w-auto">
			{#if hasAnyItem}
				<button
					onclick={resetFit}
					class="p-2.5 rounded-xl text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 transition"
					title="Reset fit"
				>
					<RotateCcw class="w-4 h-4" />
				</button>
			{/if}

			<!-- AI Suggest Button -->
			<button
				onclick={handleGetSuggestions}
				disabled={isSuggesting || data.garments.length === 0}
				class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-zinc-950 font-bold transition shadow-md shadow-amber-500/20"
			>
				{#if isSuggesting}
					<Loader2 class="w-4 h-4 animate-spin" />
					<span>Styling with Flash-Lite...</span>
				{:else}
					<Sparkles class="w-4 h-4" />
					<span>Suggest Matches</span>
				{/if}
			</button>

			<!-- Try-On Button -->
			<button
				onclick={handleVirtualTryOn}
				disabled={isTryingOn || !hasAnyItem}
				class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition shadow-md shadow-indigo-600/30"
			>
				{#if isTryingOn}
					<Loader2 class="w-4 h-4 animate-spin" />
					<span>Rendering...</span>
				{:else}
					<Eye class="w-4 h-4" />
					<span>Try On Me</span>
					{#if data.activeEngine === 'puter'}
						<span class="text-[10px] bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded font-mono font-normal">Nano Banana</span>
					{:else if data.activeEngine === 'local'}
						<span class="text-[10px] bg-emerald-400/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-normal">Local RTX</span>
					{/if}
				{/if}
			</button>

			<!-- Save Outfit Button -->
			{#if hasAnyItem}
				<button
					onclick={() => (showSaveModal = true)}
					class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold {editingOutfitId ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold shadow-sm shadow-amber-500/20' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700'} transition"
				>
					<Save class="w-4 h-4" />
					<span>{editingOutfitId ? 'Update Fit' : 'Save Fit'}</span>
				</button>
			{/if}
		</div>
	</div>

	<!-- AI Stylist Advice Banner (if suggested) -->
	{#if stylistReasoning}
		<div class="bg-gradient-to-r from-amber-500/10 via-zinc-900 to-zinc-900 border border-amber-500/30 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-sm">
			<div class="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
				<Sparkles class="w-5 h-5" />
			</div>
			<div class="flex-1">
				<div class="flex items-center justify-between flex-wrap gap-2">
					<h3 class="text-sm font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
						<span>AI Stylist (Gemini Flash-Lite)</span>
					</h3>
					<div class="flex items-center gap-2">
						{#if hasApplicableSuggestions}
							<button
								onclick={applyAllSuggestions}
								class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-amber-400 hover:bg-amber-300 text-zinc-950 transition shadow-sm"
								title="Equip all recommended garments into empty slots"
							>
								<Check class="w-3.5 h-3.5 stroke-[3]" />
								<span>Equip All Matches</span>
							</button>
						{/if}
						<button
							onclick={() => {
								stylistReasoning = null;
								slotSuggestions = {};
							}}
							class="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg hover:bg-zinc-800"
							title="Dismiss recommendations"
						>
							<X class="w-4 h-4" />
						</button>
					</div>
				</div>
				<p class="text-sm text-zinc-200 mt-2 leading-relaxed">
					{stylistReasoning}
				</p>
			</div>
		</div>
	{/if}

	<!-- Try-On Result Section (if generated) -->
	{#if tryOnResultUrl || isTryingOn || tryOnError}
		<div class="bg-zinc-900/90 border border-indigo-500/30 rounded-3xl p-6 space-y-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Eye class="w-5 h-5 text-indigo-400" />
					<h3 class="font-bold text-white text-base sm:text-lg">Virtual Try-On Simulation</h3>
				</div>
				{#if tryOnResultUrl}
					<button
						onclick={() => (tryOnResultUrl = null)}
						class="text-xs text-zinc-400 hover:text-zinc-200"
					>
						Close
					</button>
				{/if}
			</div>

			{#if isTryingOn}
				<div class="py-12 text-center space-y-3">
					<Loader2 class="w-10 h-10 text-indigo-400 animate-spin mx-auto" />
					<p class="text-sm font-medium text-zinc-200">Generating Photorealistic Try-On</p>
					<p class="text-xs text-zinc-400 max-w-sm mx-auto">{tryOnStep}</p>
				</div>
			{:else if tryOnError}
				<div class="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
					<p class="font-semibold text-sm mb-1">Try-On Notice</p>
					{tryOnError}
				</div>
			{:else if tryOnResultUrl}
				<div class="max-w-md mx-auto aspect-[3/4] bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl relative">
					<img
						src={tryOnResultUrl}
						alt="Virtual Try-On Result"
						class="w-full h-full object-contain"
					/>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Main Builder Workspace -->
	<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
		<!-- Left: Outfit Slots Column (lg:col-span-7) -->
		<div class="lg:col-span-7 space-y-4">
			<h2 class="text-sm font-bold text-zinc-400 uppercase tracking-wider">Garment Slots</h2>

			<div class="space-y-3">
				{#each slotDefinitions as slot (slot.id)}
					{@const equipped = selectedSlots[slot.id]}
					{@const suggestedIds = slotSuggestions[slot.id] || []}
					{@const suggestedItems = data.garments.filter((g) => suggestedIds.includes(g.id))}

					<div class="bg-zinc-900/80 border {equipped ? 'border-zinc-700/80' : 'border-zinc-800/80 border-dashed'} rounded-2xl p-4 transition-all">
						<div class="flex items-center justify-between mb-3">
							<div class="flex items-center gap-2.5">
								<div class="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
									<slot.icon class="w-4 h-4" />
								</div>
								<span class="text-xs font-bold uppercase tracking-wider text-zinc-300">
									{slot.label}
								</span>
							</div>

							{#if equipped}
								<button
									onclick={() => clearSlot(slot.id)}
									class="text-xs font-medium text-zinc-400 hover:text-red-400 flex items-center gap-1 transition"
								>
									<X class="w-3.5 h-3.5" />
									<span>Clear</span>
								</button>
							{/if}
						</div>

						{#if equipped}
							<!-- Equipped Garment Card -->
							<div class="flex items-center gap-4 bg-zinc-950/80 border border-zinc-800 rounded-xl p-3">
								<div class="w-16 h-16 rounded-lg bg-zinc-900 overflow-hidden shrink-0 flex items-center justify-center p-1 border border-zinc-800">
									<img
										src={equipped.imageUrl}
										alt={equipped.name}
										class="w-full h-full object-contain"
										onerror={(e) => {
											const target = e.currentTarget as HTMLImageElement;
											if (equipped.cropPath && !target.src.includes(equipped.cropPath)) target.src = `/api/storage/${equipped.cropPath}`;
										}}
									/>
								</div>

								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<h4 class="font-bold text-sm text-zinc-100 truncate">{equipped.name}</h4>
										{#if equipped.fit}
											<span class="text-[9px] font-bold uppercase tracking-wider bg-indigo-950 text-indigo-300 border border-indigo-700/50 px-1.5 py-0.5 rounded shrink-0">
												{equipped.fit}
											</span>
										{/if}
									</div>
									{#if equipped.description}
										<p class="text-xs text-zinc-400 truncate mt-0.5">{equipped.description}</p>
									{/if}
									<div class="flex gap-1 mt-1.5 flex-wrap">
										{#each equipped.tags.slice(0, 3) as tag}
											<span class="text-[10px] font-medium bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md">
												#{tag}
											</span>
										{/each}
									</div>
								</div>

								<button
									onclick={() => openPicker(slot.id)}
									class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 shrink-0"
								>
									Change
								</button>
							</div>
						{:else}
							<!-- Empty Slot Placeholder -->
							<button
								onclick={() => openPicker(slot.id)}
								class="w-full py-4 px-4 rounded-xl border border-zinc-800/80 hover:border-indigo-500/50 hover:bg-zinc-800/30 text-center transition flex items-center justify-center gap-2 text-zinc-400 hover:text-zinc-200 group"
							>
								<Plus class="w-4 h-4 group-hover:text-indigo-400 transition" />
								<span class="text-xs font-semibold">{slot.placeholder}</span>
							</button>

							<!-- If AI suggested items for this empty slot, display them inline! -->
							{#if suggestedItems.length > 0}
								<div class="mt-3 pt-3 border-t border-zinc-800/60 space-y-2">
									<span class="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
										<Sparkles class="w-3 h-3" /> Recommended for this slot:
									</span>
									<div class="grid grid-cols-2 gap-2">
										{#each suggestedItems as sugItem}
											<button
												onclick={() => equipItem(slot.id, sugItem)}
												class="flex items-center gap-2 p-2 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-amber-400/50 text-left transition group"
											>
												<div class="w-10 h-10 rounded-lg bg-zinc-900 p-1 shrink-0">
													<img
														src={sugItem.imageUrl}
														alt={sugItem.name}
														class="w-full h-full object-contain"
													/>
												</div>
												<div class="min-w-0 flex-1">
													<p class="text-xs font-semibold text-zinc-200 truncate group-hover:text-amber-300">
														{sugItem.name}
													</p>
													<span class="text-[10px] text-zinc-500">Tap to equip</span>
												</div>
											</button>
										{/each}
									</div>
								</div>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<!-- Right: Visual Look Composite Preview (lg:col-span-5) -->
		<div class="lg:col-span-5 space-y-4 sticky top-24">
			<h2 class="text-sm font-bold text-zinc-400 uppercase tracking-wider">Look Preview</h2>

			<div class="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 space-y-4">
				{#if !hasAnyItem}
					<div class="py-16 text-center text-zinc-500 space-y-2">
						<Shirt class="w-10 h-10 mx-auto opacity-30" />
						<p class="text-sm font-medium">No items equipped yet</p>
						<p class="text-xs text-zinc-600">Equip garments from the slots on the left to stack your look.</p>
					</div>
				{:else}
					<!-- Vertical Stack of Equipped Pieces -->
					<div class="flex flex-col items-center gap-3 py-2">
						{#if selectedSlots.outerwear}
							<div class="w-48 aspect-square bg-zinc-950 rounded-2xl p-3 border border-zinc-800 flex items-center justify-center shadow-lg relative group">
								<img src={selectedSlots.outerwear.imageUrl} alt={selectedSlots.outerwear.name} class="max-h-full max-w-full object-contain" />
								<span class="absolute top-2 left-2 text-[9px] font-bold uppercase bg-zinc-900/90 px-1.5 py-0.5 rounded text-zinc-400">Outerwear</span>
							</div>
						{/if}

						{#if selectedSlots.top}
							<div class="w-48 aspect-square bg-zinc-950 rounded-2xl p-3 border border-zinc-800 flex items-center justify-center shadow-lg relative group">
								<img src={selectedSlots.top.imageUrl} alt={selectedSlots.top.name} class="max-h-full max-w-full object-contain" />
								<span class="absolute top-2 left-2 text-[9px] font-bold uppercase bg-zinc-900/90 px-1.5 py-0.5 rounded text-zinc-400">Top</span>
							</div>
						{/if}

						{#if selectedSlots.bottom}
							<div class="w-48 aspect-square bg-zinc-950 rounded-2xl p-3 border border-zinc-800 flex items-center justify-center shadow-lg relative group">
								<img src={selectedSlots.bottom.imageUrl} alt={selectedSlots.bottom.name} class="max-h-full max-w-full object-contain" />
								<span class="absolute top-2 left-2 text-[9px] font-bold uppercase bg-zinc-900/90 px-1.5 py-0.5 rounded text-zinc-400">Bottom</span>
							</div>
						{/if}

						{#if selectedSlots.shoes}
							<div class="w-48 aspect-square bg-zinc-950 rounded-2xl p-3 border border-zinc-800 flex items-center justify-center shadow-lg relative group">
								<img src={selectedSlots.shoes.imageUrl} alt={selectedSlots.shoes.name} class="max-h-full max-w-full object-contain" />
								<span class="absolute top-2 left-2 text-[9px] font-bold uppercase bg-zinc-900/90 px-1.5 py-0.5 rounded text-zinc-400">Shoes</span>
							</div>
						{/if}

						{#if selectedSlots.accessory}
							<div class="w-36 aspect-square bg-zinc-950 rounded-2xl p-2 border border-zinc-800 flex items-center justify-center shadow-md relative group">
								<img src={selectedSlots.accessory.imageUrl} alt={selectedSlots.accessory.name} class="max-h-full max-w-full object-contain" />
								<span class="absolute top-2 left-2 text-[9px] font-bold uppercase bg-zinc-900/90 px-1.5 py-0.5 rounded text-zinc-400">Accessory</span>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Modal: Category-Locked Slot Picker Drawer -->
	{#if activePickerSlot}
		<div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
			<div class="bg-zinc-900 border border-zinc-800 w-full max-w-2xl max-h-[85vh] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom duration-200">
				<!-- Header with Title and Search -->
				<div class="p-4 sm:p-5 border-b border-zinc-800 space-y-3">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="font-bold text-lg text-white">
								Select {activeSlotDef?.label}
							</h3>
							<p class="text-xs text-zinc-400 mt-0.5">
								Choose from your saved {activeSlotDef?.label.toLowerCase()} to equip this slot
							</p>
						</div>

						<button onclick={() => (activePickerSlot = null)} class="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800">
							<X class="w-5 h-5" />
						</button>
					</div>

					<!-- Search input -->
					<div class="relative">
						<Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
						<input
							type="text"
							bind:value={pickerSearch}
							placeholder="Search by name, color, style, brand..."
							class="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
						/>
					</div>
				</div>

				<!-- Items Grid -->
				<div class="p-4 sm:p-5 overflow-y-auto flex-1">
					{#if candidatesForPicker.length === 0}
						<div class="text-center py-12 text-zinc-500 space-y-3">
							<p class="text-sm font-medium text-zinc-300">
								{pickerSearch
									? `No ${activeSlotDef?.label.toLowerCase()} match "${pickerSearch}"`
									: `No ${activeSlotDef?.label.toLowerCase()} in your wardrobe yet`}
							</p>
							<p class="text-xs text-zinc-500 max-w-xs mx-auto">
								Upload a photo of your {activeSlotDef?.label.toLowerCase()} to equip them in your outfits.
							</p>
							<a
								href="/garment/add"
								class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm"
							>
								<Plus class="w-3.5 h-3.5" />
								<span>Add {activeSlotDef?.label}</span>
							</a>
						</div>
					{:else}
						<div class="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
							{#each candidatesForPicker as garment}
								<button
									onclick={() => equipItem(activePickerSlot!, garment)}
									class="flex flex-col bg-zinc-950 border border-zinc-800 hover:border-indigo-500 rounded-2xl overflow-hidden p-2.5 text-left transition group"
								>
									<div class="aspect-square bg-zinc-900 rounded-xl p-2 flex items-center justify-center mb-2">
										<img
											src={garment.imageUrl}
											alt={garment.name}
											class="max-h-full max-w-full object-contain group-hover:scale-105 transition"
										/>
									</div>
									<h5 class="text-xs font-bold text-zinc-200 line-clamp-1 group-hover:text-indigo-400">
										{garment.name}
									</h5>
									{#if garment.description}
										<p class="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">{garment.description}</p>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Modal: Save Outfit -->
	{#if showSaveModal}
		<div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
			<div class="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl">
				<h3 class="font-bold text-lg text-white">{editingOutfitId ? 'Update Outfit' : 'Save Outfit'}</h3>
				<p class="text-xs text-zinc-400">
					{editingOutfitId ? 'Update the name or details for this outfit.' : 'Give your assembled fit a memorable name.'}
				</p>

				<div>
					<label for="outfit-name-input" class="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
						Outfit Name
					</label>
					<input
						id="outfit-name-input"
						type="text"
						bind:value={outfitName}
						placeholder="e.g. Summer Denim Streetwear, Casual Friday..."
						class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
					/>
				</div>

				<div class="flex items-center justify-end gap-2.5 pt-2">
					<button
						onclick={() => (showSaveModal = false)}
						class="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white"
					>
						Cancel
					</button>
					<button
						onclick={handleSaveOutfit}
						disabled={isSaving || !outfitName.trim()}
						class="px-5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition"
					>
						{#if isSaving}
							Saving...
						{:else}
							{editingOutfitId ? 'Update Outfit' : 'Save Outfit'}
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
