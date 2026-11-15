import { ParsedLinkResult } from '../types/shopee';

/**
 * Extracts human-readable product title from Shopee URL path
 */
function cleanSlug(slug: string): string {
  if (!slug) return 'Produk Shopee';
  const cleaned = slug
    .replace(/-i\.\d+\.\d+.*$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/^\s*-\s*/, '')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
  return cleaned || 'Produk Shopee';
}

/**
 * Extracts clean top-search keyword tokens from a product title
 */
export function deriveSearchKeyword(name?: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (
    !trimmed ||
    trimmed === 'Produk Shopee' ||
    trimmed.startsWith('Produk Shopee #') ||
    trimmed.startsWith('Produk #') ||
    trimmed.startsWith('Produk Shopee (')
  ) {
    return '';
  }
  const words = trimmed
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 6);
  return words.join(' ').trim();
}

/**
 * Normalizes any shopee.co.id URL to https://www.shopee.co.id/...
 */
export function canonicalizeShopeeUrl(inputUrl: string, shopId?: number, itemId?: number): string {
  if (inputUrl.startsWith('http')) {
    try {
      const parsed = new URL(inputUrl);
      if (parsed.hostname === 'shopee.co.id' || parsed.hostname === 'm.shopee.co.id') {
        parsed.hostname = 'www.shopee.co.id';
      }
      parsed.protocol = 'https:';
      return parsed.toString();
    } catch {
      // fall through
    }
  }
  if (shopId && itemId) {
    return `https://www.shopee.co.id/product/${shopId}/${itemId}`;
  }
  return inputUrl;
}

/**
 * Extracts the first HTTP(S) URL if user pasted a full Shopee share message
 */
function extractUrlFromText(raw: string): string {
  const urlMatch = raw.match(/https?:\/\/[^\s"'<>]+/i);
  if (urlMatch) {
    return urlMatch[0].replace(/[),.;!?]+$/, '');
  }
  return raw.trim();
}

/**
 * Parses a single Shopee URL or product identifier
 */
export function parseShopeeUrl(rawInput: string): ParsedLinkResult {
  const input = extractUrlFromText(rawInput.trim());
  if (!input) {
    return { valid: false, originalUrl: input, error: 'Link kosong' };
  }

  try {
    // 1. Standard Shopee URL pattern: /Title-i.SHOP_ID.ITEM_ID
    const standardMatch = input.match(/i\.(\d+)\.(\d+)/i);
    if (standardMatch) {
      const shopId = parseInt(standardMatch[1], 10);
      const itemId = parseInt(standardMatch[2], 10);

      let title = '';
      try {
        const urlObj = input.startsWith('http') ? new URL(input) : new URL(`https://www.shopee.co.id/${input}`);
        const pathSegments = urlObj.pathname.split('/').filter(Boolean);
        if (pathSegments.length > 0) {
          const firstSegment = decodeURIComponent(pathSegments[0] || '');
          title = cleanSlug(firstSegment);
        }
      } catch {
        const pathOnly = input.split('?')[0].split('#')[0];
        const match = pathOnly.match(/\/([^\/]+)-i\.\d+\.\d+/);
        if (match && match[1]) {
          title = cleanSlug(decodeURIComponent(match[1]));
        }
      }

      const finalName = title && title !== 'Produk Shopee' ? title : `Produk Shopee #${itemId}`;
      const canonicalUrl = canonicalizeShopeeUrl(input, shopId, itemId);

      return {
        valid: true,
        shopId,
        itemId,
        name: finalName,
        originalUrl: canonicalUrl,
        canonicalUrl: `https://www.shopee.co.id/product/${shopId}/${itemId}`,
        searchKeyword: deriveSearchKeyword(finalName),
        domain: 'www.shopee.co.id',
      };
    }

    // 2. /product/SHOP_ID/ITEM_ID pattern
    const productPathMatch = input.match(/product\/(\d+)\/(\d+)/i);
    if (productPathMatch) {
      const shopId = parseInt(productPathMatch[1], 10);
      const itemId = parseInt(productPathMatch[2], 10);
      const canonicalUrl = canonicalizeShopeeUrl(input, shopId, itemId);
      return {
        valid: true,
        shopId,
        itemId,
        name: `Produk Shopee #${itemId}`,
        originalUrl: canonicalUrl,
        canonicalUrl: `https://www.shopee.co.id/product/${shopId}/${itemId}`,
        searchKeyword: '',
        domain: 'www.shopee.co.id',
      };
    }

    // 3. Query params itemid & shopid
    if (input.includes('itemid=') || input.includes('item_id=')) {
      const itemMatch = input.match(/(?:itemid|item_id)=(\d+)/i);
      const shopMatch = input.match(/(?:shopid|shop_id)=(\d+)/i);
      if (itemMatch) {
        const itemId = parseInt(itemMatch[1], 10);
        const shopId = shopMatch ? parseInt(shopMatch[1], 10) : 0;
        const canonicalUrl = canonicalizeShopeeUrl(input, shopId, itemId);
        return {
          valid: true,
          shopId,
          itemId,
          name: `Produk Shopee #${itemId}`,
          originalUrl: canonicalUrl,
          canonicalUrl: shopId ? `https://www.shopee.co.id/product/${shopId}/${itemId}` : canonicalUrl,
          searchKeyword: '',
          domain: 'www.shopee.co.id',
        };
      }
    }

    // 4. Raw IDs separated by dot or slash: 12345678.987654321 or 12345678/987654321
    const rawMatch = input.match(/^(\d{5,12})[.\/](\d{6,14})$/);
    if (rawMatch) {
      const shopId = parseInt(rawMatch[1], 10);
      const itemId = parseInt(rawMatch[2], 10);
      const canonical = `https://www.shopee.co.id/product/${shopId}/${itemId}`;
      return {
        valid: true,
        shopId,
        itemId,
        name: `Produk #${itemId}`,
        originalUrl: canonical,
        canonicalUrl: canonical,
        searchKeyword: '',
        domain: 'www.shopee.co.id',
      };
    }

    // 5. Shortlinks: s.shopee.co.id / id.shp.ee / shp.ee / shope.ee
    if (/(?:s\.shopee\.co\.id|id\.shp\.ee|shpe?\.ee)\/[a-zA-Z0-9_-]+/i.test(input)) {
      const hash = input.split('?')[0].split('/').pop()?.replace(/[^a-zA-Z0-9_-]/g, '') || 'item';
      let numericId = 0;
      for (let i = 0; i < hash.length; i++) {
        numericId = (numericId * 31 + hash.charCodeAt(i)) % 900000000;
      }
      const itemId = 100000000 + Math.abs(numericId);
      const fullShortUrl = input.startsWith('http') ? input : `https://${input}`;
      return {
        valid: true,
        shopId: 10420192,
        itemId,
        name: `Produk Shopee (${hash.toUpperCase()})`,
        originalUrl: fullShortUrl,
        canonicalUrl: fullShortUrl,
        isShortlink: true,
        searchKeyword: '',
        domain: 'www.shopee.co.id',
      };
    }

    return {
      valid: false,
      originalUrl: input,
      error: 'Format link tidak dikenali. Gunakan format www.shopee.co.id/...-i.SHOP_ID.ITEM_ID atau /product/SHOP_ID/ITEM_ID',
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Gagal memproses link';
    return {
      valid: false,
      originalUrl: input,
      error: errorMsg,
    };
  }
}

/**
 * Extracts multiple Shopee products from pasted multiline text or paragraphs
 */
export function parseMultipleShopeeUrls(rawText: string): ParsedLinkResult[] {
  if (!rawText) return [];

  const lines = rawText
    .split(/[\r\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const validResults: ParsedLinkResult[] = [];
  const invalidResults: ParsedLinkResult[] = [];
  const seenKeys = new Set<string>();

  for (const line of lines) {
    const parsed = parseShopeeUrl(line);
    if (parsed.valid && parsed.itemId) {
      const key = parsed.isShortlink ? parsed.originalUrl : String(parsed.itemId);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        validResults.push(parsed);
      }
    } else if (!parsed.valid && (/https?:\/\//i.test(line) || /\d{5,}/.test(line))) {
      invalidResults.push(parsed);
    }
  }

  return validResults.length > 0 ? validResults : invalidResults;
}
