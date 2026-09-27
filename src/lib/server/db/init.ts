import { client } from './index';

/**
 * Initializes the database schema idempotently on application startup.
 * Automatically creates all tables and constraints if they do not exist yet.
 */
export async function ensureDatabaseReady(): Promise<void> {
	console.log('[DB Init] Verifying database tables...');

	const maxRetries = 5;
	let attempt = 0;

	while (attempt < maxRetries) {
		attempt++;
		try {
			// Execute idempotent table creation
			await client.unsafe(`
				CREATE TABLE IF NOT EXISTS "app_settings" (
					"key" text PRIMARY KEY NOT NULL,
					"value" text NOT NULL
				);

				CREATE TABLE IF NOT EXISTS "garments" (
					"id" text PRIMARY KEY NOT NULL,
					"name" text NOT NULL,
					"description" text,
					"category" text NOT NULL,
					"fit" text,
					"tags" text DEFAULT '[]' NOT NULL,
					"image_url" text NOT NULL,
					"crop_path" text NOT NULL,
					"original_path" text,
					"source_photo_id" text,
					"created_at" timestamp DEFAULT now() NOT NULL,
					"updated_at" timestamp DEFAULT now() NOT NULL
				);

				-- Migration for existing garments table
				ALTER TABLE "garments" ADD COLUMN IF NOT EXISTS "fit" text;

				CREATE TABLE IF NOT EXISTS "outfits" (
					"id" text PRIMARY KEY NOT NULL,
					"name" text NOT NULL,
					"tryon_url" text,
					"created_at" timestamp DEFAULT now() NOT NULL,
					"updated_at" timestamp DEFAULT now() NOT NULL
				);

				CREATE TABLE IF NOT EXISTS "outfit_items" (
					"outfit_id" text NOT NULL,
					"garment_id" text NOT NULL,
					"slot" text NOT NULL,
					"layer_order" integer DEFAULT 0 NOT NULL,
					CONSTRAINT "outfit_items_outfit_id_garment_id_pk" PRIMARY KEY("outfit_id","garment_id")
				);

				CREATE TABLE IF NOT EXISTS "user_profile" (
					"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
					"portrait_url" text,
					"height" text,
					"body_type" text,
					"fit_preference" text,
					"updated_at" timestamp DEFAULT now() NOT NULL
				);

				-- Migrations for existing user_profile table
				ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "height" text;
				ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "body_type" text;
				ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "fit_preference" text;

				DO $$
				BEGIN
					IF NOT EXISTS (
						SELECT 1 FROM pg_constraint WHERE conname = 'outfit_items_outfit_id_outfits_id_fk'
					) THEN
						ALTER TABLE "outfit_items" 
						ADD CONSTRAINT "outfit_items_outfit_id_outfits_id_fk" 
						FOREIGN KEY ("outfit_id") REFERENCES "public"."outfits"("id") ON DELETE cascade ON UPDATE no action;
					END IF;

					IF NOT EXISTS (
						SELECT 1 FROM pg_constraint WHERE conname = 'outfit_items_garment_id_garments_id_fk'
					) THEN
						ALTER TABLE "outfit_items" 
						ADD CONSTRAINT "outfit_items_garment_id_garments_id_fk" 
						FOREIGN KEY ("garment_id") REFERENCES "public"."garments"("id") ON DELETE cascade ON UPDATE no action;
					END IF;
				END $$;
			`);

			console.log('[DB Init] Database schema verified and ready.');
			return;
		} catch (err: any) {
			console.warn(`[DB Init] Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
			if (attempt < maxRetries) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
			} else {
				console.error('[DB Init] Failed to initialize database after multiple attempts:', err);
			}
		}
	}
}
