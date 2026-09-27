import { pgTable, text, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core';

export const garments = pgTable('garments', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
	category: text('category').notNull(), // 'tops' | 'bottoms' | 'shoes' | 'outerwear' | 'accessories'
	fit: text('fit'), // e.g. 'wide-leg' | 'baggy' | 'relaxed' | 'straight-leg' | 'slim' | 'skinny' | 'oversized' | 'boxy' | 'cropped' | 'regular'
	tags: text('tags').notNull().default('[]'), // JSON array of tag strings
	imageUrl: text('image_url').notNull(), // Clean presentable catalog image (Cloudinary or local)
	cropPath: text('crop_path').notNull(), // Raw crop from original capture
	originalPath: text('original_path'), // Original unprocessed capture
	sourcePhotoId: text('source_photo_id'), // Batched items identifier
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const outfits = pgTable('outfits', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	tryonUrl: text('tryon_url'), // Saved try-on composite image URL
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const outfitItems = pgTable(
	'outfit_items',
	{
		outfitId: text('outfit_id')
			.notNull()
			.references(() => outfits.id, { onDelete: 'cascade' }),
		garmentId: text('garment_id')
			.notNull()
			.references(() => garments.id, { onDelete: 'cascade' }),
		slot: text('slot').notNull(), // 'top' | 'bottom' | 'shoes' | 'outerwear' | 'accessory'
		layerOrder: integer('layer_order').default(0).notNull()
	},
	(table) => [
		primaryKey({ columns: [table.outfitId, table.garmentId] })
	]
);

export const userProfile = pgTable('user_profile', {
	id: integer('id').primaryKey().default(1),
	portraitUrl: text('portrait_url'), // Try-on user photo
	height: text('height'), // e.g. '182 cm' / '6 ft'
	bodyType: text('body_type'), // e.g. 'athletic', 'slim', 'average', 'broad'
	fitPreference: text('fit_preference'), // e.g. 'relaxed', 'oversized', 'regular', 'tailored'
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const appSettings = pgTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export type Garment = typeof garments.$inferSelect;
export type NewGarment = typeof garments.$inferInsert;
export type Outfit = typeof outfits.$inferSelect;
export type NewOutfit = typeof outfits.$inferInsert;
export type OutfitItem = typeof outfitItems.$inferSelect;
export type NewOutfitItem = typeof outfitItems.$inferInsert;
