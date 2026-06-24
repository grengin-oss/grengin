# Nginx `Cache-Control` for `/assets/`

Vite emits hashed files under `dist/assets/`. This matches `public/_headers`: long cache and `immutable` for that folder only. **Everything else** (e.g. `index.html`, icons, SPA `try_files`) can use your normal nginx defaults—no extra cache headers required in this doc.

Add inside your existing `server { ... }` (order matters: place before broad regex `location` blocks if you use them):

```nginx
location ^~ /assets/ {
    add_header Cache-Control "public, max-age=2592000, immutable" always;
    try_files $uri =404;
}
```

- **`max-age=2592000`** — 30 days, same as `_headers`.
- **`immutable`** — tells caches the URL’s contents never change for that URL (safe because the filename is content-hashed).
- **`^~`** — prefix match and stops search for regex locations that might also match.

Nginx does not read `_headers`; copy this policy when you serve `dist/` yourself.

**Check:**

```bash
curl -sI https://your-host/assets/<hashed-file>.js | grep -i cache-control
```

Expect: `public, max-age=2592000, immutable`.
