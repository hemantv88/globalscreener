/**
 * GlobalScreener Pages Function — transitional data API boundary.
 *
 * Production intent:
 *   Browser -> /api -> R2 -> compact market payload
 *
 * This function deliberately contains NO screening/indicator logic.
 * It only validates the request, chooses a private R2 object, and returns
 * the pre-built API payload. Keeping the data access boundary here lets the
 * existing index.html use the same API contract later without exposing the
 * provider/acquisition layer.
 *
 * Required Cloudflare binding when activated:
 *   GS_DATA : R2 bucket containing api/IN.sm1.json, api/US.sm1.json,
 *             api/ETF.sm1.json and api/mktcap.json
 *
 * Until GS_DATA is configured, the route returns a clear 503 and the
 * existing Google Sheets/App Script path remains the application's active
 * source. This makes the change safe to deploy before storage is configured.
 */

const REGION_MAP = Object.freeze({
  India: 'IN',
  US: 'US',
  ETF: 'ETF'
});

const ALLOWED_ACTIONS = new Set(['health', 'getData', 'getMktCap']);

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders
    }
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.API_ALLOWED_ORIGIN || '').trim();
  if (allowed && origin === allowed) {
    return {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'vary': 'origin'
    };
  }
  return {};
}

function objectKeyFor(action, regionCode) {
  if (action === 'getMktCap') return 'api/mktcap.json';
  if (action === 'getData') return 'api/' + regionCode + '.sm1.json';
  return null;
}

async function readObject(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  return object.body;
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(context.request, context.env)
  });
}

export async function onRequestGet(context) {
  const headers = corsHeaders(context.request, context.env);
  const url = new URL(context.request.url);
  const action = String(url.searchParams.get('action') || 'health').trim();
  const region = String(url.searchParams.get('region') || '').trim();

  if (!ALLOWED_ACTIONS.has(action)) {
    return json({
      status: 'error',
      reason: 'unsupported_action',
      message: 'Unsupported API action.'
    }, 400, headers);
  }

  if (action === 'health') {
    return json({
      status: 'success',
      shape: 'gs-health-v1',
      service: 'GlobalScreener',
      data_source: 'r2',
      configured: !!context.env.GS_DATA
    }, 200, headers);
  }

  if (!context.env.GS_DATA) {
    return json({
      status: 'error',
      reason: 'storage_not_configured',
      message: 'GlobalScreener server data storage is not configured yet.'
    }, 503, headers);
  }

  if (action === 'getData') {
    const regionCode = REGION_MAP[region];
    if (!regionCode) {
      return json({
        status: 'error',
        reason: 'unsupported_region',
        message: 'Supported regions are India, US and ETF.'
      }, 400, headers);
    }

    const key = objectKeyFor(action, regionCode);
    const body = await readObject(context.env.GS_DATA, key);
    if (!body) {
      return json({
        status: 'error',
        reason: 'data_not_ready',
        message: 'No server-side snapshot is available for this market yet.'
      }, 503, headers);
    }

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...headers
      }
    });
  }

  const body = await readObject(context.env.GS_DATA, 'api/mktcap.json');
  if (!body) {
    return json({
      status: 'error',
      reason: 'data_not_ready',
      message: 'No server-side market-cap snapshot is available yet.'
    }, 503, headers);
  }

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers
    }
  });
}
