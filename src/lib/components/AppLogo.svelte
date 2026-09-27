<script lang="ts">
	interface Props {
		size?: number;
		variant?: 'badge' | 'glyph';
		withText?: boolean;
		class?: string;
		href?: string | null;
	}

	let {
		size = 36,
		variant = 'badge',
		withText = false,
		class: customClass = '',
		href = null
	}: Props = $props();

	// Unique ID prefix for gradients to prevent SVG ID collisions across multiple instances
	const id = Math.random().toString(36).substring(2, 9);
</script>

{#snippet iconContent()}
	<div
		class="relative inline-flex items-center justify-center shrink-0 transition-transform duration-200 select-none {customClass}"
		style="width: {size}px; height: {size}px;"
	>
		{#if variant === 'badge'}
			<!-- Full Luxury Squircle Brand Badge -->
			<svg
				viewBox="0 0 512 512"
				class="w-full h-full drop-shadow-md"
				aria-hidden="true"
			>
				<defs>
					<linearGradient id="bg-{id}" x1="15%" y1="95%" x2="85%" y2="5%">
						<stop offset="0%" stop-color="#312e81" />
						<stop offset="35%" stop-color="#4338ca" />
						<stop offset="70%" stop-color="#4f46e5" />
						<stop offset="100%" stop-color="#7c3aed" />
					</linearGradient>

					<radialGradient id="topGlow-{id}" cx="78%" cy="16%" r="62%">
						<stop offset="0%" stop-color="#c084fc" stop-opacity="0.45" />
						<stop offset="55%" stop-color="#7c3aed" stop-opacity="0.15" />
						<stop offset="100%" stop-color="#312e81" stop-opacity="0" />
					</radialGradient>

					<radialGradient id="centerGlow-{id}" cx="50%" cy="56%" r="38%">
						<stop offset="0%" stop-color="#818cf8" stop-opacity="0.35" />
						<stop offset="100%" stop-color="#4f46e5" stop-opacity="0" />
					</radialGradient>

					<linearGradient id="spec-{id}" x1="0%" y1="0%" x2="0%" y2="100%">
						<stop offset="0%" stop-color="#ffffff" stop-opacity="0.45" />
						<stop offset="20%" stop-color="#ffffff" stop-opacity="0.12" />
						<stop offset="100%" stop-color="#ffffff" stop-opacity="0.02" />
					</linearGradient>

					<linearGradient id="stroke-{id}" x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" stop-color="#ffffff" />
						<stop offset="100%" stop-color="#f8fafc" />
					</linearGradient>

					<filter id="starGlow-{id}" x="-30%" y="-30%" width="160%" height="160%">
						<feGaussianBlur stdDeviation="6" result="blur" />
						<feMerge>
							<feMergeNode in="blur" />
							<feMergeNode in="SourceGraphic" />
						</feMerge>
					</filter>
				</defs>

				<!-- Squircle Base -->
				<rect width="512" height="512" rx="116" fill="url(#bg-{id})" />
				<rect width="512" height="512" rx="116" fill="url(#topGlow-{id})" />
				<rect width="512" height="512" rx="116" fill="url(#centerGlow-{id})" />
				<rect x="1.5" y="1.5" width="509" height="509" rx="114.5" fill="none" stroke="url(#spec-{id})" stroke-width="2.5" />

				<!-- Hanger Hook -->
				<path
					d="M 230 148 C 220 138 218 122 226 110 C 234 98 246 90 260 90 C 278 90 294 104 294 122 C 294 138 282 152 266 162 C 258 167 256 174 256 184 L 256 206"
					fill="none"
					stroke="url(#stroke-{id})"
					stroke-width="28"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>

				<!-- Hanger Shoulders & Crossbar -->
				<path
					d="M 256 206 L 76 338 C 64 348 72 368 88 368 L 424 368 C 440 368 448 348 436 338 Z"
					fill="none"
					stroke="url(#stroke-{id})"
					stroke-width="28"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>

				<!-- AI Stylist Sparkle Star -->
				<path
					d="M 256 248 Q 256 284 292 284 Q 256 284 256 320 Q 256 284 220 284 Q 256 284 256 248 Z"
					fill="#ffffff"
					filter="url(#starGlow-{id})"
				/>
			</svg>
		{:else}
			<!-- Pure Glyph (Transparent vector icon using currentColor) -->
			<svg
				viewBox="0 0 512 512"
				class="w-full h-full text-current"
				fill="none"
				aria-hidden="true"
			>
				<!-- Hook -->
				<path
					d="M 230 148 C 220 138 218 122 226 110 C 234 98 246 90 260 90 C 278 90 294 104 294 122 C 294 138 282 152 266 162 C 258 167 256 174 256 184 L 256 206"
					stroke="currentColor"
					stroke-width="32"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>

				<!-- Shoulders & Crossbar -->
				<path
					d="M 256 206 L 76 338 C 64 348 72 368 88 368 L 424 368 C 440 368 448 348 436 338 Z"
					stroke="currentColor"
					stroke-width="32"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>

				<!-- Sparkle Star -->
				<path
					d="M 256 248 Q 256 284 292 284 Q 256 284 256 320 Q 256 284 220 284 Q 256 284 256 248 Z"
					fill="currentColor"
				/>
			</svg>
		{/if}
	</div>
{/snippet}

{#if href}
	<a {href} class="inline-flex items-center gap-2.5 group hover:opacity-95 transition-opacity">
		{@render iconContent()}
		{#if withText}
			<span class="font-bold text-lg tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent group-hover:from-white group-hover:to-zinc-300 transition-colors">
				My Wardrobe
			</span>
		{/if}
	</a>
{:else if withText}
	<div class="inline-flex items-center gap-2.5">
		{@render iconContent()}
		<span class="font-bold text-lg tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
			My Wardrobe
		</span>
	</div>
{:else}
	{@render iconContent()}
{/if}
