// middleware/authDebugLogger.js
function redactTok(s) {
  if (!s) return null;
  return String(s).slice(0, 8) + '...';
}

module.exports = function authDebugLogger(req, res, next) {
  // Log kondisi masuk
  const cookieHeader = req.headers.cookie;
  const cookies = req.cookies || {};
  const hasAccess = Boolean(cookies.accessToken);
  const hasRefresh = Boolean(cookies.refreshToken);

  console.log(
    '[AUTH-DEBUG IN]',
    JSON.stringify({
      method: req.method,
      url: req.originalUrl,
      origin: req.get('origin') || null,
      referer: req.get('referer') || null,
      secFetchSite: req.get('sec-fetch-site') || null,
      hasCookieHeader: !!cookieHeader,
      cookieHeaderLen: cookieHeader ? cookieHeader.length : 0,
      cookieKeys: Object.keys(cookies),
      hasAccessCookie: hasAccess,
      hasRefreshCookie: hasRefresh,
      hasAuthHeader: !!req.headers.authorization,
      protocol: req.protocol,
      secureConn: req.secure,
      ip: req.ip,
      userAgent: req.get('user-agent') || null,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        COOKIE_SAMESITE: process.env.COOKIE_SAMESITE,
        COOKIE_SECURE: process.env.COOKIE_SECURE
      }
    })
  );

  // Log Set-Cookie yang keluar (sanitize token) tepat sebelum header dikirim
  const _cookie = res.cookie.bind(res);
  res.cookie = (name, value, options) => {
    // panggil asli dulu
    _cookie(name, value, options);
    try {
      const set = res.getHeader('set-cookie');
      const arr = Array.isArray(set) ? set : set ? [set] : [];
      const sanitized = arr.map((v) =>
        String(v).replace(
          /(accessToken|refreshToken)=([^;]+)/g,
          '$1=<redacted>'
        )
      );
      console.log('[AUTH-DEBUG OUT Set-Cookie]', sanitized);
    } catch (e) {
      console.log('[AUTH-DEBUG OUT Set-Cookie ERROR]', e?.message);
    }
    return res;
  };

  next();
};
