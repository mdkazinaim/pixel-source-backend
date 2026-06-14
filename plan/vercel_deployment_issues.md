# Vercel Deployment Issues & Alternatives (autoScripting)

## Why This App Is Not Working on Vercel

The `autoScripting` backend is a NestJS application that relies heavily on **Puppeteer** for web scraping. Deploying this specific architecture to Vercel (which uses AWS Lambda serverless functions under the hood) causes several critical issues:

### 1. Bundle Size Limits (The Chromium Problem)
Puppeteer automatically downloads a full, local version of the Chromium browser to run headlessly. This browser binary is large (often 150MB - 300MB+). Vercel serverless functions have a strict maximum deployment size limit (typically 50MB zipped / 250MB unzipped). The inclusion of Chromium immediately breaches this limit, causing the deployment to fail.

### 2. Missing System Dependencies
Vercel's serverless environment is a stripped-down Linux environment. It inherently lacks many of the shared system libraries (like `libnss3`, `libatk-bridge2.0-0`, `libx11-xcb1`, etc.) that the Chromium browser engine requires to launch and render pages.

### 3. Execution Timeouts
Vercel imposes strict execution timeouts for serverless functions:
- **Hobby Tier:** 10 seconds (default) up to 60 seconds (max configuration).
- **Pro Tier:** Up to 5 minutes (depending on configuration).

Web scraping with Puppeteer is inherently slow. The app's logic involves waiting for `networkidle0` and performing an auto-scroll interval loop that can take many seconds to trigger lazy-loaded images. If the scraping process takes longer than Vercel's timeout limit, the function is killed, resulting in a `504 Gateway Timeout` error on the frontend.

### 4. Stateless In-Memory Caching
The application uses a basic in-memory caching mechanism (`private cache = new Map()`). Vercel spins up different container instances for incoming requests and kills them shortly after. This means:
- The cache will be completely wiped out frequently.
- Two simultaneous requests might hit two different serverless containers, rendering the cache useless.

### 5. Memory and Streaming Constraints
When zipping and streaming bulk downloads (`createZip` with `archiver`), the serverless function has to hold buffers in memory. Vercel functions have strict memory limits (usually 1024MB on Hobby), and handling multiple large image buffers simultaneously could crash the function with an out-of-memory (OOM) error. Additionally, Vercel restricts response payload sizes (typically 4.5MB).

---

## What Needs To Be Done (To Fix It on Vercel)

If you absolutely *must* deploy this to Vercel, you have to drastically change the architecture:

1. **Swap Puppeteer for Puppeteer-Core + @sparticuz/chromium:**
   You must use `@sparticuz/chromium` (a lightweight, compressed version of Chromium designed specifically for AWS Lambda) along with `puppeteer-core`. This keeps the bundle size under the limit.
   ```typescript
   import puppeteer from 'puppeteer-core';
   import chromium from '@sparticuz/chromium';

   const browser = await puppeteer.launch({
     args: chromium.args,
     defaultViewport: chromium.defaultViewport,
     executablePath: await chromium.executablePath(),
     headless: chromium.headless,
   });
   ```
2. **Increase Timeout Limits:** You would need to upgrade to Vercel Pro and explicitly configure `maxDuration` in your `vercel.json` or route config to prevent 504 timeouts.
3. **Move to an External Cache:** Replace the in-memory map with an external Redis instance (like Upstash) for caching scraped data.

---

## The Best Alternatives

Since Vercel is designed for lightweight API endpoints and SSR rendering—not heavy, long-running browser automation—the best approach is to move the backend away from Vercel to a platform designed for containerized or persistent workloads.

### Alternative 1: Containerized PaaS (Recommended)
Deploy the NestJS backend using Docker to platforms like **Railway**, **Render**, **Fly.io**, or **DigitalOcean App Platform**.
- **Why?** These platforms allow you to write a custom `Dockerfile` where you can explicitly install Google Chrome and all required system dependencies.
- **Benefit:** They provide persistent servers, no hard 10-second timeouts, and allow your in-memory cache to actually work.

### Alternative 2: Use a Managed Scraping API (Browserless.io)
Keep the NestJS backend on Vercel, but stop running Puppeteer locally. Instead, connect your Puppeteer script to a cloud browser service like **Browserless.io**.
- **How it works:** Instead of `puppeteer.launch()`, you use `puppeteer.connect({ browserWSEndpoint: 'wss://chrome.browserless.io/...' })`.
- **Benefit:** The heavy lifting (Chromium, memory, dependencies) happens on Browserless servers. Vercel only sends instructions and waits for the JSON result.

### Alternative 3: Electron / Local Desktop Application
Given the context of `electron-desktop/main.js` and `build-desktop.sh` in your workspace, the current plan seems to be wrapping the backend and frontend into a standalone desktop application. 
- **Benefit:** Running the NestJS app locally on the user's machine entirely bypasses cloud hosting limitations, timeouts, and IP bans. The local machine's hardware handles the Puppeteer automation seamlessly.
