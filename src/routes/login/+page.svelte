<script lang="ts">
	import { enhance } from '$app/forms';
	import { AppLogo } from '$lib';
	import { Lock, User, KeyRound, Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck } from '@lucide/svelte';

	let { form } = $props();

	let showPassword = $state(false);
	let isSubmitting = $state(false);
</script>

<svelte:head>
	<title>Sign In — My Wardrobe</title>
</svelte:head>

<div class="min-h-[80vh] flex flex-col items-center justify-center px-4 py-8">
	<!-- Background glow decoration -->
	<div class="absolute -top-40 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none -z-10"></div>

	<div class="w-full max-w-md">
		<!-- Brand Header -->
		<div class="text-center mb-8">
			<div class="mb-4 flex justify-center">
				<AppLogo size={56} class="shadow-2xl shadow-indigo-500/30" />
			</div>
			<h1 class="text-2xl font-bold tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
				My Wardrobe
			</h1>
			<p class="text-sm text-zinc-400 mt-1.5">
				Sign in to access your wardrobe, outfits, and AI styling studio
			</p>
		</div>

		<!-- Card Container -->
		<div class="bg-zinc-900/90 border border-zinc-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
			{#if form?.error}
				<div class="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium flex items-center gap-2.5">
					<AlertCircle class="w-4 h-4 shrink-0 text-rose-400" />
					<span>{form.error}</span>
				</div>
			{/if}

			<form
				method="POST"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update }) => {
						isSubmitting = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				<!-- Username Field -->
				<div>
					<label for="username" class="block text-xs font-semibold text-zinc-300 mb-1.5">
						Username
					</label>
					<div class="relative">
						<div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
							<User class="w-4 h-4" />
						</div>
						<input
							id="username"
							name="username"
							type="text"
							required
							autocomplete="username"
							value={form?.username || ''}
							placeholder="Enter your username"
							class="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
						/>
					</div>
				</div>

				<!-- Password Field -->
				<div>
					<label for="password" class="block text-xs font-semibold text-zinc-300 mb-1.5">
						Password
					</label>
					<div class="relative">
						<div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
							<KeyRound class="w-4 h-4" />
						</div>
						<input
							id="password"
							name="password"
							type={showPassword ? 'text' : 'password'}
							required
							autocomplete="current-password"
							placeholder="••••••••••••"
							class="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl pl-10 pr-11 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
						/>
						<button
							type="button"
							onclick={() => (showPassword = !showPassword)}
							class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-zinc-200 transition"
							aria-label={showPassword ? 'Hide password' : 'Show password'}
						>
							{#if showPassword}
								<EyeOff class="w-4 h-4" />
							{:else}
								<Eye class="w-4 h-4" />
							{/if}
						</button>
					</div>
				</div>

				<!-- Submit Button -->
				<div class="pt-2">
					<button
						type="submit"
						disabled={isSubmitting}
						class="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 transition disabled:opacity-60 cursor-pointer"
					>
						{#if isSubmitting}
							<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
							<span>Authenticating...</span>
						{:else}
							<span>Sign In</span>
							<ArrowRight class="w-4 h-4" />
						{/if}
					</button>
				</div>
			</form>
		</div>

		<!-- Security footer badge -->
		<div class="mt-6 flex items-center justify-center gap-2 text-xs text-zinc-500">
			<ShieldCheck class="w-4 h-4 text-emerald-500/80" />
			<span>Secured with cryptographic session protection</span>
		</div>
	</div>
</div>
