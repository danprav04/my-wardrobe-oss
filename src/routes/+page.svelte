<script lang="ts">
	import { 
		Search, 
		Plus, 
		Sparkles, 
		Trash2, 
		ExternalLink, 
		X, 
		Tag, 
		Shirt, 
		Footprints, 
		Scissors,
		Loader2,
		Camera,
		RotateCcw,
		Pencil,
		Check
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { AppLogo } from '$lib';

	let { data } = $props();

	let deletingIds = $state<string[]>([]);
	let deletedGarmentIds = $state<string[]>([]);

	// Edit Garment Modal State
	let editingGarment = $state<any | null>(null);
	let editName = $state('');
	let editFit = $state('');
	let editCategory = $state('');
	let editDescription = $state('');
	let editTags = $state<string[]>([]);
	let newTagInput = $state('');
	let isSavingEdit = $state(false);
	let editError = $state<string | null>(null);

	const FIT_OPTIONS = [
		{ value: '', label: 'Unspecified' },
		{ value: 'wide-leg', label: 'Wide-Leg / Baggy' },
		{ value: 'relaxed', label: 'Relaxed Fit' },
		{ value: 'straight-leg', label: 'Straight-Leg' },
		{ value: 'slim', label: 'Slim Fit' },
		{ value: 'skinny', label: 'Skinny' },
		{ value: 'oversized', label: 'Oversized' },
		{ value: 'boxy', label: 'Boxy' },
		{ value: 'cropped', label: 'Cropped' },
		{ value: 'regular', label: 'Regular Fit' }
	];

	function openEditModal(g: any) {
		editingGarment = g;
		editName = g.name || '';
		editFit = g.fit || '';
		editCategory = g.category || 'tops';
		editDescription = g.description || '';
		editTags = [...(g.tags || [])];
		newTagInput = '';
		editError = null;
	}

	function closeEditModal() {
		editingGarment = null;
		editError = null;
	}

	function addEditTag() {
		const clean = newTagInput.trim().toLowerCase().replace(/^#/, '');
		if (clean && !editTags.includes(clean)) {
			editTags = [...editTags, clean];
		}
		newTagInput = '';
	}

	function removeEditTag(index: number) {
		editTags = editTags.filter((_, i) => i !== index);
	}

	async function handleSaveEdit() {
		if (!editingGarment) return;
		if (!editName.trim()) {
			editError = 'Garment name is required.';
			return;
		}

		isSavingEdit = true;
		editError = null;

		try {
			const res = await fetch(`/api/garments/${editingGarment.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: editName.trim(),
					fit: editFit.trim() || null,
					category: editCategory,
					description: editDescription.trim(),
					tags: editTags
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || 'Failed to update garment');
			}

			closeEditModal();
			await invalidateAll();
		} catch (e: any) {
			editError = e.message || 'Error updating garment';
		} finally {
			isSavingEdit = false;
		}
	}

	// View modes: 'studio' (clean e-commerce flat-lay) vs 'source' (original camera crop verification)
	let globalViewMode = $state<'studio' | 'source'>('studio');
	let cardViews = $state<Record<string, 'studio' | 'source'>>({});

	// Derived garments automatically react to deletions and invalidateAll reloads
	let garments = $derived(data.garments.filter((g) => !deletedGarmentIds.includes(g.id)));

	let searchQuery = $state('');
	let selectedCategory = $state('all');
	let activeTag = $state<string | null>(null);

	const categories = [
		{ id: 'all', label: 'All Items' },
		{ id: 'tops', label: 'Tops' },
		{ id: 'bottoms', label: 'Bottoms' },
		{ id: 'shoes', label: 'Shoes' },
		{ id: 'outerwear', label: 'Outerwear' },
		{ id: 'accessories', label: 'Accessories' }
	];

	function getEffectiveView(garmentId: string): 'studio' | 'source' {
		return cardViews[garmentId] || globalViewMode;
	}

	function toggleCardView(garmentId: string) {
		const current = getEffectiveView(garmentId);
		cardViews[garmentId] = current === 'studio' ? 'source' : 'studio';
	}

	// Filter garments based on search, category, and active tag
	let filteredGarments = $derived(
		garments.filter((g) => {
			const matchesCategory = selectedCategory === 'all' || g.category === selectedCategory;
			const matchesTag = !activeTag || g.tags.includes(activeTag);
			const q = searchQuery.toLowerCase().trim();
			const matchesSearch =
				!q ||
				g.name.toLowerCase().includes(q) ||
				(g.description && g.description.toLowerCase().includes(q)) ||
				g.tags.some((t) => t.toLowerCase().includes(q));

			return matchesCategory && matchesTag && matchesSearch;
		})
	);

	// Extract popular tags
	let popularTags = $derived.by(() => {
		const counts: Record<string, number> = {};
		garments.forEach((g) => {
			g.tags.forEach((t) => {
				counts[t] = (counts[t] || 0) + 1;
			});
		});
		return Object.entries(counts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 12)
			.map(([tag]) => tag);
	});

	async function handleDelete(id: string, name: string) {
		if (!confirm(`Are you sure you want to remove "${name}" from your wardrobe?`)) return;

		deletingIds = [...deletingIds, id];
		try {
			const res = await fetch(`/api/garments/${id}`, { method: 'DELETE' });
			if (res.ok) {
				// Immediate optimistic update
				deletedGarmentIds = [...deletedGarmentIds, id];
				// Server re-sync
				await invalidateAll();
			} else {
				const err = await res.json().catch(() => ({}));
				alert('Failed to delete garment: ' + (err.message || res.statusText));
			}
		} catch (e: any) {
			alert('Error deleting item: ' + e.message);
		} finally {
			deletingIds = deletingIds.filter((delId) => delId !== id);
		}
	}
</script>

<div class="space-y-6">
	<!-- Top Banner / Search & Action Header -->
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Your Wardrobe</h1>
			<p class="text-sm text-zinc-400 mt-1">
				{garments.length} {garments.length === 1 ? 'item' : 'items'} in your smart digital closet
			</p>
		</div>

		<div class="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
			<!-- Global View Toggle (Studio vs Source) -->
			<div class="inline-flex p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
				<button
					onclick={() => (globalViewMode = 'studio')}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition {globalViewMode === 'studio'
						? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
						: 'text-zinc-400 hover:text-zinc-200'}"
				>
					<Sparkles class="w-3.5 h-3.5 {globalViewMode === 'studio' ? 'text-amber-300' : 'text-zinc-400'}" />
					<span>Studio View</span>
				</button>
				<button
					onclick={() => (globalViewMode = 'source')}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition {globalViewMode === 'source'
						? 'bg-zinc-800 text-white shadow-sm'
						: 'text-zinc-400 hover:text-zinc-200'}"
				>
					<Camera class="w-3.5 h-3.5 {globalViewMode === 'source' ? 'text-emerald-400' : 'text-zinc-400'}" />
					<span>Source Photos</span>
				</button>
			</div>

			<a
				href="/outfit/builder"
				class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700/60 transition shadow-sm"
			>
				<Sparkles class="w-4 h-4 text-amber-400" />
				<span>Build Fit</span>
			</a>
			<a
				href="/garment/add"
				class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm shadow-indigo-600/30"
			>
				<Plus class="w-4 h-4" />
				<span>Add Items</span>
			</a>
		</div>
	</div>

	<!-- Search & Filters Bar -->
	<div class="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-3.5 sm:p-4 space-y-3.5 backdrop-blur-sm shadow-sm">
		<div class="flex flex-col sm:flex-row gap-3">
			<!-- Search Field -->
			<div class="relative flex-1">
				<Search class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search by name, color, fabric, brand, style..."
					class="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
				/>
				{#if searchQuery}
					<button
						onclick={() => (searchQuery = '')}
						class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
					>
						<X class="w-4 h-4" />
					</button>
				{/if}
			</div>

			<!-- Category Pills -->
			<div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
				{#each categories as cat}
					<button
						onclick={() => (selectedCategory = cat.id)}
						class="px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all {selectedCategory === cat.id
							? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
							: 'bg-zinc-950/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80'}"
					>
						{cat.label}
					</button>
				{/each}
			</div>
		</div>

		<!-- Popular Tags Bar -->
		{#if popularTags.length > 0}
			<div class="flex items-center gap-1.5 flex-wrap pt-1 border-t border-zinc-800/60">
				<span class="text-[11px] font-medium text-zinc-500 flex items-center gap-1 mr-1">
					<Tag class="w-3 h-3" /> Tags:
				</span>
				{#if activeTag}
					<button
						onclick={() => (activeTag = null)}
						class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
					>
						<span>#{activeTag}</span>
						<X class="w-3 h-3" />
					</button>
				{/if}
				{#each popularTags as tag}
					{#if tag !== activeTag}
						<button
							onclick={() => (activeTag = tag)}
							class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-950/60 text-zinc-400 hover:text-zinc-200 border border-zinc-800/70 hover:border-zinc-700 transition"
						>
							#{tag}
						</button>
					{/if}
				{/each}
			</div>
		{/if}
	</div>

	<!-- Garment Cards Grid -->
	{#if filteredGarments.length === 0}
		<div class="text-center py-16 px-4 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-3xl">
			{#if garments.length === 0}
				<div class="mb-5 flex justify-center">
					<AppLogo size={56} class="shadow-xl shadow-indigo-500/25" />
				</div>
			{:else}
				<div class="w-14 h-14 rounded-2xl bg-zinc-800/80 flex items-center justify-center mx-auto mb-4 text-zinc-400">
					<Shirt class="w-7 h-7" />
				</div>
			{/if}
			<h3 class="text-lg font-semibold text-zinc-200">
				{garments.length === 0 ? 'Your wardrobe is empty' : 'No matching items found'}
			</h3>
			<p class="text-sm text-zinc-400 max-w-sm mx-auto mt-1 mb-6">
				{garments.length === 0
					? 'Take a photo of your clothes laid out on your bed or floor, and our AI will stage and organize your catalog automatically.'
					: 'Try adjusting your search query, clearing your tag filters, or selecting a different category.'}
			</p>
			{#if garments.length === 0}
				<a
					href="/garment/add"
					class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm shadow-indigo-600/30"
				>
					<Plus class="w-4 h-4" />
					<span>Upload Your First Item</span>
				</a>
			{:else}
				<button
					onclick={() => {
						searchQuery = '';
						selectedCategory = 'all';
						activeTag = null;
					}}
					class="px-4 py-2 rounded-xl text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
				>
					Clear All Filters
				</button>
			{/if}
		</div>
	{:else}
		<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4 sm:gap-6">
			{#each filteredGarments as garment (garment.id)}
				{@const currentMode = getEffectiveView(garment.id)}
				{@const isSingleImage = !garment.imageUrl || garment.imageUrl === garment.cropPath || garment.imageUrl === `/api/storage/${garment.cropPath}`}
				{@const isStudio = currentMode === 'studio'}
				{@const displayUrl = isStudio && !isSingleImage
					? garment.imageUrl
					: (garment.cropPath ? `/api/storage/${garment.cropPath}` : garment.imageUrl)}

				<div class="group relative bg-zinc-900/70 border border-zinc-800/80 rounded-2xl overflow-hidden hover:border-zinc-700/80 transition-all duration-200 flex flex-col shadow-sm hover:shadow-md {deletingIds.includes(garment.id) ? 'opacity-40 pointer-events-none' : ''}">
					<!-- Image Area -->
					<div class="aspect-square bg-zinc-950 relative overflow-hidden flex items-center justify-center p-3 select-none">
						<img
							src={displayUrl}
							alt={garment.name}
							loading="lazy"
							class="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
							onerror={(e) => {
								// fallback to crop path if external staging url fails
								const target = e.currentTarget as HTMLImageElement;
								if (garment.cropPath && !target.src.includes(garment.cropPath)) {
									target.src = `/api/storage/${garment.cropPath}`;
								}
							}}
						/>

						<!-- Studio / Source Pill & Flip Button -->
						<div class="absolute top-2.5 left-2.5 z-10">
							{#if isSingleImage}
								<span
									class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider backdrop-blur-md bg-emerald-950/80 text-emerald-300 border border-emerald-700/60"
									title="Catalog product shot: original cutout used as display"
								>
									<Camera class="w-3 h-3 text-emerald-300" />
									<span>Catalog</span>
								</span>
							{:else}
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										toggleCardView(garment.id);
									}}
									title={isStudio ? 'Click to verify original camera crop' : 'Click to view AI studio flat-lay'}
									class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all backdrop-blur-md cursor-pointer {isStudio
										? 'bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 hover:bg-indigo-900'
										: 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 hover:bg-emerald-900'}"
								>
									{#if isStudio}
										<Sparkles class="w-3 h-3 text-amber-300" />
										<span>Studio</span>
									{:else}
										<Camera class="w-3 h-3 text-emerald-300" />
										<span>Source</span>
									{/if}
									<RotateCcw class="w-2.5 h-2.5 ml-0.5 opacity-60" />
								</button>
							{/if}
						</div>

						<!-- Quick Actions Overlay -->
						<div class="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 z-10">
							<!-- Flip View Button (only if studio and source differ) -->
							{#if !isSingleImage}
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										toggleCardView(garment.id);
									}}
									title={isStudio ? 'Show original source photo' : 'Show retail studio flat-lay'}
									class="p-1.5 rounded-lg bg-zinc-900/90 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-zinc-700/60 backdrop-blur-sm transition"
								>
									<RotateCcw class="w-3.5 h-3.5" />
								</button>
							{/if}

							<!-- Edit Garment Details & Fit -->
							<button
								type="button"
								onclick={(e) => {
									e.stopPropagation();
									openEditModal(garment);
								}}
								title="Edit Garment Details & Fit"
								class="p-1.5 rounded-lg bg-zinc-900/90 text-zinc-300 hover:text-indigo-400 hover:bg-zinc-800 border border-zinc-700/60 backdrop-blur-sm transition"
							>
								<Pencil class="w-3.5 h-3.5" />
							</button>

							<!-- Delete Garment -->
							<button
								type="button"
								onclick={(e) => {
									e.stopPropagation();
									handleDelete(garment.id, garment.name);
								}}
								disabled={deletingIds.includes(garment.id)}
								title="Delete Garment"
								class="p-1.5 rounded-lg bg-zinc-900/90 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 disabled:opacity-50 border border-zinc-700/60 backdrop-blur-sm transition"
							>
								{#if deletingIds.includes(garment.id)}
									<Loader2 class="w-3.5 h-3.5 animate-spin text-red-400" />
								{:else}
									<Trash2 class="w-3.5 h-3.5" />
								{/if}
							</button>
						</div>

						<!-- Category & Fit Pills Bottom-Left on Image -->
						<div class="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
							<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-black/70 text-zinc-300 backdrop-blur-sm">
								{garment.category}
							</span>
							{#if garment.fit}
								<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-indigo-950/90 text-indigo-300 border border-indigo-700/60 backdrop-blur-sm">
									{garment.fit}
								</span>
							{/if}
						</div>
					</div>

					<!-- Details Area -->
					<div class="p-3.5 flex-1 flex flex-col justify-between space-y-2">
						<div>
							<h4 class="font-bold text-sm text-zinc-100 line-clamp-1 group-hover:text-indigo-400 transition">
								{garment.name}
							</h4>
							{#if garment.description}
								<p class="text-xs text-zinc-400 line-clamp-2 mt-0.5 leading-relaxed">
									{garment.description}
								</p>
							{/if}
						</div>

						<!-- Tag Chips -->
						{#if garment.tags.length > 0}
							<div class="flex items-center gap-1 flex-wrap pt-1">
								{#each garment.tags.slice(0, 3) as tag}
									<button
										onclick={() => (activeTag = tag)}
										class="text-[10px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-950 px-2 py-0.5 rounded-md border border-zinc-800"
									>
										#{tag}
									</button>
								{/each}
								{#if garment.tags.length > 3}
									<span class="text-[10px] text-zinc-500 font-medium">+{garment.tags.length - 3}</span>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Edit Garment Modal -->
	{#if editingGarment}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
			role="dialog"
			aria-modal="true"
		>
			<div class="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
				<!-- Modal Header -->
				<div class="p-5 border-b border-zinc-800 flex items-center justify-between">
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
							<Pencil class="w-5 h-5" />
						</div>
						<div>
							<h3 class="text-base font-bold text-zinc-100">Edit Garment Details</h3>
							<p class="text-xs text-zinc-400">Configure name, cut, fit, and style tags</p>
						</div>
					</div>

					<button
						onclick={closeEditModal}
						class="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
					>
						<X class="w-5 h-5" />
					</button>
				</div>

				<!-- Modal Body (Scrollable) -->
				<div class="p-6 space-y-4 overflow-y-auto">
					{#if editError}
						<div class="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
							{editError}
						</div>
					{/if}

					<!-- Item Name -->
					<div>
						<label for="edit-garment-name" class="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
							Garment Name
						</label>
						<input
							id="edit-garment-name"
							type="text"
							bind:value={editName}
							placeholder="e.g. Classic Wide-Leg Denim Jeans"
							class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
						/>
					</div>

					<!-- Category & Fit / Cut -->
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label for="edit-garment-category" class="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
								Category
							</label>
							<select
								id="edit-garment-category"
								bind:value={editCategory}
								class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
							>
								<option value="tops">Tops</option>
								<option value="bottoms">Bottoms</option>
								<option value="shoes">Shoes</option>
								<option value="outerwear">Outerwear</option>
								<option value="accessories">Accessories</option>
							</select>
						</div>

						<div>
							<label for="edit-garment-fit" class="block text-[11px] font-semibold text-indigo-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
								<span>Fit / Cut</span>
								<span class="text-[10px] text-zinc-500 font-normal">Try-on drape</span>
							</label>
							<select
								id="edit-garment-fit"
								bind:value={editFit}
								class="w-full bg-zinc-950 border border-indigo-700/40 rounded-xl px-3 py-2.5 text-sm text-indigo-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
							>
								{#each FIT_OPTIONS as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>
					</div>

					<!-- Description -->
					<div>
						<label for="edit-garment-desc" class="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
							Description & Drape Notes
						</label>
						<textarea
							id="edit-garment-desc"
							rows="2"
							bind:value={editDescription}
							placeholder="Detailed fabric weave, cut, wash, and drape..."
							class="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
						></textarea>
					</div>

					<!-- Tags -->
					<div>
						<span class="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
							Style & Fit Tags
						</span>
						<div class="flex flex-wrap items-center gap-1.5 mb-2.5">
							{#each editTags as tag, tIdx}
								<span class="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-zinc-950 text-zinc-300 border border-zinc-800">
									#{tag}
									<button
										type="button"
										onclick={() => removeEditTag(tIdx)}
										class="text-zinc-500 hover:text-red-400 transition"
									>
										<X class="w-3 h-3" />
									</button>
								</span>
							{/each}
						</div>

						<div class="flex items-center gap-2">
							<input
								type="text"
								bind:value={newTagInput}
								placeholder="Add tag (e.g. wide-leg, streetwear)..."
								onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addEditTag())}
								class="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
							/>
							<button
								type="button"
								onclick={addEditTag}
								class="px-3 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
							>
								Add
							</button>
						</div>
					</div>
				</div>

				<!-- Modal Footer -->
				<div class="p-5 border-t border-zinc-800 flex items-center justify-end gap-3 bg-zinc-900/60">
					<button
						type="button"
						onclick={closeEditModal}
						disabled={isSavingEdit}
						class="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={handleSaveEdit}
						disabled={isSavingEdit}
						class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition shadow-sm shadow-indigo-600/30"
					>
						{#if isSavingEdit}
							<Loader2 class="w-3.5 h-3.5 animate-spin" />
							<span>Saving...</span>
						{:else}
							<Check class="w-3.5 h-3.5" />
							<span>Save Changes</span>
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
