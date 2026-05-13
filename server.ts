import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parsing middleware
  app.use(express.json());

  const ALLOWED_GOLD_HOSTS = [
    'jjsjo.com',
    'www.jjsjo.com',
    'royanews.tv',
    'www.royanews.tv',
  ];

  // Each pattern captures the 21K gram price from a different site's HTML structure.
  // Listed in priority order — first match wins.
  const GRAM_21K_PATTERNS = [
    // jjsjo.com — English label "21 K"
    /21\s*K\s*<\/td>\s*<td[^>]*>([\d.]+)/i,
    // royanews.tv and similar Arabic sites — Arabic label "21 غ", sell price is first td after label
    /21\s*غ\s*<\/td>\s*<td[^>]*>([\d.,]+)/i,
    // Generic fallback: any row labelled "21" followed immediately by a price td
    />\s*21\s*<\/td>\s*<td[^>]*>([\d.,]+)/i,
  ];

  function parse21kGramPrice(html: string): number | null {
    for (const pattern of GRAM_21K_PATTERNS) {
      const match = html.match(pattern);
      if (match?.[1]) {
        // Normalise thousand-separator commas (e.g. "95,500" → "95.500")
        const normalised = match[1].replace(/,/g, '.');
        const value = parseFloat(normalised);
        if (!isNaN(value) && value > 0) return value;
      }
    }
    return null;
  }

  // Formula: spot (USD/oz) → 21K gram → JOD → apply 2.1% JJSJO sell-side premium → ×8 coin
  // Factor derivation: (21/24) / 31.1035 / 1.41 × 1.021 × 8
  const METALS_LIVE_URL = 'https://api.metals.live/v1/spot';
  const COIN_GRAMS = 8;
  const KARAT_FACTOR = 21 / 24;
  const TROY_OZ_TO_GRAM = 31.1035;
  const USD_TO_JOD = 1 / 1.41;
  const JJSJO_PREMIUM = 1.021;

  function spotUsdToCoinJod(spotUsd: number): { gram21k: number; coin: number } {
    const gram21k = (spotUsd / TROY_OZ_TO_GRAM) * KARAT_FACTOR * USD_TO_JOD * JJSJO_PREMIUM;
    return { gram21k, coin: gram21k * COIN_GRAMS };
  }

  // API Route for fetching gold price (8g coin in JOD)
  app.get('/api/gold-price', async (req, res) => {
    try {
      const fetch = (await import('node-fetch')).default;
      const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; bWealth/1.0)' };

      // 1. Primary: metals.live — no API key required
      try {
        const mlRes = await fetch(METALS_LIVE_URL, { headers });
        if (mlRes.ok) {
          const data = await mlRes.json() as any;
          const spotUsd: number = Array.isArray(data) ? data[0]?.gold : data?.gold;
          if (spotUsd && !isNaN(spotUsd)) {
            const { gram21k, coin } = spotUsdToCoinJod(spotUsd);
            return res.json({
              price: coin,
              currency: 'JOD',
              meta: { localGram21k: gram21k, spotUsd, source: METALS_LIVE_URL, timestamp: new Date().toISOString() }
            });
          }
        }
      } catch (e) {
        console.warn('metals.live fetch failed, falling back to scrape:', e);
      }

      // 2. Fallback: scrape the user-configured gold price site
      const rawUrl = req.query.url ? String(req.query.url) : 'https://jjsjo.com/';
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return res.status(400).json({ error: 'Invalid URL' });
      }
      if (parsed.protocol !== 'https:' || !ALLOWED_GOLD_HOSTS.includes(parsed.hostname)) {
        return res.status(400).json({ error: 'URL not allowed. Only trusted gold price sources are permitted.' });
      }
      const targetUrl = parsed.toString();
      const scrapeRes = await fetch(targetUrl, { headers });
      if (!scrapeRes.ok) throw new Error(`Scrape failed from ${targetUrl}: ${scrapeRes.statusText}`);
      const html = await scrapeRes.text();
      const gram21k = parse21kGramPrice(html);
      if (gram21k === null) throw new Error(`Could not parse 21K price from ${targetUrl}. Page structure may have changed.`);
      return res.json({
        price: gram21k * COIN_GRAMS,
        currency: 'JOD',
        meta: { localGram21k: gram21k, source: targetUrl, timestamp: new Date().toISOString() }
      });

    } catch (error) {
      console.error('Error fetching gold price:', error);
      res.status(500).json({ error: 'Failed to fetch gold price', details: String(error) });
    }
  });

  // API Route for fetching gold API statistics
  app.get('/api/gold-stats', async (req, res) => {
    try {
      const fetch = (await import('node-fetch')).default;
      
      const goldApiKey = process.env.GOLD_API_KEY;
      if (!goldApiKey) {
        throw new Error('GOLD_API_KEY is not configured on the server environment variables.');
      }

      const statsResponse = await fetch('https://www.goldapi.io/api/stat', {
        headers: {
          'x-access-token': goldApiKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (!statsResponse.ok) {
        throw new Error(`Gold API stats fetch failed: ${statsResponse.statusText}`);
      }
      
      const statsData = await statsResponse.json();
      res.json(statsData);
    } catch (error) {
      console.error('Error fetching gold stats:', error);
      res.status(500).json({ error: 'Failed to fetch gold api stats', details: String(error) });
    }
  });

  // API Route for fetching gold API health status
  app.get('/api/gold-status', async (req, res) => {
    try {
      const fetch = (await import('node-fetch')).default;
      
      const statusResponse = await fetch('https://www.goldapi.io/api/status', {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!statusResponse.ok) {
        throw new Error(`Gold API status fetch failed: ${statusResponse.statusText}`);
      }
      
      const statusData = await statusResponse.json();
      res.json(statusData);
    } catch (error) {
      console.error('Error fetching gold status:', error);
      res.status(500).json({ error: 'Failed to fetch gold api status', details: String(error) });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve the built dist directory
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
