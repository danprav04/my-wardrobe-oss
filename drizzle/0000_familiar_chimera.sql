CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "garments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"tags" text DEFAULT '[]' NOT NULL,
	"image_url" text NOT NULL,
	"crop_path" text NOT NULL,
	"original_path" text,
	"source_photo_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outfit_items" (
	"outfit_id" text NOT NULL,
	"garment_id" text NOT NULL,
	"slot" text NOT NULL,
	"layer_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "outfit_items_outfit_id_garment_id_pk" PRIMARY KEY("outfit_id","garment_id")
);
--> statement-breakpoint
CREATE TABLE "outfits" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tryon_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"portrait_url" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outfit_items" ADD CONSTRAINT "outfit_items_outfit_id_outfits_id_fk" FOREIGN KEY ("outfit_id") REFERENCES "public"."outfits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit_items" ADD CONSTRAINT "outfit_items_garment_id_garments_id_fk" FOREIGN KEY ("garment_id") REFERENCES "public"."garments"("id") ON DELETE cascade ON UPDATE no action;