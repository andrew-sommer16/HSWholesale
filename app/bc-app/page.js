export default function BCAppPage() {
  return (
    <html>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            if (window.top !== window.self) {
              // We're in an iframe - open in new tab
              window.open('${process.env.NEXT_PUBLIC_APP_URL}/dashboard', '_blank');
            } else {
              window.location.href = '/dashboard';
            }
          `
        }} />
      </head>
      <body>
        <p>Opening B2B Analytics...</p>
      </body>
    </html>
  );
}