import OSS from 'ali-oss';
import { config } from '../utils/config.js';

/**
 * Aliyun OSS Client for video storage
 */
export class OssService {
  private client: OSS | null = null;
  private enabled: boolean;
  private bucket: string;

  constructor() {
    this.enabled = config.ossEnabled;
    this.bucket = config.ossBucket || '';

    if (this.enabled && config.ossAccessKeyId && config.ossAccessKeySecret) {
      this.client = new OSS({
        region: config.ossRegion || 'oss-cn-hangzhou',
        accessKeyId: config.ossAccessKeyId,
        accessKeySecret: config.ossAccessKeySecret,
        bucket: this.bucket,
        endpoint: config.ossEndpoint,
      });
      console.log('✅ OSS client initialized');
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  /**
   * Check if a URL is an OSS URL
   */
  isOssUrl(url: string): boolean {
    if (!url) return false;
    return url.includes('.aliyuncs.com') ||
           url.includes('.oss-') ||
           url.includes('oss-cn-');
  }

  /**
   * Generate signed URL for private bucket access
   */
  generateSignedUrl(objectKey: string, expires: number = 3600): string | null {
    if (!this.client) return null;

    try {
      // If it's already a full URL, extract the object key
      let key = objectKey;

      // Handle full URLs with protocol
      if (objectKey.startsWith('http://') || objectKey.startsWith('https://')) {
        const url = new URL(objectKey);
        key = url.pathname.replace(/^\//, '');
      }
      // Handle URLs without protocol (e.g., "bucket.oss-region.aliyuncs.com/path/file.mp4")
      else if (objectKey.includes('.aliyuncs.com/')) {
        // Extract the path after the domain
        const match = objectKey.match(/\.aliyuncs\.com\/(.+)$/);
        if (match) {
          key = match[1];
        }
      }

      const signedUrl = this.client.signatureUrl(key, { expires });
      return signedUrl;
    } catch (error) {
      console.error('Failed to generate signed URL:', error);
      return null;
    }
  }

  /**
   * Convert OSS URL to signed URL if needed
   */
  convertToSignedUrl(url: string, expires: number = 3600): string {
    if (!url) return url;

    // If not an OSS URL or OSS not enabled, return as-is
    if (!this.isOssUrl(url) || !this.isEnabled()) {
      return url;
    }

    const signedUrl = this.generateSignedUrl(url, expires);
    return signedUrl || url;
  }

  /**
   * Delete file from OSS by URL
   */
  async deleteByUrl(url: string): Promise<boolean> {
    if (!this.client || !this.isOssUrl(url)) return false;

    try {
      // Extract object key from URL
      const urlObj = new URL(url);
      const objectKey = urlObj.pathname.replace(/^\//, '');

      await this.client.delete(objectKey);
      console.log(`Deleted OSS object: ${objectKey}`);
      return true;
    } catch (error) {
      console.error('Failed to delete OSS object:', error);
      return false;
    }
  }
}

// Singleton instance
let ossService: OssService | null = null;

export function getOssService(): OssService {
  if (!ossService) {
    ossService = new OssService();
  }
  return ossService;
}
