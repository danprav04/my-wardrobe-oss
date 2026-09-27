# My Wardrobe (Virtual Wardrobe & AI Stylist)

<div align="center">

[![SvelteKit 5](https://img.shields.io/badge/SvelteKit-5.0-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](https://kit.svelte.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.0-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![NVIDIA CUDA](https://img.shields.io/badge/NVIDIA_CUDA-12.8-76B900?style=for-the-badge&logo=nvidia&logoColor=white)](https://developer.nvidia.com/cuda-toolkit)
[![ComfyUI](https://img.shields.io/badge/ComfyUI-GPU_Engine-7C3AED?style=for-the-badge)](https://github.com/comfyanonymous/ComfyUI)
[![FastAPI](https://img.shields.io/badge/FastAPI-1.0-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

<p align="center">
  <b>A high-fidelity AI-powered virtual wardrobe, catalog flat-lay generator, and outfit styling studio.</b><br>
  Transforms messy smartphone snapshots of clothing into pristine e-commerce studio flat-lays, provides intelligent outfit styling recommendations, and composites photorealistic virtual try-ons onto your personal portrait profile.
</p>

[Quick Start](#-quick-start-local-development) •
[Architecture](#-system-architecture) •
[Core Features](#-core-features) •
[Operating Modes](#-operating-modes) •
[Local GPU Setup](#-local-gpu-engine-setup-comfyui--rtx) •
[Configuration](#-configuration-reference-env) •
[CLI & Scripts](#-cli--scripts-reference) •
[REST API](#-rest-api-reference)

---

</div>

## Overview

Traditional wardrobe apps require tedious manual uploads, white-background stock imagery, and complex categorization. **My Wardrobe** eliminates this friction with a unified, multimodal vision and diffusion pipeline:

1. **Snap & Detect**: Lay multiple garments on your bed or floor and snap a single photo. The system uses multimodal computer vision (**Gemini 3.5 Flash-Lite** or local saliency models) to detect individual garments, extract precision bounding boxes, and automatically crop each piece.
2. **AI Studio Staging**: Wrinkled, unironed items photographed in poor lighting are synthesized into crisp, 90° top-down commercial flat-lays on seamless light-gray backdrops (`#f4f4f5`) using **Nano Banana (Gemini 3.1 Flash Image preview)** or local **Qwen-Image-2.1 Diffusion Transformers** conditioned on the raw cutout.
3. **Automated Wardrobe Taxonomy**: Each item is tagged with category, color palette, fabric texture, style tags, and silhouette fit (e.g., *oversized*, *boxy*, *wide-leg*, *straight-leg*).
4. **Interactive Outfit Builder & Stylist**: Assemble outfits across slots (Tops, Bottoms, Shoes, Outerwear, Accessories) with real-time AI styling advice recommending harmonic pairings from your existing closet.
5. **Photorealistic Virtual Try-On**: Dress yourself in your assembled outfit. The system preserves your facial features, hairstyle, body build, and stance while draping garments with authentic textile textures, realistic drop shoulders, wide-leg breaks, and shoe inpainting.

Runs completely **zero-cost** using cloud APIs (Puter, Google AI Studio, Pollinations, Cloudinary, Hugging Face) or **100% private and on-premise** on an NVIDIA RTX GPU.

---

## 🏛 System Architecture

The following diagram illustrates the decoupled architecture between the SvelteKit application, the database, the local GPU acceleration layer, and cloud fallbacks:

```mermaid
flowchart TD
    subgraph Client["Frontend Client (SvelteKit 5 + Tailwind v4)"]
        UI["Modern Responsive Web UI"]
        Builder["Outfit Builder & Stylist Canvas"]
        Capture["Multi-Garment Camera Ingest"]
    end

    subgraph AppServer["Application Backend (Node.js 22 / SvelteKit)"]
        Auth["Auth & Session Security (Scrypt + HMAC + DB Revocation)"]
        Pipeline["Garment Processing Pipeline (Sharp)"]
        Stylist["Stylist Recommendation Engine"]
        Storage["Storage Abstraction (Local Disk / Cloudinary CDN)"]
        SSRF["SSRF DNS / IP Guard"]
    end

    subgraph Database["Relational Store (PostgreSQL 16)"]
        PG[("PostgreSQL Database\nDrizzle ORM")]
    end

    subgraph LocalAI["On-Premise GPU Compute (NVIDIA RTX / CUDA 12.8)"]
        FastAPI["Local AI Gateway (FastAPI :8000)"]
        Comfy["ComfyUI GPU Engine (:8188)"]
        Qwen["Qwen-Image-2.1 DiT (GGUF Q8_0)"]
        Rembg["Rembg / BiRefNet (Background Removal)"]
    end

    subgraph CloudAI["Cloud AI & Vision Providers"]
        GeminiVision["Gemini 3.5 Flash-Lite (Vision & Tagging)"]
        Puter["Puter.js / AI Studio (Nano Banana Flat-Lay & Try-On)"]
        Cloudinary["Cloudinary (CDN & AI Staging)"]
        Pollinations["Pollinations.ai (FLUX Flat-Lay Fallback)"]
        HF["Hugging Face Spaces (Leffa & IDM-VTON)"]
    end

    Client <-->|HTTP / Session Cookie| AppServer
    AppServer <-->|Drizzle ORM| PG
    AppServer -->|Crop / Transform| Storage

    Pipeline -->|1. Detect & Tag| GeminiVision
    Pipeline -.->|Fallback Detect & Tag| FastAPI

    Pipeline -->|2. Generate Studio Flat-Lay| Puter
    Pipeline -.->|Local GPU Flat-Lay| FastAPI
    Pipeline -.->|Free Cloud Fallback| Pollinations

    Stylist -->|Recommendation Prompt| GeminiVision
    Stylist -.->|Local Recommendation| FastAPI

    AppServer -->|Virtual Try-On Request| Puter
    AppServer -.->|Local GPU Try-On| FastAPI
    AppServer -.->|Cloud VTON Fallback| HF

    FastAPI <--> Comfy
    Comfy --> Qwen
    FastAPI --> Rembg
```

---

## ✨ Core Features

### 📸 1. Multi-Garment Computer Vision Ingestion
- Upload a single photo containing multiple garments (e.g., folded or laid out on a bed or floor).
- Automatically detects items using **Gemini 3.5 Flash-Lite** (with automatic failover to **Gemini 3.1 Flash-Lite**).
- Normalizes EXIF camera rotation, calculates bounding boxes on a normalized 0–100 scale, and extracts lossless crops via **Sharp**.
- E-commerce detection automatically identifies pre-existing studio catalog product shots and preserves multi-angle views without unnecessary regeneration.
- Auto-extracts category (`tops`, `bottoms`, `shoes`, `outerwear`, `accessories`), garment name, detailed descriptions, color palettes, materials, and descriptive style tags.

### 🧼 2. Commercial Catalog Flat-Lay Generation
- Transforms wrinkled, unevenly lit items into commercial-grade retail flat-lays on clean light-gray backdrops (`#f4f4f5`).
- Multi-engine dispatch:
  - **Puter / Google AI Studio (Default)**: Nano Banana (`gemini-3.1-flash-image-preview`) with structured prompt conditioning.
  - **Local AI (NVIDIA RTX GPU)**: Runs on-premise ComfyUI executing **Qwen-Image-2.1 DiT** (GGUF Q8_0) with reference cutout cross-conditioning. Automatically detects garment orientation and rotates sideways crops upright.
  - **Pollinations FLUX**: Automatic free cloud fallback ensuring generation never returns a blank canvas.
- Toggle between the synthetic studio asset and the raw camera crop at any time in the UI.

### 👕 3. Interactive Outfit Builder
- Visual canvas supporting 5 primary slots: **Tops**, **Bottoms**, **Shoes**, **Outerwear**, and **Accessories**.
- Drag-and-drop layer reordering, real-time silhouette preview, and instant outfit persistence.
- Saved outfit gallery with composite previews, equipped piece breakdowns, and direct try-on rendering.

### 🧠 4. AI Stylist & Smart Suggestions
- Dynamic outfit recommendations powered by Gemini 3.5 Flash-Lite or Local AI.
- Analyzes currently equipped garments and suggests cohesive items from your closet based on color theory, style synergy, seasonality, and occasion (Casual, Smart Casual, Formal, Streetwear, Athletic).

### 🪞 5. Photorealistic Virtual Try-On
- Composites assembled outfits directly onto your personalized portrait photo.
- Stores user physical attributes (height, body build, fit preference) in PostgreSQL and injects them into the conditioning prompt.
- **Silhouette-Aware Draping**: Explicitly models authentic cuts—loose boxy shoulders on oversized tees, straight vs. wide-leg stacking over footwear, and relaxed drapery without shrink-wrapping.
- **Identity & Hygiene**: Strict negative prompting removes handheld cameras, phones, and selfie straps while preserving face identity, hairstyle, eyeglasses, and natural arm/hand posture.
- Dual execution paths:
  - **Cloud**: Puter / Google AI Studio (Nano Banana) or Hugging Face Spaces (**Leffa** / **IDM-VTON** + **FLUX.1-Fill** for shoe inpainting).
  - **Local GPU**: Multi-image conditioning in ComfyUI utilizing reference cutouts pre-isolated via **Rembg / BiRefNet**.

### 🔒 6. Enterprise-Grade Single-User Security
- Single-user administrative authentication with **Scrypt password hashing** (16-byte random salt, 64-byte key length).
- Constant-time verification (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.
- Tamper-proof **HMAC SHA-256 session tokens** in secure `httpOnly`, `sameSite: lax` cookies with database revocation tracking.
- **Brute-Force Rate Limiting**: Enforces a strict 5-attempt / 60-second window per IP.
- **Strict SSRF Guard**: Fully resolves domain names via DNS and blocks private RFC 1918 subnets, loopback addresses (`127.0.0.0/8`, `::1`), link-local metadata endpoints (`169.254.169.254`), and non-HTTP protocols.

---

## 🛠 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | SvelteKit 5 (Runes `$state`, `$derived`, `$effect`), Tailwind CSS v4, Lucide Icons |
| **Backend** | SvelteKit Server Endpoints, Node.js 22, Sharp (C++ libvips image processing) |
| **Database** | PostgreSQL 16, Drizzle ORM, Drizzle Kit |
| **AI Gateway** | FastAPI, Uvicorn, Python 3.11, Pydantic |
| **Local GPU Engine**| PyTorch (CUDA 12.8), ComfyUI, ComfyUI-GGUF, Qwen-Image-2.1 DiT, Rembg (BiRefNet / U2Net) |
| **Cloud AI Providers**| Google AI Studio (Gemini 3.5 Flash-Lite, Gemini 3.1 Flash Image preview), Puter.js, Cloudinary, Pollinations FLUX, Hugging Face Spaces |
| **Deployment** | Docker, Docker Compose, Windows Batch / PowerShell orchestration |

---

## 📋 Prerequisites

### Required for All Modes
- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **npm**: `v10.x+`
- **Docker Desktop** (or a running PostgreSQL 16 instance)
- **Google AI Studio API Key**: For garment detection, tagging, and suggestions ([Get Free Key](https://aistudio.google.com/app/apikey))

### Optional (For Cloud Image Generation via Puter)
- **Puter.js Auth Token**: For cloud-based Nano Banana flat-lay generation and try-on ([puter.com](https://puter.com))

### Optional (For On-Premise GPU Engine)
- **NVIDIA GPU**: RTX 30-series, 40-series, or 50-series (8 GB+ VRAM recommended; 12 GB+ for optimal performance)
- **CUDA Toolkit**: 12.4, 12.6, or 12.8
- **uv** (Fast Python package manager) or Python 3.11+
- **Git**

---

## 🚀 Quick Start (Local Development)

### 1. Clone Repository & Install Node Dependencies

```sh
git clone https://github.com/danprav04/my-wardrobe-oss.git
cd my-wardrobe-oss
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```sh
cp .env.example .env
```

Generate a secure session secret and fill in your credentials in `.env`:

```sh
# Generate 48-byte cryptographically secure secret:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Edit `.env` and set:
- `AUTH_USERNAME=admin`
- `AUTH_PASSWORD=your_secure_password`
- `SESSION_SECRET=<generated_secret>`
- `GEMINI_API_KEY=your_google_ai_studio_api_key`
- `DATABASE_URL=postgresql://wardrobe:wardrobe_secret_pass@localhost:5432/wardrobe`

### 3. Initialize Database Schema

Push the Drizzle schema to your PostgreSQL database:

```sh
npm run db:push
```

### 4. Launch Full Stack with One Command

Run the local orchestrator:

```sh
# On Windows (cmd or terminal):
start-dev.bat

# Or via npm:
npm run dev:all
```

**What this orchestrator does automatically:**
1. **PostgreSQL** (`localhost:5432`): Starts the database container via Docker Compose (`docker compose up -d db`), or binds to an existing PostgreSQL service.
2. **ComfyUI GPU Engine** (`localhost:8188`): Clones ComfyUI & ComfyUI-GGUF if missing, verifies CUDA 12.8 PyTorch, mounts shared models, and boots the engine in the background (logs: `local-ai/comfyui.log`).
3. **Local AI FastAPI Gateway** (`localhost:8000`): Boots the FastAPI server in the background (logs: `local-ai/uvicorn.log`).
4. **SvelteKit Web Frontend** (`localhost:5173`): Launches Vite with live Hot Module Replacement (HMR) and opens your default browser.

### 5. Stopping the Environment

- Press `Ctrl+C` in the terminal to stop the web frontend. (Background AI services and DB stay warm for instant subsequent restarts).
- To halt all background services (FastAPI, ComfyUI) and stop the Docker database container:

```sh
stop-dev.bat
# Or:
npm run dev:stop
```

---

## 🔄 Operating Modes

### Mode A: Full Local Development (Single Machine)
Runs the entire stack on your local Windows PC with NVIDIA RTX GPU.
- Database: Local Docker container (`localhost:5432`)
- AI Engine: Local ComfyUI (`localhost:8188`) + FastAPI (`localhost:8000`)
- Frontend: Vite dev server (`localhost:5173`)
- **Command**: `npm run dev:all` or `start-dev.bat`

### Mode B: Cloud-Only Mode (Zero Local GPU Required)
Run the application on any laptop or cloud container without an NVIDIA GPU.
1. In `.env`, set:
   ```env
   IMAGE_GEN_ENGINE=puter
   TRYON_BACKEND=puter
   PUTER_AUTH_TOKEN=your_puter_token
   # Or use GEMINI_IMAGE_API_KEY=your_key
   ```
2. Start the database and web app:
   ```sh
   docker compose up -d db
   npm run dev
   ```
Flat-lays and virtual try-ons will be routed through Puter.js / Google AI Studio Nano Banana and Pollinations.

### Mode C: Hybrid Setup (Remote Linux Server + On-Premise GPU Worker)
When your SvelteKit web application and PostgreSQL database run on a remote cloud VPS (e.g. Ubuntu Linux), and your local Windows machine with an NVIDIA RTX GPU acts as the AI compute worker node:

1. **On your Windows PC (GPU Worker):**
   ```sh
   start-ai-only.bat
   # Or:
   npm run ai:start
   ```
   This script boots ComfyUI and FastAPI on `0.0.0.0:8000` and displays your LAN IP and Cloudflare Tunnel instructions.

2. **Expose your GPU worker to your remote server:**
   - **Option 1 (Cloudflare Tunnel - Recommended):**
     ```sh
     cloudflared tunnel --url http://localhost:8000
     ```
     Copy the generated URL (`https://<subdomain>.trycloudflare.com`).
   - **Option 2 (LAN / WireGuard / Tailscale):**
     Use your machine's VPN or LAN IP: `http://192.168.1.xxx:8000`.

3. **On your remote Linux VPS:**
   In your server's `.env`, configure:
   ```env
   LOCAL_AI_URL=https://<your-tunnel-subdomain>.trycloudflare.com
   IMAGE_GEN_ENGINE=local
   TRYON_BACKEND=local
   ```
   Deploy the web app with `docker compose up -d app db`. All heavy GPU rendering will be offloaded to your local Windows PC.

---

## 🧠 Local GPU Engine Setup (ComfyUI + RTX)

To enable on-premise flat-lay generation and virtual try-on using **Qwen-Image-2.1**, install the models into your ComfyUI models directory:

### Directory Structure

```text
local-ai/ComfyUI/models/
├── diffusion_models/
│   └── qwen-image-2.1-Q8_0.gguf
├── text_encoders/
│   └── qwen3vl_8b_int8_convrot.safetensors
└── vae/
    └── qwen_image_2.1_vae_bf16.safetensors
```

> **Note**: If you already have ComfyUI installed in your user profile (`%USERPROFILE%\Documents\ComfyUI\models`), the startup scripts automatically detect it and configure `extra_model_paths.yaml` so you don't need to duplicate weights!

### Required Model Weights

1. **Diffusion Model (GGUF Q8_0)**:
   - File: `qwen-image-2.1-Q8_0.gguf`
   - Location: `models/diffusion_models/`
   - Source: Hugging Face (`city96/Qwen-Image-2.1-GGUF` or official weights)
2. **Text Encoder (CLIP)**:
   - File: `qwen3vl_8b_int8_convrot.safetensors`
   - Location: `models/text_encoders/`
3. **VAE**:
   - File: `qwen_image_2.1_vae_bf16.safetensors`
   - Location: `models/vae/`

---

## ⚙️ Configuration Reference (`.env`)

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `AUTH_USERNAME` | **Yes** | `admin` | Single-user administrative login username. |
| `AUTH_PASSWORD` | **Yes** | — | Administrative login password (plain text or `scrypt:...` hash). |
| `SESSION_SECRET` | **Yes** | — | Cryptographic HMAC signing secret (minimum 32 characters). |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string (`postgresql://user:pass@host:5432/db`). |
| `DB_USER` | No | `wardrobe` | PostgreSQL username for Docker Compose container. |
| `DB_PASSWORD` | No | `wardrobe_secret_pass` | PostgreSQL password for Docker Compose container. |
| `DB_NAME` | No | `wardrobe` | PostgreSQL database name for Docker Compose container. |
| `GEMINI_API_KEY` | **Yes** | — | Google AI Studio key for Gemini 3.5 Flash-Lite vision detection & tagging. |
| `GEMINI_IMAGE_API_KEY` | No | — | Dedicated key for Nano Banana image generation (Gemini 3.1 Flash Image preview). |
| `PUTER_AUTH_TOKEN` | No | — | Single Puter.js JWT authentication token for cloud generation. |
| `PUTER_AUTH_TOKENS` | No | — | Comma-separated list of Puter JWT tokens for round-robin rotation. |
| `IMAGE_GEN_ENGINE` | No | `puter` | Primary image engine: `puter`, `local`, or `cloud`. |
| `TRYON_BACKEND` | No | `puter` | Virtual try-on routing: `puter`, `local`, or `hf-spaces`. |
| `LOCAL_AI_URL` | No | `http://localhost:8000` | Base URL for FastAPI Local AI microservice. |
| `COMFYUI_URL` | No | `http://localhost:8188` | Base URL for ComfyUI backend engine. |
| `CLOUDINARY_URL` | No | — | Cloudinary CDN storage URL (`cloudinary://key:secret@cloud_name`). |
| `HF_TOKEN` | No | — | Hugging Face user access token for Leffa/IDM-VTON Spaces fallback. |
| `STORAGE_PATH` | No | `./data` | Local directory for storing original captures, crops, and try-ons. |
| `BODY_SIZE_LIMIT` | No | `20M` | Maximum payload size for photo uploads. |
| `ALLOWED_ORIGINS` | No | — | Comma-separated list of additional allowed CORS origins. |

---

## 📜 CLI & Scripts Reference

### Development Scripts (`package.json`)

```sh
# Start web frontend only (port 5173)
npm run dev

# Start complete local development stack (DB, ComfyUI, FastAPI, Web UI)
npm run dev:all

# Stop all local development processes cleanly
npm run dev:stop

# Start dedicated GPU AI compute node only (ComfyUI + FastAPI on 0.0.0.0)
npm run ai:start

# Stop dedicated AI services
npm run ai:stop

# Push Drizzle schema changes to database
npm run db:push

# Generate Drizzle SQL migration files
npm run db:generate

# Launch Drizzle Studio database management GUI (localhost:4983)
npm run db:studio

# Run Svelte and TypeScript type checking
npm run check

# Build production bundle
npm run build

# Preview production build locally
npm run preview
```

### Command-Line Garment Ingestion Tool

Programmatically ingest items into your wardrobe from local files, remote URLs, or text prompts:

```sh
# Add shoes with a local photo:
node scripts/add-garment.mjs --name "Nike Air Force 1" --category shoes --file "photos/shoe.jpg" --tags "sneakers, white, leather"

# Add a top and generate a pristine flat-lay with Local AI (RTX GPU):
node scripts/add-garment.mjs --name "Charcoal Merino Wool Sweater" --category tops --desc "Fine-gauge crewneck sweater in charcoal gray" --generate

# Add pants with a remote catalog image:
node scripts/add-garment.mjs --name "Khaki Cargo Chinos" --category bottoms --url "https://example.com/chinos.jpg"
```

*(A Python equivalent is also available via `python scripts/add-garment.py`)*.

### Security & Verification Test Suites

```sh
# Verify authentication, Scrypt hashing, constant-time validation, and token revocation:
node scripts/test-auth.mjs

# Verify SSRF guards, private IP blocking, link-local protection, and rate limiting:
node scripts/test-security.mjs
```

---

## 📡 REST API Reference

All protected endpoints require an active session cookie (`wardrobe_session`) or an `Authorization: Bearer <session_token>` header.

### Garments API
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/garments` | List all garments. Supports query params: `?category=tops&search=denim`. |
| `POST` | `/api/garments` | Create a new garment manually or with staged URLs. |
| `POST` | `/api/garments/batch` | Batch confirm and insert garment candidates detected from a photo. |
| `GET` | `/api/garments/:id` | Fetch specific garment details. |
| `PUT` | `/api/garments/:id` | Update garment metadata (name, category, fit, description, tags). |
| `DELETE`| `/api/garments/:id` | Delete garment and clean up associated storage files. |
| `POST` | `/api/garments/regenerate` | Re-run studio flat-lay generation for an existing garment crop. |
| `POST` | `/api/garments/manual/fit` | Update garment fit silhouette. |

### Upload & Detection
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/upload` | Upload high-resolution photo; runs detection, cropping, and auto-tagging. |
| `GET` | `/api/storage/*` | Securely serves locally stored original photos, crops, and try-ons. |

### Outfits & AI Stylist
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/outfits` | List all saved outfits with equipped items. |
| `POST` | `/api/outfits` | Save an outfit configuration with assigned slots and layer order. |
| `GET` | `/api/outfits/:id` | Fetch outfit details and equipped garments. |
| `DELETE`| `/api/outfits/:id` | Delete an outfit. |
| `POST` | `/api/outfits/:id/tryon` | Trigger and save a virtual try-on render for an outfit. |
| `POST` | `/api/suggest` | AI Stylist recommendations for completing equipped slots. |
| `POST` | `/api/tryon` | Standalone virtual try-on execution endpoint. |

### Profile & Settings
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/profile` | Retrieve user portrait URL and body proportions. |
| `POST` | `/api/profile` | Update portrait photo, height, body type, and fit preference. |
| `GET` | `/api/local-ai/status` | Check Local AI gateway & ComfyUI GPU status, VRAM, and models. |
| `POST` | `/api/local-ai/config` | Update Local AI URL and preferred engine toggle. |
| `GET` | `/api/puter/status` | Check Puter.js / AI Studio connection, username, and latency. |
| `POST` | `/api/puter/config` | Update Puter authentication tokens and engine preference. |

---

## 🗄 Database Schema

The database is managed with **Drizzle ORM** on PostgreSQL. Key tables include:

```mermaid
erDiagram
    garments ||--o{ outfit_items : "equipped in"
    outfits ||--|{ outfit_items : "contains"
    
    garments {
        text id PK
        text name
        text description
        text category
        text fit
        text tags
        text image_url
        text crop_path
        text original_path
        text source_photo_id
        timestamp created_at
        timestamp updated_at
    }

    outfits {
        text id PK
        text name
        text tryon_url
        timestamp created_at
        timestamp updated_at
    }

    outfit_items {
        text outfit_id PK, FK
        text garment_id PK, FK
        text slot
        integer layer_order
    }

    user_profile {
        integer id PK
        text portrait_url
        text height
        text body_type
        text fit_preference
        timestamp updated_at
    }

    app_settings {
        text key PK
        text value
    }
```

---

## 🐳 Docker Deployment

The repository includes a production multi-stage `Dockerfile` and a `docker-compose.yml` configuration:

```sh
# Copy and configure environment variables
cp .env.example .env

# Launch database, local AI gateway, and web application
docker compose up -d --build
```

Access the web interface at `http://localhost:3000` (or `http://localhost:4848`).

---

## 🔒 Security Architecture

- **Tamper-Proof Session Management**: Sessions use HMAC SHA-256 signatures with 7-day expiration and database-backed revocation. When a user logs out, the token is recorded in the `app_settings` revocation table and instantly invalidated across all server instances.
- **Scrypt Password Hashing**: Passwords can be stored with Scrypt hashes (`scrypt:<salt>:<hash>`) utilizing random 16-byte salts and 64-byte derived keys.
- **SSRF Defense**: User-provided image URLs (e.g., when adding garments via URL) are strictly validated via DNS resolution. Connections to private IPv4/IPv6 networks, carrier-grade NAT, cloud metadata instances (`169.254.169.254`), and loopback adapters are strictly rejected before any network request is issued.
- **Constant-Time Comparison**: All credential verification and HMAC signature checks use `crypto.timingSafeEqual`.
- **Brute-Force Rate Limiting**: The `/login` route enforces a sliding window limiter restricting requests to 5 attempts per 60 seconds per IP address.

---

## 🤝 Contributing

Contributions, bug reports, and feature requests are welcome!

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add some amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
