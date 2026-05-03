import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parsing middleware
  app.use(express.json());

  // API Route for fetching gold price (8g coin in JOD)
  app.get('/api/gold-price', async (req, res) => {
    try {
      const fetch = (await import('node-fetch')).default;
      
      // Fetch Gold Spot Price in USD (Troy Ounce)
      const goldResponse = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F', {
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });
      if (!goldResponse.ok) throw new Error(`Gold fetch failed: ${goldResponse.statusText}`);
      const goldData = await goldResponse.json() as any;
      const priceOzUsd = goldData?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (!priceOzUsd || typeof priceOzUsd !== 'number') throw new Error('Invalid gold data');

      // Fetch USD to JOD exchange rate
      const fxResponse = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!fxResponse.ok) throw new Error(`FX fetch failed: ${fxResponse.statusText}`);
      const fxData = await fxResponse.json() as any;
      const usdToJod = fxData?.rates?.JOD;
      if (!usdToJod) throw new Error('Invalid FX data');

      // Calculate 8g 21k coin price in JOD
      // 1 Troy Ounce = 31.1034768 grams
      // 24k price
      const pricePerGramUsd = priceOzUsd / 31.1034768;
      // 21k price
      const pricePerGram21kUsd = pricePerGramUsd * (21 / 24);
      // 8g coin
      const price8g21kUsd = pricePerGram21kUsd * 8;
      // convert to JOD and add making charge if applicable (typically 2-5 JOD, let's keep it pure or add a small margin?)
      // Let's use pure exchange unless otherwise specified.
      const price8g21kJod = price8g21kUsd * usdToJod;
      
      res.json({ price: price8g21kJod, currency: 'JOD' });
    } catch (error) {
      console.error('Error fetching gold price:', error);
      res.status(500).json({ error: 'Failed to fetch gold price', details: String(error) });
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
