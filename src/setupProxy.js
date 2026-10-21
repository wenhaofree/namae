const crossFetch = require('cross-fetch');
const whoiser = require('whoiser');
const dns = require('dns');

const fetch = crossFetch.default || crossFetch;

function resolvePromise(hostname) {
  return new Promise((resolve, reject) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (err) return reject(err);
      resolve(addresses);
    });
  });
}

module.exports = function (app) {
  app.get('/api/services/:service/:query(*)', async (req, res) => {
    const { service, query } = req.params;
    const { existIf = '404' } = req.query;

    res.setHeader('Cache-Control', 's-maxage=86400');

    try {
      if (service === 'domain') {
        try {
          const response = await whoiser(query, { follow: 1, timeout: 6000 });
          const first = Object.values(response)[0];
          if (first && first['Domain Status']) {
            const availability = first['Domain Status'].length === 0;
            return res.json({ availability });
          }
          // Fallback to DNS resolve
          const addresses = await resolvePromise(query).catch(() => []);
          return res.json({ availability: addresses.length === 0 });
        } catch (e) {
          try {
            const addresses = await resolvePromise(query);
            return res.json({ availability: addresses.length === 0 });
          } catch (dnsErr) {
            return res.json({ availability: true });
          }
        }
      }

      if (service === 'npm') {
        const response = await fetch(
          `https://registry.npmjs.org/${encodeURIComponent(query)}`,
        );
        const availability = response.status === 404;
        return res.json({ availability });
      }

      if (service === 'existence') {
        const availableStatus = existIf.split(',').map((s) => s.trim());
        try {
          const targetUrl = query.startsWith('http')
            ? query
            : `https://${query}`;
          const response = await fetch(targetUrl, { method: 'HEAD' });
          const availability = availableStatus.includes(
            response.status.toString(),
          );
          return res.json({ availability });
        } catch (err) {
          if (
            err.code === 'ENOTFOUND' ||
            (err.message && err.message.includes('ENOTFOUND'))
          ) {
            return res.json({ availability: true });
          }
          return res.json({ availability: false });
        }
      }

      if (service === 'slack') {
        const response = await fetch(
          `https://${encodeURIComponent(query)}.slack.com`,
          { method: 'HEAD' },
        );
        const availability = response.status !== 200;
        return res.json({ availability });
      }

      if (service === 'gitlab') {
        const response = await fetch(
          `https://gitlab.com/${encodeURIComponent(query)}`,
          { redirect: 'manual' },
        );
        const availability = response.status === 302 || response.status === 404;
        return res.json({ availability });
      }

      if (service === 'twitter') {
        try {
          const response = await fetch(
            `https://api.twitter.com/i/users/username_available.json?username=${encodeURIComponent(query)}`,
          );
          const data = await response.json();
          return res.json({ availability: !!data.valid });
        } catch (err) {
          return res.json({ availability: false });
        }
      }

      if (service === 'dns') {
        try {
          const response = await resolvePromise(query);
          const availability = !response || response.length === 0;
          return res.json({ availability });
        } catch (err) {
          return res.json({ availability: true });
        }
      }

      if (service === 'jsorg') {
        try {
          const response = await fetch(
            `https://${encodeURIComponent(query)}.js.org`,
            { method: 'HEAD' },
          );
          const availability = response.status === 404;
          return res.json({ availability });
        } catch (err) {
          return res.json({ availability: true });
        }
      }

      if (service === 'appstore') {
        const countryCode = req.query.country || 'us';
        const response = await fetch(
          `https://itunes.apple.com/search?media=software&entity=software,iPadSoftware,macSoftware&country=${countryCode}&limit=5&term=${encodeURIComponent(query)}`,
        );
        const body = await response.json();
        const apps = (body.results || []).map((app) => ({
          id: String(app.trackId),
          name: app.trackName,
          viewURL: app.trackViewUrl,
          price: app.formattedPrice,
          author: app.sellerName,
        }));
        return res.json({ result: apps });
      }

      if (service === 'chrome-web-store' || service === 'firefox-addons') {
        return res.json({ result: [] });
      }

      if (service === 'archlinux') {
        try {
          const response = await fetch(
            `https://archlinux.org/packages/search/json/?q=${encodeURIComponent(query)}`,
          );
          const body = await response.json();
          const availability = (body.results || []).length === 0;
          return res.json({ availability });
        } catch (e) {
          return res.json({ availability: true });
        }
      }

      if (service === 'debian') {
        try {
          const response = await fetch(
            `https://packages.debian.org/buster/${encodeURIComponent(query)}`,
            { method: 'HEAD' },
          );
          const availability = response.status === 404;
          return res.json({ availability });
        } catch (e) {
          return res.json({ availability: true });
        }
      }

      if (service === 'launchpad') {
        try {
          const response = await fetch(
            `https://launchpad.net/ubuntu/+source/${encodeURIComponent(query)}`,
            { method: 'HEAD' },
          );
          const availability = response.status === 404;
          return res.json({ availability });
        } catch (e) {
          return res.json({ availability: true });
        }
      }

      // Default existence probe fallback
      try {
        const response = await fetch(`https://${query}`, { method: 'HEAD' });
        return res.json({ availability: response.status === 404 });
      } catch (e) {
        return res.json({ availability: true });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/list/:type/:query(*)', (req, res) => {
    res.json({ results: [] });
  });
};
