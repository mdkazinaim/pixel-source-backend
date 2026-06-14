# MediaFinder Backend Documentation (autoScripting)

## Overview
The `autoScripting` application acts as the backend engine for the MediaFinder ecosystem. Its primary role is to serve as a high-performance web scraper and media proxy. It accepts URLs or search queries from the client, programmatically navigates to those destinations, and extracts media assets (images, videos), structural content (H1s), and hyperlinks. Furthermore, it manages the downloading process, bypassing CORS restrictions and packaging multiple files into zip archives.

## What This App Is Doing
1. **Dynamic Web Scraping:** Analyzes target URLs to extract media elements dynamically.
2. **Media Fetching:** Discovers images (including lazy-loaded and srcset variants), video sources (native, YouTube, Vimeo), hyperlinks, and H1 elements.
3. **Download Proxying:** Acts as an intermediary to download single media items without running into CORS errors on the frontend.
4. **Bulk Archiving:** Compiles multiple selected media URLs into a compressed `.zip` file on the fly and streams it back to the client.

## How It's Doing It & How Programs Are Working
The backend is structured as a modular NestJS application:
- **`main.ts` & `app.module.ts`:** Entry points configuring CORS, setting a global `api/v1` prefix, and initializing validation pipelines and configuration modules.
- **Scraper Module:** 
  - **`scraper.controller.ts`:** Exposes three main endpoints:
    - `POST /scraper/analyze`: Accepts a URL, page, and limit, returning scraped data.
    - `POST /scraper/download`: Accepts an array of URLs and streams back a `.zip` archive.
    - `GET /scraper/download-single`: Proxies a single media URL download.
  - **`scraper.service.ts`:** The core logic layer. It uses Puppeteer to spawn headless browser instances. 
    - **Caching:** Implements an in-memory 5-minute caching mechanism to optimize repeated queries.
    - **Navigation & Scrolling:** It mimics human behavior by setting realistic user-agents, waiting for the network to idle, and programmatically scrolling the page to trigger lazy-loaded images up to a threshold (5000 pixels).
    - **Extraction:** Injects JavaScript into the page (`page.evaluate`) to read `img` sources, `srcset`, `data-src`, `video` tags, and `iframe` embeds. It specifically identifies YouTube/Vimeo URLs and reconstructs embedded player and thumbnail links.
    - **Streaming & Archiving:** Uses the `archiver` library to zip buffers fetched via Axios and streams them to the Express Response object. Single downloads use Axios streams configured with proper Content-Type headers dynamically inferred or extracted from the URL.

## How It Handles the Process and Media Fetching
1. **Initiation:** The client requests an analysis of a URL.
2. **Puppeteer Launch:** A headless Chromium instance is booted with anti-bot detection flags (`--disable-blink-features=AutomationControlled`).
3. **Execution:** The browser navigates to the URL. An auto-scroll script runs to ensure all lazy-loaded elements are mounted in the DOM.
4. **Data Gathering:** DOM queries capture `src`, `data-original`, and `srcset` attributes. The data is deduplicated using Sets.
5. **Pagination & Return:** The service limits and slices the data based on requested pagination and returns it to the controller.

## Technologies Used
- **NestJS (v11):** Core framework for routing, dependency injection, and application architecture.
- **Puppeteer (v22):** Headless browser automation for dynamic scraping.
- **Axios:** For executing HTTP GET requests to fetch media buffers.
- **Archiver (v7):** For creating streaming `.zip` files.
- **TypeScript:** Ensuring type safety across the entire application.

## The Plan & Next Steps
- **Proxy/Residential IP Integration:** To avoid IP bans when scraping heavily guarded stock sites.
- **Redis Caching:** Upgrading the current in-memory Map cache to a distributed Redis cache for scalability.
- **Queue System (BullMQ):** Offloading the heavy Puppeteer scraping tasks to a background worker queue, allowing the controller to return a job ID and letting the client poll or receive WebSockets updates.
- **Advanced Bot Mitigation:** Enhancing the Puppeteer stealth plugins to bypass advanced CAPTCHAs and Cloudflare protection.
- **Error Resiliency:** Better fallback mechanisms if a site blocks Puppeteer (e.g., falling back to simple Cheerio HTTP scraping for static sites).
