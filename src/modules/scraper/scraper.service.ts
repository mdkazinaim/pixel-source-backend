import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as archiver from 'archiver';
import axios from 'axios';
import { Response } from 'express';

/**
 * Service responsible for web scraping operations and archive creation.
 * Uses Puppeteer for dynamic content rendering and archiver for ZIP generation.
 */
@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  /**
   * Scrapes the provided URL for images, links, videos, and H1 tags.
   * Handles lazy-loading by auto-scrolling and special-cases YouTube/Vimeo.
   * @param url The website URL to analyze
   */
  private cache = new Map<string, { data: any; timestamp: number }>();

  /**
   * Scrapes the provided URL with caching and pagination support.
   */
  async scrape(url: string, pageNum?: number, limitNum?: number) {
    const page = pageNum ? Number(pageNum) : 1;
    const limit = limitNum ? Number(limitNum) : 20;

    let scrapedData: any;
    const cached = this.cache.get(url);
    const cacheDuration = 5 * 60 * 1000; // 5 minutes cache

    if (cached && (Date.now() - cached.timestamp < cacheDuration)) {
      this.logger.log(`⚡ Returning cached results for URL: ${url}`);
      scrapedData = cached.data;
    } else {
      scrapedData = await this.performScrape(url);
      this.cache.set(url, { data: scrapedData, timestamp: Date.now() });
    }

    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedImages = scrapedData.images.slice(startIndex, endIndex);
    const paginatedVideos = scrapedData.videos.slice(startIndex, endIndex);
    const paginatedLinks = scrapedData.links.slice(startIndex, endIndex);
    const paginatedH1s = scrapedData.h1s.slice(startIndex, endIndex);

    return {
      data: {
        images: paginatedImages,
        videos: paginatedVideos,
        links: paginatedLinks,
        h1s: paginatedH1s,
      },
      pagination: {
        page,
        limit,
        totalImages: scrapedData.images.length,
        totalVideos: scrapedData.videos.length,
        totalLinks: scrapedData.links.length,
        totalH1s: scrapedData.h1s.length,
        totalPagesImages: Math.ceil(scrapedData.images.length / limit),
        totalPagesVideos: Math.ceil(scrapedData.videos.length / limit),
        totalPagesLinks: Math.ceil(scrapedData.links.length / limit),
        totalPagesH1s: Math.ceil(scrapedData.h1s.length / limit),
      }
    };
  }

  /**
   * Internal method containing the actual Puppeteer scraping logic.
   */
  private async performScrape(url: string) {
    this.logger.log(`🔍 Scraping URL: ${url}`);

    let executablePath;
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    
    const platform = os.platform();
    let pathsToCheck = [];

    const bundledBrowsersDir = process.env.BUNDLED_BROWSERS_DIR;
    if (bundledBrowsersDir) {
      if (platform === 'win32') {
        pathsToCheck.push(path.join(bundledBrowsersDir, 'win64', 'chrome.exe'));
      } else if (platform === 'linux') {
        pathsToCheck.push(path.join(bundledBrowsersDir, 'linux', 'chrome'));
      }
    }

    if (platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
      const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';

      pathsToCheck = [
        path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ];
    } else if (platform === 'darwin') {
      pathsToCheck = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
      ];
    } else {
      pathsToCheck = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
        '/snap/bin/google-chrome'
      ];
    }

    for (const p of pathsToCheck) {
      if (fs.existsSync(p)) {
        executablePath = p;
        break;
      }
    }

    let defaultExecutablePath;
    try {
      defaultExecutablePath = puppeteer.executablePath();
    } catch (e) {
      defaultExecutablePath = undefined;
    }

    if (!executablePath && !defaultExecutablePath) {
      throw new Error('Google Chrome or Microsoft Edge is required but was not found on this system. Please install Google Chrome to use this application.');
    }

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath || defaultExecutablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    try {
      const page = await browser.newPage();

      // Set realistic User-Agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Set more comprehensive headers to avoid bot detection
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      });

      await page.setViewport({ width: 1440, height: 900 });
      
      try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      } catch (e) {
        this.logger.warn(`Navigation timeout or error for ${url}, proceeding anyway...`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait a bit more if networkidle failed
      }

      // Auto-scroll to trigger lazy loading
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight || totalHeight > 5000) { // Limit to 5k pixels or end
              clearInterval(timer);
              resolve(true);
            }
          }, 100);
        });
      });

      // Extract Images (Improved)
      const images = await page.evaluate(() => {
        const results = new Set<string>();

        // Check all images
        document.querySelectorAll('img').forEach((img) => {
          const src = img.src || img.currentSrc;
          if (src && src.startsWith('http')) results.add(src);

          // Handle srcset (pick the last one usually highest quality)
          if (img.srcset) {
            const sources = img.srcset.split(',').map(s => s.trim().split(' ')[0]);
            sources.forEach(src => {
              if (src.startsWith('http')) results.add(src);
              else if (src.startsWith('/')) results.add(window.location.origin + src);
            });
          }

          // Handle data-src or data-original (lazy loading)
          ['data-src', 'data-original', 'data-lazy', 'data-fallback', 'data-original-res'].forEach(attr => {
            const val = img.getAttribute(attr);
            if (val) {
              if (val.startsWith('http')) results.add(val);
              else if (val.startsWith('/')) results.add(window.location.origin + val);
              else if (val.startsWith('//')) results.add('https:' + val);
            }
          });
        });

        // Check picture tags
        document.querySelectorAll('picture source').forEach((source: any) => {
          if (source.srcset) {
            const sources = source.srcset.split(',').map(s => s.trim().split(' ')[0]);
            sources.forEach(src => {
              if (src.startsWith('http')) results.add(src);
            });
          }
        });

        return Array.from(results);
      });

      // Extract Links
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
          .map((a) => ({ text: a.innerText.trim(), href: a.href }))
          .filter((link) => link.href && link.href.startsWith('http'));
      });

      // Extract Videos (Improved)
      const videos = await page.evaluate(() => {
        const results = new Set<string>();

        document.querySelectorAll('video').forEach(v => {
          if (v.src && !v.src.startsWith('blob:')) results.add(v.src);
          v.querySelectorAll('source').forEach(s => {
            if (s.src && !s.src.startsWith('blob:')) results.add(s.src);
          });
        });

        document.querySelectorAll('iframe').forEach(iframe => {
          if (iframe.src && (iframe.src.includes('youtube.com') || iframe.src.includes('vimeo.com') || iframe.src.includes('video'))) {
            results.add(iframe.src);
          }
        });

        return Array.from(results);
      });

      // Special handling for YouTube/Vimeo URLs directly
      if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
        const videoId = url.includes('v=')
          ? url.split('v=')[1]?.split('&')[0]
          : url.split('/').pop()?.split('?')[0];

        if (videoId) {
          const ytUrl = `https://www.youtube.com/embed/${videoId}`;
          if (!videos.includes(ytUrl)) videos.push(ytUrl);
          const thumbUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
          if (!images.includes(thumbUrl)) images.push(thumbUrl);
        }
      } else if (url.includes('vimeo.com/')) {
        const vimeoId = url.split('/').pop()?.split('?')[0];
        if (vimeoId && !isNaN(Number(vimeoId))) {
          const vimeoUrl = `https://player.vimeo.com/video/${vimeoId}`;
          if (!videos.includes(vimeoUrl)) videos.push(vimeoUrl);
        }
      }

      // Extract H1 Tags
      const h1s = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('h1'))
          .map((h1) => h1.innerText.trim())
          .filter((text) => text.length > 0);
      });

      return {
        images,
        links,
        videos,
        h1s,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to scrape ${url}: ${error.message}`);
      throw error;
    } finally {
      await browser.close();
    }
  }

  /**
   * Creates a ZIP archive containing the provided media URLs and streams it to the response.
   * @param urls Array of media URLs to include in the ZIP
   * @param res Express Response object to pipe the archive to
   */
  async createZip(urls: string[], res: Response) {
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      this.logger.error(`Archive error: ${err.message}`);
      res.status(500).send({ error: 'Failed to create archive' });
    });

    res.attachment('scraped-media.zip');
    archive.pipe(res);

    for (const [index, url] of urls.entries()) {
      try {
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
        const extension = url.split('.').pop().split(/\#|\?/)[0] || 'jpg';
        archive.append(Buffer.from(response.data), { name: `media-${index}.${extension}` });
      } catch (error) {
        this.logger.error(`Failed to download ${url}: ${error.message}`);
      }
    }

    await archive.finalize();
  }

  /**
   * Proxies a single media download by streaming it to bypass CORS restrictions.
   * @param url Media URL to proxy
   * @param res Express Response object to pipe the stream to
   */
  async proxyDownload(url: string, res: Response) {
    try {
      const response = await axios.get(url, { responseType: 'stream', timeout: 15000 });
      
      const rawContentType = response.headers['content-type'];
      const contentType = rawContentType ? String(rawContentType) : '';

      // Extract original filename or create one
      let filename = 'downloaded-media';
      try {
        const parsedUrl = new URL(url);
        const pathname = parsedUrl.pathname;
        const lastSegment = pathname.substring(pathname.lastIndexOf('/') + 1);
        if (lastSegment && lastSegment.includes('.')) {
          filename = lastSegment.split(/\#|\?/)[0];
        } else {
          let extension = 'jpg';
          if (contentType.includes('video/mp4')) extension = 'mp4';
          else if (contentType.includes('image/png')) extension = 'png';
          else if (contentType.includes('image/webp')) extension = 'webp';
          else if (contentType.includes('image/gif')) extension = 'gif';
          filename = `media_${Date.now()}.${extension}`;
        }
      } catch {
        let extension = 'jpg';
        if (contentType.includes('video/mp4')) extension = 'mp4';
        else if (contentType.includes('image/png')) extension = 'png';
        else if (contentType.includes('image/webp')) extension = 'webp';
        else if (contentType.includes('image/gif')) extension = 'gif';
        filename = `media_${Date.now()}.${extension}`;
      }

      // Forward response headers
      res.setHeader('Content-Type', contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      response.data.pipe(res);
    } catch (error) {
      this.logger.error(`Failed to proxy download for ${url}: ${error.message}`);
      throw error;
    }
  }
}
