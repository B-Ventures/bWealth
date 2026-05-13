import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parsing middleware
  app.use(express.json());

  const GOLDAPI_URL = 'https://www.goldapi.io/api/XAU/USD';
  const METALS_LIVE_URL = 'https://api.metals.live/v1/spot';

  // Returns raw spot price in USD/oz. Client applies the country-specific formula.
  app.get('/api/gold-price', async (req, res) => {
    try {
      const fetch = (await import('node-fetch')).default;
      const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; bWealth/1.0)' };

      // 1. goldapi.io — reliable, already proven, requires GOLD_API_KEY env var
      const goldApiKey = process.env.GOLD_API_KEY;
      if (goldApiKey) {
        try {
          const gaRes = await fetch(GOLDAPI_URL, {
            headers: { ...headers, 'x-access-token': goldApiKey, 'Content-Type': 'application/json' }
          });
          if (gaRes.ok) {
            const data = await gaRes.json() as any;
            const spotUsd: number = data?.price;
            if (spotUsd && !isNaN(spotUsd)) {
              return res.json({ spotUsd, source: GOLDAPI_URL, timestamp: new Date().toISOString() });
            }
          }
        } catch (e) {
          console.warn('goldapi.io failed, trying metals.live:', e);
        }
      }

      // 2. metals.live — free, no key required
      const mlRes = await fetch(`${METALS_LIVE_URL}?_t=${Date.now()}`, { headers });
      if (!mlRes.ok) throw new Error(`metals.live responded ${mlRes.status} ${mlRes.statusText}`);
      const mlData = await mlRes.json() as any;
      const spotUsd: number = Array.isArray(mlData)
        ? mlData.find((item: any) => typeof item?.gold === 'number')?.gold
        : mlData?.gold;
      if (!spotUsd || isNaN(spotUsd)) throw new Error('Unexpected response shape from metals.live');
      res.json({ spotUsd, source: METALS_LIVE_URL, timestamp: new Date().toISOString() });

    } catch (error) {
      console.error('Error fetching gold spot price:', error);
      res.status(500).json({ error: 'Failed to fetch gold spot price', details: String(error) });
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
