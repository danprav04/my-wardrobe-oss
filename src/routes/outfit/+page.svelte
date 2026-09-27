<script lang="ts">
	import { 
		FolderHeart, 
		Plus, 
		Sparkles, 
		Trash2, 
		Eye, 
		Calendar, 
		Shirt, 
		Footprints, 
		ExternalLink,
		Loader2,
		Pencil,
		RotateCcw,
		X
	} from '@lucide/svelte';
	import { invalidateAll, goto } from '$app/navigation';

	let { data } = $props();

	let deletingOutfitIds = $state<string[]>([]);
	let deletedOutfitIds = $state<string[]>([]);
	let tryingOnOutfitIds = $state<string[]>([]);
	let clearingOutfitIds = $state<string[]>([]);
	let updatedTryonUrls = $state<Record<string, string>>({});

	let outfits = $derived(data.outfits.filter((o) => !deletedOutfitIds.includes(o.id)));

	async function handleDeleteOutfit(id: string, name: string) {
		if (!confirm(`Are you sure you want to delete the outfit "${name}"?`)) return;

		deletingOutfitIds = [...deletingOutfitIds, id];
		try {
			const res = await fetch(`/api/outfits/${id}`, { method: 'DELETE' });
			if (res.ok) {
				deletedOutfitIds = [...deletedOutfitIds, id];
				await invalidateAll();
			} else {
				const err = await res.json().catch(() => ({}));
				alert('Failed to delete outfit: ' + (err.message || res.statusText));
			}
		} catch (e: any) {
			alert('Error deleting outfit: ' + e.message);
		} finally {
			deletingOutfitIds = deletingOutfitIds.filter((delId) => delId !== id);
		}
	}

	async function handleClearTryOn(id: string, name: string) {
		if (!confirm(`Clear the virtual try-on render for "${name}"? You can re-generate it at any time.`)) return;

		clearingOutfitIds = [...clearingOutfitIds, id];
		try {
			const res = await fetch(`/api/outfits/${id}/tryon`, { method: 'DELETE' });
			if (res.ok) {
				updatedTryonUrls = { ...updatedTryonUrls, [id]: '' };
				await invalidateAll();
			} else {
				const err = await res.json().catch(() => ({}));
				alert('Failed to clear try-on: ' + (err.message || res.statusText));
			}
		} catch (e: any) {
			alert('Error clearing try-on: ' + e.message);
		} finally {
			clearingOutfitIds = clearingOutfitIds.filter((cid) => cid !== id);
		}
	}

	async function handleTryOnOutfit(outfit: any) {
		if (!data.hasPortrait) {
			alert('Please upload your full-body portrait photo in Settings before generating a Virtual Try-On.');
			await goto('/settings');
			return;
		}

		const topItem = outfit.items.find((i: any) => i.slot === 'top');
		const bottomItem = outfit.items.find((i: any) => i.slot === 'bottom');
		const shoesItem = outfit.items.find((i: any) => i.slot === 'shoes');

		if (!topItem && !bottomItem && !shoesItem) {
			alert('This outfit does not have any top, bottom, or shoes to try on.');
			return;
		}

		tryingOnOutfitIds = [...tryingOnOutfitIds, outfit.id];
		try {
			const res = await fetch('/api/tryon', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					outfitId: outfit.id,
					slots: {
						top: topItem?.id,
						bottom: bottomItem?.id,
						shoes: shoesItem?.id
					}
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || 'Virtual try-on failed to process');
			}

			const result = await res.json();
			updatedTryonUrls = { ...updatedTryonUrls, [outfit.id]: result.tryonUrl };
			await invalidateAll();
		} catch (e: any) {
			alert('Virtual Try-On notice: ' + e.message);
		} finally {
			tryingOnOutfitIds = tryingOnOutfitIds.filter((id) => id !== outfit.id);
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Saved Outfits</h1>
			<p class="text-sm text-zinc-400 mt-1">
				{outfits.length} curated {outfits.length === 1 ? 'look' : 'looks'} in your collection
			</p>
		</div>

		<a
			href="/outfit/builder"
			class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm shadow-indigo-600/30"
		>
			<Plus class="w-4 h-4" />
			<span>Build New Fit</span>
		</a>
	</div>

	<!-- Outfits List -->
	{#if outfits.length === 0}
		<div class="text-center py-16 px-4 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-3xl">
			<div class="w-14 h-14 rounded-2xl bg-zinc-800/80 flex items-center justify-center mx-auto mb-4 text-zinc-400">
				<FolderHeart class="w-7 h-7" />
			</div>
			<h3 class="text-lg font-semibold text-zinc-200">No saved outfits yet</h3>
			<p class="text-sm text-zinc-400 max-w-sm mx-auto mt-1 mb-6">
				Combine garments and shoes in the Outfit Builder to save and preview your favorite looks.
			</p>
			<a
				href="/outfit/builder"
				class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm shadow-indigo-600/30"
			>
				<Sparkles class="w-4 h-4" />
				<span>Open Outfit Builder</span>
			</a>
		</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
			{#each outfits as outfit (outfit.id)}
				{@const currentTryonUrl = outfit.id in updatedTryonUrls ? updatedTryonUrls[outfit.id] : outfit.tryonUrl}
				{@const isBusy = deletingOutfitIds.includes(outfit.id) || tryingOnOutfitIds.includes(outfit.id)}
				{@const isTryingOnThis = tryingOnOutfitIds.includes(outfit.id)}

				<div class="bg-zinc-900/80 border border-zinc-800/80 rounded-3xl p-5 space-y-4 flex flex-col justify-between shadow-sm hover:border-zinc-700 transition {deletingOutfitIds.includes(outfit.id) ? 'opacity-40 pointer-events-none' : ''}">
					<!-- Header of Card -->
					<div class="flex items-start justify-between gap-3">
						<div>
							<h3 class="font-bold text-lg text-white line-clamp-1">{outfit.name}</h3>
							<p class="text-xs text-zinc-500 flex items-center gap-1.5 mt-0.5">
								<Calendar class="w-3 h-3" />
								<span>{new Date(outfit.createdAt).toLocaleDateString()}</span>
								<span>•</span>
								<span>{outfit.items.length} items</span>
							</p>
						</div>

						<div class="flex items-center gap-1">
							<a
								href="/outfit/builder?edit={outfit.id}"
								title="Edit Outfit in Builder"
								class="p-2 rounded-xl text-zinc-400 hover:text-indigo-400 hover:bg-zinc-800 transition"
							>
								<Pencil class="w-4 h-4" />
							</a>

							<button
								onclick={() => handleDeleteOutfit(outfit.id, outfit.name)}
								disabled={isBusy}
								title="Delete Outfit"
								class="p-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-zinc-800 disabled:opacity-50 transition"
							>
								{#if deletingOutfitIds.includes(outfit.id)}
									<Loader2 class="w-4 h-4 animate-spin text-red-400" />
								{:else}
									<Trash2 class="w-4 h-4" />
								{/if}
							</button>
						</div>
					</div>

					<!-- Visual Layout / Try-On or Items Grid -->
					{#if currentTryonUrl}
						<!-- If Try-On Composite exists -->
						<div class="space-y-3">
							<div class="h-72 bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 flex items-center justify-center p-2 relative group shadow-inner">
								<img src={currentTryonUrl} alt="Try-On composite" class="max-h-full max-w-full object-contain" />
								<span class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-600/90 text-white backdrop-blur-sm flex items-center gap-1 shadow-sm">
									<Eye class="w-3 h-3" />
									Virtual Try-On Render
								</span>
								<button
									onclick={() => handleClearTryOn(outfit.id, outfit.name)}
									disabled={isBusy || clearingOutfitIds.includes(outfit.id)}
									title="Clear Try-On Render"
									class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-900/90 hover:bg-red-600/90 text-zinc-300 hover:text-white backdrop-blur-sm border border-zinc-700/80 transition flex items-center gap-1 shadow-sm opacity-80 group-hover:opacity-100"
								>
									{#if clearingOutfitIds.includes(outfit.id)}
										<Loader2 class="w-3 h-3 animate-spin text-red-400" />
										<span>Clearing...</span>
									{:else}
										<X class="w-3 h-3" />
										<span>Clear Render</span>
									{/if}
								</button>
							</div>

							<!-- Mini Thumbnails Row -->
							<div class="grid grid-cols-4 sm:grid-cols-5 gap-2">
								{#each outfit.items as item}
									<div class="aspect-square bg-zinc-950 rounded-xl p-1.5 border border-zinc-800 flex items-center justify-center relative group" title="{item.name} ({item.slot})">
										<img src={item.imageUrl} alt={item.name} class="max-h-full max-w-full object-contain" />
										<span class="absolute bottom-1 right-1 text-[8px] font-bold uppercase bg-zinc-900/90 px-1 rounded text-zinc-400">
											{item.slot}
										</span>
									</div>
								{/each}
							</div>
						</div>
					{:else}
						<!-- Horizontal stack of slotted garment thumbnails -->
						<div class="grid grid-cols-4 gap-2">
							{#each outfit.items.slice(0, 4) as item}
								<div class="aspect-square bg-zinc-950 rounded-xl p-1.5 border border-zinc-800 flex items-center justify-center relative">
									<img src={item.imageUrl} alt={item.name} class="max-h-full max-w-full object-contain" />
									<span class="absolute bottom-1 right-1 text-[8px] font-bold uppercase bg-zinc-900/90 px-1 rounded text-zinc-400">
										{item.slot}
									</span>
								</div>
							{/each}
						</div>
					{/if}

					<!-- Items List -->
					<div class="space-y-1.5 pt-2 border-t border-zinc-800/80">
						{#each outfit.items as item}
							<div class="flex items-center justify-between text-xs">
								<span class="text-zinc-300 font-medium truncate flex-1">{item.name}</span>
								<span class="text-zinc-500 uppercase text-[10px] font-bold shrink-0 ml-2">
									{item.slot}
								</span>
							</div>
						{/each}
					</div>

					<!-- Card Action Footer: Try On Me & Edit -->
					<div class="flex items-center gap-2 pt-3 border-t border-zinc-800/80">
						<button
							onclick={() => handleTryOnOutfit(outfit)}
							disabled={isBusy}
							class="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold {currentTryonUrl ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30'} disabled:opacity-50 transition"
						>
							{#if isTryingOnThis}
								<Loader2 class="w-4 h-4 animate-spin text-indigo-400" />
								<span>Generating Try-On...</span>
							{:else if currentTryonUrl}
								<RotateCcw class="w-3.5 h-3.5 text-zinc-400" />
								<span>Re-generate Try-On</span>
							{:else}
								<Eye class="w-3.5 h-3.5" />
								<span>Try On Me</span>
							{/if}
						</button>

						<a
							href="/outfit/builder?edit={outfit.id}"
							class="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
							title="Edit Outfit"
						>
							<Pencil class="w-3.5 h-3.5" />
							<span>Edit Fit</span>
						</a>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
