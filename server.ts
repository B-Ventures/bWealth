import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parsing middleware
  app.use(express.json());

  const ALLOWED_GOLD_HOSTS = ['jjsjo.com', 'www.jjsjo.com'];

  // API Route for fetching gold price (8g coin in JOD)
  app.get('/api/gold-price', async (req, res) => {
    try {
      const fetch = (await import('node-fetch')).default;

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

      const response = await fetch(targetUrl);
      if (!response.ok) {
        throw new Error(`Scrape fetch failed from ${targetUrl}: ${response.statusText}`);
      }
      
      const html = await response.text();
      
      // Match the 21K row and extract the selling price
      const match21k = html.match(/21 K\s*<\/td>\s*<td>([\d.]+)<\/td>/i);
      
      if (!match21k || !match21k[1]) {
        throw new Error(`Could not parse 21K price from ${targetUrl}`);
      }
      
      const localGramPrice21kJod = parseFloat(match21k[1]);
      
      if (isNaN(localGramPrice21kJod)) {
         throw new Error('Parsed 21K price is not a number');
      }

      // Convert from local gram price to English Coin price (8g)
      // As per user, just multiply the gram price by 8
      const finalCoinPriceJod = localGramPrice21kJod * 8;
      
      res.json({ 
        price: finalCoinPriceJod, 
        currency: 'JOD',
        meta: {
          localGram21k: localGramPrice21kJod,
          source: targetUrl,
          timestamp: new Date().toISOString()
        }
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
