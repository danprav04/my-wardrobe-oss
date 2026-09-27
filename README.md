# My Wardrobe (Virtual Wardrobe & AI Stylist)

A high-fidelity AI-powered virtual wardrobe, catalog flat-lay generator, and outfit styling application built with SvelteKit 5, Tailwind CSS v4, PostgreSQL (Drizzle ORM), ComfyUI, and Qwen-Image-2.1 with NVIDIA RTX GPU acceleration.

---

## Quick Start (Local Development)

To start the entire local development stack (Database, GPU AI Backend, FastAPI Gateway, and Web UI) in one click:

```sh
# Double-click or run from terminal:
start-dev.bat

# Or using npm:
npm run dev:all
```

This single command will:
1. **PostgreSQL** (`localhost:5432`): Ensures Docker Desktop is running and launches the database container (`docker compose up -d db`), or uses a native PostgreSQL instance if already listening.
2. **ComfyUI GPU Engine** (`localhost:8188`): Boots ComfyUI with CUDA 12.8 Blackwell RTX acceleration in the background (logs to `local-ai/comfyui.log`).
3. **Local AI Gateway** (`localhost:8000`): Boots the FastAPI gateway in the background (logs to `local-ai/uvicorn.log`).
4. **Web Frontend** (`localhost:5173`): Launches Vite in the foreground with live HMR and opens your browser.

### Stopping the Dev Environment

- Press `Ctrl+C` in the terminal to stop the web frontend. (Background AI services and DB stay warm for instant subsequent restarts).
- To cleanly stop all services and halt the database container:

```sh
stop-dev.bat

# Or using npm:
npm run dev:stop
```

---

## Dedicated AI Engine (For Remote Production Linux Server)

When your main web application and database run on a remote cloud server (e.g. Linux VPS) and this Windows PC acts as your dedicated on-premise GPU AI worker:

```sh
# Start only ComfyUI and FastAPI gateway on all network interfaces (0.0.0.0):
start-ai-only.bat

# Or using npm:
npm run ai:start

# Stop dedicated AI services:
stop-ai.bat
# Or:
npm run ai:stop
```

Set `LOCAL_AI_URL=http://<YOUR_WINDOWS_IP>:8000` (or your Cloudflare Tunnel URL) on your Linux server's `.env`.

---

## Other Useful Commands

```sh
# Database migrations
npm run db:push
npm run db:studio

# Production build
npm run build
npm run preview

# Docker full-stack deployment
docker compose up -d
```
