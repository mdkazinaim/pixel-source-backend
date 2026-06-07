import { Controller, Post, Body, BadRequestException, Res } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { Response } from 'express';

/**
 * Controller for scraper-related endpoints.
 */
@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  /**
   * Primary endpoint to analyze a URL and extract content.
   * @param url The website URL to scrape
   */
  @Post('analyze')
  async analyze(
    @Body('url') url: string,
    @Body('page') page?: number,
    @Body('limit') limit?: number,
  ) {
    if (!url) {
      throw new BadRequestException('URL is required');
    }

    try {
      return await this.scraperService.scrape(url, page, limit);
    } catch (error) {
      throw new BadRequestException(`Failed to scrape: ${error.message}`);
    }
  }

  /**
   * Endpoint to download multiple media items as a ZIP archive.
   * Handles bulk download requests.
   * @param urls Array of media URLs to include in the ZIP
   * @param res The streaming response
   */
  @Post('download')
  async download(@Body('urls') urls: string[], @Res() res: Response) {
    if (!urls || !Array.isArray(urls)) {
      throw new BadRequestException('URLs array is required');
    }

    try {
      await this.scraperService.createZip(urls, res);
    } catch (error) {
      throw new BadRequestException(`Failed to create ZIP: ${error.message}`);
    }
  }
}
