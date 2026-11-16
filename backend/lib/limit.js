// request limit: each user (by ip) may call a route only so many times per minute
// used on the routes that make the server work hard (ai answers and the robot voice)
module.exports = function limit(max, windowMs = 60e3) {
  const hits = new Map();                              // ip -> times of recent requests
  setInterval(() => {                                  // forget old ips
    const n = Date.now();
    for (const [ip, t] of hits) if (!t.length || n - t[t.length - 1] > windowMs) hits.delete(ip);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const t = (hits.get(req.ip) || []).filter(x => now - x < windowMs);
    if (t.length >= max) {
      res.set('Retry-After', String(Math.ceil((t[0] + windowMs - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Wait a moment and try again.' });
    }
    t.push(now);
    hits.set(req.ip, t);
    next();
  };
};
