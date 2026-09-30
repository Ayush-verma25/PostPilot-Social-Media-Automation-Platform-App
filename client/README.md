# PostPilot client

The React, TypeScript, and Vite frontend for PostPilot.

## Local development

Use Node.js 22 or newer. From this directory, install dependencies and start Vite:

```sh
npm ci
npm run dev
```

The local API URL defaults to `http://localhost:5000`. Override it with
`VITE_API_BASE_URL` in a local `.env` file when the API runs elsewhere.

## Production

Production builds require `VITE_API_BASE_URL`, set to the API origin without a
trailing slash or `/api` suffix:

```sh
npm ci --include=dev
npm run build
```

The output is written to `dist/`. Configure the static host to rewrite unknown
paths to `/index.html` so client-side routes work on refresh.

For complete Render setup, environment variables, and API deployment steps, see
the [root deployment guide](../README.md#deploying-to-render).

## Checks

```sh
npm run lint
npm run build
```
