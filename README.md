# AI Proxy Relay — Node.js

Stateless HTTP header relay untuk 9Router / VansRouter. Cocok untuk Railway, Render, Fly.io, Koyeb, Northflank, dan VPS.

## Deploy cepat

### Railway / Render / Koyeb

1. Import repository ini dari GitHub.
2. Gunakan build/runtime Node.js.
3. Start command:

```bash
npm start
```

Platform harus meneruskan `PORT` otomatis. Jangan hardcode port publik.

### Docker / Fly.io / VPS

```bash
docker build -t ai-proxy-relay-node .
docker run --rm -p 8080:8080 ai-proxy-relay-node
```

Environment optional:

```text
UPSTREAM_TIMEOUT_MS=120000
HEALTH_HOSTS=httpbin.org,api.httpbin.org,www.google.com
```

## Pasang di 9Router

Gunakan URL origin-only hasil deploy, tanpa path, query, atau hash:

```text
https://<project-host>
```

Set pool `type` sebagai `vercel` pada router versi lama agar memakai header-relay branch. Jangan gunakan `type: http`.

Jika router mendukung type native `node` atau `railway`, gunakan type tersebut hanya jika branch header relay memang tersedia. Node relay tetap menerima trafik melalui URL HTTPS platform.

## Test

```bash
curl -i "https://<project-host>/__health"
```

```bash
curl -i "https://<project-host>/" -H "x-relay-target: https://httpbin.org" -H "x-relay-path: /get"
```

```bash
curl -i "https://<project-host>/" -H "x-relay-target: https://api.deepseek.com" -H "x-relay-path: /v1/models"
```

Health shim `200` berarti relay hidup. `401` dari DeepSeek berarti relay berhasil mencapai provider dan provider meminta API key.

## Behavior

- Meneruskan method, body, authorization, dan header request lain yang aman.
- Menghapus hop-by-hop, internal relay, dan forwarding headers.
- Memaksa `accept-encoding: identity` agar response streaming tidak rusak.
- Timeout upstream default 120 detik.
- Error koneksi dikembalikan sebagai JSON `502`; timeout sebagai JSON `504`.
- Tidak menyimpan request, API key, atau response.
