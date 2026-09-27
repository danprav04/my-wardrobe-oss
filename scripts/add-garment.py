#!/usr/bin/env python3
"""
My Wardrobe — Programmatic Item Adder CLI (Python)

Usage:
  python scripts/add-garment.py --name "Item Name" --category tops [options]
"""

import sys
import os
import argparse
import requests
import json

VALID_CATEGORIES = ["tops", "bottoms", "shoes", "outerwear", "accessories"]

def main():
    parser = argparse.ArgumentParser(description="Add clothing or shoes programmatically to My Wardrobe")
    parser.add_argument("--name", type=str, required=True, help="Garment name (Required)")
    parser.add_argument("--category", type=str, required=True, choices=VALID_CATEGORIES, help="Category (Required)")
    parser.add_argument("--desc", "--description", dest="desc", type=str, default="", help="Detailed description")
    parser.add_argument("--tags", type=str, default="", help="Comma-separated style tags")
    parser.add_argument("--file", "--image", dest="file", type=str, default=None, help="Local image file path to upload")
    parser.add_argument("--url", dest="url", type=str, default=None, help="Remote image URL to download & ingest")
    parser.add_argument("--generate", action="store_true", help="Generate studio catalog flat-lay via Local AI (Default if no image)")
    parser.add_argument("--stage", action="store_true", help="Apply Cloudinary AI background replacement on custom image")
    parser.add_argument("--token", type=str, default=os.environ.get("WARDROBE_TOKEN", os.environ.get("AUTH_TOKEN", "")), help="Session or API token for authentication")
    parser.add_argument("--host", type=str, default="http://localhost:3000", help="Target API base URL")

    args = parser.parse_args()
    host = args.host.rstrip("/")
    endpoint = f"{host}/api/garments/manual"
    headers = {"Authorization": f"Bearer {args.token}"} if args.token else {}

    print(f"Connecting to {endpoint}...")
    print(f"Adding: '{args.name}' ({args.category})")

    try:
        if args.file:
            if not os.path.exists(args.file):
                print(f"Error: File not found at '{args.file}'")
                sys.exit(1)

            filename = os.path.basename(args.file)
            ext = os.path.splitext(filename)[1].lower()
            mime_type = "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "image/jpeg"

            data = {
                "name": args.name,
                "category": args.category,
                "description": args.desc,
                "tags": args.tags,
                "generateStudioImage": "true" if args.generate else "false",
                "stageWithAi": "true" if args.stage else "false",
            }

            with open(args.file, "rb") as f:
                files = {"image": (filename, f, mime_type)}
                print(f"Uploading {filename} ({os.path.getsize(args.file) / 1024:.1f} KB)...")
                resp = requests.post(endpoint, data=data, files=files, headers=headers, timeout=120)
        else:
            payload = {
                "name": args.name,
                "category": args.category,
                "description": args.desc,
                "tags": args.tags,
                "imageUrl": args.url,
                "generateStudioImage": args.generate or not args.url,
                "stageWithAi": args.stage,
            }
            print("Sending JSON payload...")
            req_headers = {"Content-Type": "application/json", **headers}
            resp = requests.post(endpoint, json=payload, headers=req_headers, timeout=120)

        if resp.status_code != 201:
            print(f"Server error HTTP {resp.status_code}: {resp.text}")
            sys.exit(1)

        result = resp.json()
        garment = result.get("garment", {})
        print("\nSUCCESS! Garment added to catalog:")
        print(f"  ID:       {garment.get('id')}")
        print(f"  Name:     {garment.get('name')}")
        print(f"  Category: {garment.get('category')}")
        print(f"  Tags:     {garment.get('tags')}")
        print(f"  Image:    {garment.get('imageUrl')}")
        print(f"  Crop:     {garment.get('cropPath')}")

    except Exception as e:
        print(f"Failed to add garment: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
