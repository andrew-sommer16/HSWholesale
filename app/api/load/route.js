import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const signedPayload = searchParams.get('signed_payload_jwt');

  try {
    const parts = signedPayload.split('.');
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64').toString('utf8')
    );

    const storeHash = payload.sub.split('/')[1];

    // Return an HTML page that opens the app in a new tab
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head><title>B2B Analytics</title></head>
        <body>
          <script>
            window.open('${process.env.BIGCOMMERCE_APP_URL}/dashboard?store_hash=${storeHash}', '_blank');
            document.write('<p>Opening B2B Analytics... <a href="${process.env.BIGCOMMERCE_APP_URL}/dashboard?store_hash=${storeHash}" target="_blank">Click here if it did not open</a></p>');
          </script>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' },
    });

  } catch (err) {
    console.error('Load error:', err);
    return NextResponse.json({ error: 'Load failed' }, { status: 500 });
  }
}