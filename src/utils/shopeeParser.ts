import { ParsedLinkResult } from '../types/shopee';

/**
 * Extracts human-readable product title from Shopee URL path
 */
function cleanSlug(slug: string): string {
  if (!slug) return 'Produk Shopee';
  return slug
    .replace(/-i\.\d+\.\d+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

/**
 * Parses a single Shopee URL or product identifier
 */
export function parseShopeeUrl(rawInput: string): ParsedLinkResult {
  const input = rawInput.trim();
  if (!input) {
    return { valid: false, originalUrl: input, error: 'Link kosong' };
  }

  try {
    // 1. Standard Shopee URL pattern: /Title-i.SHOP_ID.ITEM_ID
    const standardMatch = input.match(/i\.(\d+)\.(\d+)/i);
    if (standardMatch) {
      const shopId = parseInt(standardMatch[1], 10);
      const itemId = parseInt(standardMatch[2], 10);
      
      // Extract title from slug if present
      let title = 'Produk Shopee';
      const urlObj = input.startsWith('http') ? new URL(input) : null;
      if (urlObj) {
        const pathSegments = urlObj.pathname.split('/').filter(Boolean);
        if (pathSegments.length > 0) {
          const lastSegment = decodeURIComponent(pathSegments[0] || '');
          title = cleanSlug(lastSegment);
        }
      }

      return {
        valid: true,
        shopId,
        itemId,
        name: title || `Produk #${itemId}`,
        originalUrl: input.startsWith('http') ? input : `https://shopee.co.id/product/${shopId}/${itemId}`,
        domain: urlObj?.hostname || 'shopee.co.id',
      };
    }

    // 2. /product/SHOP_ID/ITEM_ID pattern
    const productPathMatch = input.match(/product\/(\d+)\/(\d+)/i);
    if (productPathMatch) {
      const shopId = parseInt(productPathMatch[1], 10);
      const itemId = parseInt(productPathMatch[2], 10);
      return {
        valid: true,
        shopId,
        itemId,
        name: `Produk Shopee #${itemId}`,
        originalUrl: input.startsWith('http') ? input : `https://shopee.co.id/product/${shopId}/${itemId}`,
        domain: 'shopee.co.id',
      };
    }

    // 3. Query params itemid & shopid
    if (input.includes('itemid=') || input.includes('item_id=')) {
      const itemMatch = input.match(/(?:itemid|item_id)=(\d+)/i);
      const shopMatch = input.match(/(?:shopid|shop_id)=(\d+)/i);
      if (itemMatch) {
        const itemId = parseInt(itemMatch[1], 10);
        const shopId = shopMatch ? parseInt(shopMatch[1], 10) : 0;
        return {
          valid: true,
          shopId,
          itemId,
          name: `Produk Shopee #${itemId}`,
          originalUrl: input,
          domain: 'shopee.co.id',
        };
      }
    }

    // 4. Raw IDs separated by dot or slash: 12345678.987654321 or 12345678/987654321
    const rawMatch = input.match(/^(\d{5,12})[.\/](\d{6,14})$/);
    if (rawMatch) {
      const shopId = parseInt(rawMatch[1], 10);
      const itemId = parseInt(rawMatch[2], 10);
      return {
        valid: true,
        shopId,
        itemId,
        name: `Produk #${itemId}`,
        originalUrl: `https://shopee.co.id/product/${shopId}/${itemId}`,
        domain: 'shopee.co.id',
      };
    }

    // 5. Shortlink (shp.ee / shope.ee) without resolved ID
    if (/shpe?\.ee\/[a-zA-Z0-9]+/i.test(input)) {
      // Create a deterministic identifier from the shortlink hash for demo / tracking
      const hash = input.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'item';
      let numericId = 0;
      for (let i = 0; i < hash.length; i++) {
        numericId = (numericId * 31 + hash.charCodeAt(i)) % 900000000;
      }
      const itemId = 100000000 + Math.abs(numericId);
      return {
        valid: true,
        shopId: 10420192,
        itemId,
        name: `Produk Shopee (${hash.toUpperCase()})`,
        originalUrl: input,
        domain: 'shp.ee',
      };
    }

    return {
      valid: false,
      originalUrl: input,
      error: 'Format link tidak dikenali. Gunakan format shopee.co.id/...-i.SHOP_ID.ITEM_ID atau /product/SHOP_ID/ITEM_ID',
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

  // Split by newlines, commas, or semicolons
  const lines = rawText
    .split(/[\r\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const results: ParsedLinkResult[] = [];
  const seenItemIds = new Set<number>();

  for (const line of lines) {
    const parsed = parseShopeeUrl(line);
    if (parsed.valid && parsed.itemId) {
      if (!seenItemIds.has(parsed.itemId)) {
        seenItemIds.add(parsed.itemId);
        results.push(parsed);
      }
    } else if (!parsed.valid && line.length > 5) {
      results.push(parsed);
    }
  }

  return results;
}
