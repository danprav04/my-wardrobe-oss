<script lang="ts">
	import { 
		Upload, 
		Camera, 
		Sparkles, 
		Check, 
		X, 
		Trash2, 
		ArrowRight, 
		Image as ImageIcon,
		AlertCircle,
		Plus,
		Loader2
	} from '@lucide/svelte';
	import { goto } from '$app/navigation';

	interface DetectedItem {
		tempId: string;
		name: string;
		description: string;
		category: 'tops' | 'bottoms' | 'shoes' | 'outerwear' | 'accessories';
		fit?: string;
		tags: string[];
		stagedImageUrl: string;
		cropUrl: string;
		cropPath: string;
		originalPath: string;
		bbox: [number, number, number, number];
		isProductShot?: boolean;
		newTagInput?: string;
	}

	let fileInput = $state<HTMLInputElement | null>(null);
	let isCompressing = $state(false);
	let isProcessing = $state(false);
	let processingStep = $state('');
	let errorMessage = $state<string | null>(null);
	let detectedItems = $state<DetectedItem[]>([]);
	let sourcePhotoId = $state<string | null>(null);
	let originalPhotoPath = $state<string | null>(null);
	let originalSizeMB = $state(0);
	let compressedSizeMB = $state(0);
	let isSaving = $state(false);
	let flippedCards = $state<Record<string, boolean>>({});

	function toggleCardFlip(tempId: string) {
		flippedCards[tempId] = !flippedCards[tempId];
	}

	// Client-side canvas compression for high-res mobile photos
	async function compressImage(file: File, maxDim = 2048, quality = 0.85): Promise<Blob> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			const reader = new FileReader();

			reader.onload = (e) => {
				img.src = e.target?.result as string;
			};
			reader.onerror = reject;

			img.onload = () => {
				const canvas = document.createElement('canvas');
				let width = img.width;
				let height = img.height;

				if (width > maxDim || height > maxDim) {
					if (width > height) {
						height = Math.round((height * maxDim) / width);
						width = maxDim;
					} else {
						width = Math.round((width * maxDim) / height);
						height = maxDim;
					}
				}

				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					resolve(file);
					return;
				}

				ctx.drawImage(img, 0, 0, width, height);
				canvas.toBlob(
					(blob) => {
						if (blob) resolve(blob);
						else resolve(file);
					},
					'image/jpeg',
					quality
				);
			};

			reader.readAsDataURL(file);
		});
	}

	async function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		if (!target.files || target.files.length === 0) return;

		const file = target.files[0];
		originalSizeMB = +(file.size / (1024 * 1024)).toFixed(2);
		errorMessage = null;

		try {
			// Step 1: Compress
			isCompressing = true;
			processingStep = 'Compressing high-resolution photo...';
			const compressedBlob = await compressImage(file);
			compressedSizeMB = +(compressedBlob.size / (1024 * 1024)).toFixed(2);
			isCompressing = false;

			// Step 2: Upload and process
			isProcessing = true;
			processingStep = 'Gemini 3.5 Flash-Lite detecting garments in photo...';

			const formData = new FormData();
			formData.append('photo', compressedBlob, file.name);

			const res = await fetch('/api/upload', {
				method: 'POST',
				body: formData
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Failed to analyze photo');
			}

			const data = await res.json();
			sourcePhotoId = data.sourcePhotoId;
			originalPhotoPath = data.originalPath;
			detectedItems = data.candidates.map((item: any) => ({
				...item,
				newTagInput: ''
			}));

			isProcessing = false;
		} catch (err: any) {
			console.error(err);
			errorMessage = err.message || 'Error processing photo. Please try again.';
			isCompressing = false;
			isProcessing = false;
		}
	}

	function removeItem(index: number) {
		detectedItems = detectedItems.filter((_, i) => i !== index);
	}

	function addTag(itemIndex: number) {
		const item = detectedItems[itemIndex];
		if (!item.newTagInput || !item.newTagInput.trim()) return;
		const clean = item.newTagInput.trim().replace(/^#/, '');
		if (!item.tags.includes(clean)) {
			item.tags = [...item.tags, clean];
		}
		item.newTagInput = '';
	}

	function removeTag(itemIndex: number, tagIndex: number) {
		detectedItems[itemIndex].tags = detectedItems[itemIndex].tags.filter((_, i) => i !== tagIndex);
	}

	async function saveAllItems() {
		if (detectedItems.length === 0) return;
		isSaving = true;

		try {
			const payload = detectedItems.map((item) => ({
				name: item.name,
				description: item.description,
				category: item.category,
				fit: item.fit || null,
				tags: item.tags,
				imageUrl: item.stagedImageUrl || item.cropUrl,
				cropPath: item.cropPath,
				originalPath: originalPhotoPath,
				sourcePhotoId
			}));

			const res = await fetch('/api/garments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				throw new Error('Failed to save garments to database');
			}

			// Success -> redirect to wardrobe catalog
			await goto('/');
		} catch (err: any) {
			errorMessage = err.message || 'Error saving items';
			isSaving = false;
		}
	}
</script>

<div class="max-w-4xl mx-auto space-y-8">
	<!-- Page Header -->
	<div>
		<h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Add Items to Wardrobe</h1>
		<p class="text-sm text-zinc-400 mt-1">
			Take a photo on your bed or floor with one or multiple garments/shoes. Our AI will detect, crop, stage, and tag each piece automatically.
		</p>
	</div>

	<!-- Error Alert -->
	{#if errorMessage}
		<div class="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-300 text-sm">
			<AlertCircle class="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
			<div class="flex-1">
				<p class="font-semibold">Processing Notice</p>
				<p class="text-xs text-red-400/90 mt-0.5">{errorMessage}</p>
			</div>
			<button onclick={() => (errorMessage = null)} class="text-red-400 hover:text-red-200">
				<X class="w-4 h-4" />
			</button>
		</div>
	{/if}

	<!-- Upload Zone (if no items detected yet) -->
	{#if detectedItems.length === 0 && !isProcessing && !isCompressing}
		<div
			class="border-2 border-dashed border-zinc-800 hover:border-indigo-500/60 bg-zinc-900/40 hover:bg-zinc-900/70 rounded-3xl p-8 sm:p-12 text-center transition-all cursor-pointer group"
			onclick={() => fileInput?.click()}
			onkeydown={(e) => e.key === 'Enter' && fileInput?.click()}
			role="button"
			tabindex="0"
		>
			<input
				type="file"
				accept="image/*"
				bind:this={fileInput}
				onchange={handleFileSelect}
				class="hidden"
			/>

			<div class="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
				<Camera class="w-8 h-8" />
			</div>

			<h3 class="text-lg font-bold text-zinc-200">Take or upload a photo</h3>
			<p class="text-sm text-zinc-400 max-w-md mx-auto mt-1 mb-6">
				Supports high-res mobile photos. Clothes or shoes can be laid out together on a bed, couch, or floor.
			</p>

			<div class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm shadow-indigo-600/30">
				<Upload class="w-4 h-4" />
				<span>Select Photo</span>
			</div>
		</div>
	{/if}

	<!-- Processing / Loading State -->
	{#if isCompressing || isProcessing}
		<div class="py-16 px-6 bg-zinc-900/60 border border-zinc-800 rounded-3xl text-center space-y-4">
			<div class="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto animate-pulse">
				<Sparkles class="w-8 h-8 animate-spin" />
			</div>

			<div class="space-y-1">
				<h3 class="text-lg font-bold text-zinc-200">Analyzing Your Wardrobe Photo</h3>
				<p class="text-sm text-indigo-400 font-medium">{processingStep}</p>
			</div>

			{#if originalSizeMB > 0}
				<div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/60">
					<span>Optimized: {originalSizeMB} MB → {compressedSizeMB} MB</span>
				</div>
			{/if}

			<div class="max-w-xs mx-auto pt-2">
				<div class="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
					<div class="bg-indigo-500 h-full rounded-full animate-pulse w-3/4"></div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Detected Items Review Gallery -->
	{#if detectedItems.length > 0 && !isProcessing}
		<div class="space-y-6">
			<div class="flex items-center justify-between pb-2 border-b border-zinc-800">
				<div>
					<h2 class="text-lg font-bold text-zinc-100">
						Detected {detectedItems.length} {detectedItems.length === 1 ? 'Item' : 'Items'}
					</h2>
					<p class="text-xs text-zinc-400">Review, adjust tags and details before adding to your wardrobe.</p>
				</div>

				<button
					onclick={() => {
						detectedItems = [];
						sourcePhotoId = null;
					}}
					class="text-xs font-semibold text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-lg hover:bg-zinc-800"
				>
					Upload Different Photo
				</button>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				{#each detectedItems as item, idx (item.tempId)}
					<div class="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col shadow-sm">
						<!-- Visual Preview Header -->
						<div class="aspect-[4/3] bg-zinc-950 relative flex items-center justify-center p-4 border-b border-zinc-800">
							<img
								src={flippedCards[item.tempId] ? item.cropUrl : (item.stagedImageUrl || item.cropUrl)}
								alt={item.name}
								class="max-h-full max-w-full object-contain transition-all duration-200"
								onerror={(e) => {
									const target = e.currentTarget as HTMLImageElement;
									if (!target.src.includes(item.cropUrl)) target.src = item.cropUrl;
								}}
							/>

							<!-- Flip / View Mode Badge -->
							{#if item.stagedImageUrl && item.stagedImageUrl !== item.cropUrl}
								<button
									onclick={() => toggleCardFlip(item.tempId)}
									type="button"
									class="absolute top-3 left-3 px-2 py-1 rounded-lg text-[10px] font-bold tracking-wider flex items-center gap-1.5 transition-all shadow-md {flippedCards[item.tempId] ? 'bg-zinc-800 text-zinc-300 border border-zinc-700' : 'bg-indigo-950/90 text-indigo-300 border border-indigo-700/60'}"
									title="Flip between retail studio flat-lay and source camera crop"
								>
									<Sparkles class="w-3 h-3" />
									<span>{flippedCards[item.tempId] ? '📷 SOURCE' : '✨ STUDIO'}</span>
								</button>
							{:else}
								<span
									class="absolute top-3 left-3 px-2 py-1 rounded-lg text-[10px] font-bold tracking-wider flex items-center gap-1.5 bg-emerald-950/90 text-emerald-300 border border-emerald-700/60 shadow-md"
									title="Catalog product shot: cutout is used directly as both source and display"
								>
									<Camera class="w-3 h-3" />
									<span>📷 CATALOG</span>
								</span>
							{/if}

							<!-- Delete/Reject Button -->
							<button
								onclick={() => removeItem(idx)}
								title="Discard item"
								type="button"
								class="absolute top-3 right-3 p-1.5 rounded-lg bg-zinc-900/90 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 border border-zinc-700/60 transition"
							>
								<Trash2 class="w-4 h-4" />
							</button>

							<!-- Category Tag -->
							<span class="absolute bottom-3 left-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-900/90 text-zinc-200 border border-zinc-700">
								{item.category}
							</span>
						</div>

						<!-- Editable Fields Form -->
						<div class="p-4 space-y-3.5 flex-1 flex flex-col justify-between">
							<div class="space-y-3">
								<!-- Name -->
								<div>
									<label for="garment-name-{idx}" class="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
										Item Name
									</label>
									<input
										id="garment-name-{idx}"
										type="text"
										bind:value={item.name}
										class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
									/>
								</div>

								<!-- Category, Fit & Description -->
								<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
									<div class="col-span-1">
										<label for="garment-category-{idx}" class="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
											Category
										</label>
										<select
											id="garment-category-{idx}"
											bind:value={item.category}
											class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
										>
											<option value="tops">Tops</option>
											<option value="bottoms">Bottoms</option>
											<option value="shoes">Shoes</option>
											<option value="outerwear">Outerwear</option>
											<option value="accessories">Accessories</option>
										</select>
									</div>

									<div class="col-span-1">
										<label for="garment-fit-{idx}" class="block text-[11px] font-semibold text-indigo-400 uppercase tracking-wider mb-1">
											Fit / Cut
										</label>
										<select
											id="garment-fit-{idx}"
											bind:value={item.fit}
											class="w-full bg-zinc-950 border border-indigo-700/50 rounded-xl px-2 py-1.5 text-xs text-indigo-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
										>
											<option value="">Auto / Standard</option>
											<option value="wide-leg">Wide-Leg / Baggy</option>
											<option value="relaxed">Relaxed Fit</option>
											<option value="straight-leg">Straight-Leg</option>
											<option value="slim">Slim Fit</option>
											<option value="skinny">Skinny</option>
											<option value="oversized">Oversized</option>
											<option value="boxy">Boxy</option>
											<option value="cropped">Cropped</option>
											<option value="regular">Regular Fit</option>
										</select>
									</div>

									<div class="col-span-2">
										<label for="garment-desc-{idx}" class="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
											Description
										</label>
										<input
											id="garment-desc-{idx}"
											type="text"
											bind:value={item.description}
											placeholder="Short description..."
											class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
										/>
									</div>
								</div>

								<!-- Tags -->
								<div>
									<span class="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
										Tags
									</span>
									<div class="flex flex-wrap items-center gap-1.5 mb-2">
										{#each item.tags as tag, tIdx}
											<span class="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
												#{tag}
												<button
													onclick={() => removeTag(idx, tIdx)}
													class="hover:text-red-400"
												>
													<X class="w-3 h-3" />
												</button>
											</span>
										{/each}
									</div>

									<!-- Add Tag Input -->
									<div class="flex items-center gap-1.5">
										<input
											type="text"
											bind:value={item.newTagInput}
											placeholder="Add tag (e.g. denim, black)..."
											onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag(idx))}
											class="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
										/>
										<button
											onclick={() => addTag(idx)}
											class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
										>
											Add
										</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Bottom Action Bar -->
			<div class="sticky bottom-20 md:bottom-6 z-20 bg-zinc-950/90 backdrop-blur-md p-4 rounded-2xl border border-zinc-800 flex items-center justify-between shadow-xl">
				<p class="text-sm text-zinc-300 font-medium">
					Ready to save <strong class="text-white">{detectedItems.length}</strong> items to your wardrobe
				</p>

				<button
					onclick={saveAllItems}
					disabled={isSaving}
					class="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition shadow-lg shadow-indigo-600/30"
				>
					{#if isSaving}
						<Loader2 class="w-4 h-4 animate-spin" />
						<span>Saving to Catalog...</span>
					{:else}
						<Check class="w-4 h-4" />
						<span>Save All Items</span>
					{/if}
				</button>
			</div>
		</div>
	{/if}
</div>
