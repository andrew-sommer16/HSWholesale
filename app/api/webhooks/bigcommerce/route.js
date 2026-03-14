import { NextResponse } from 'next/server';
import crypto from 'crypto';

const STORE_HASH = process.env.BIGCOMMERCE_STORE_HASH;
const BASE_URL = process.env.BIGCOMMERCE_APP_URL;

// Verify BC webhook signature
function verifySignature(payload, signature, secret) {
  if (!secret) return true; // skip verification if no secret set
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return expected === signature;
}

// Map BC webhook scope to sync endpoint
function getSyncEndpoint(scope) {
  if (scope?.includes('order')) return 'b2b-orders';
  if (scope?.includes('quote') || scope?.includes('rfq')) return 'quotes';
  if (scope?.includes('invoice')) return 'b2b-invoices';
  if (scope?.includes('payment')) return 'invoice-payments';
  if (scope?.includes('company')) return 'companies';
  if (scope?.includes('customer')) return 'companies';
  return null;
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-webhook-signature') || '';
    const webhookSecret = process.env.BC_WEBHOOK_SECRET;

    if (webhookSecret && !verifySignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const { scope, data } = payload;

    console.log('Webhook received:', scope, data);

    const endpoint = getSyncEndpoint(scope);

    if (endpoint) {
      // Fire targeted sync in background — don't await so we return 200 fast
      fetch(`${BASE_URL}/api/sync/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_hash: STORE_HASH }),
      }).catch(err => console.error(`Webhook sync error for ${endpoint}:`, err));
    }

    // BC requires a 200 response within 5 seconds
    return NextResponse.json({ received: true });

  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// BC sends a GET to verify the endpoint exists
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}