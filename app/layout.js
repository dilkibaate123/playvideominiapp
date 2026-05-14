import './globals.css';
import Script from 'next/script';

export const metadata = {
     title: 'Diskwala Video Downloader',
     description: 'Download videos fast and free from Terabox, Dropgalaxy, and more.',
};

export default function RootLayout({ children }) {
     return (
          <html lang="en">
               <head>
                    <meta name="theme-color" content="#000000" />
                    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                    <link
                         href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
                         rel="stylesheet"
                    />
               </head>
               <body>
                    {/* Telegram WebApp SDK */}
                    <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
                    {/* AdsGram SDK */}
                    <Script src="https://sad.adsgram.ai/js/sad.min.js" strategy="beforeInteractive" />

                    {/* Google Analytics */}
                    <Script src="https://www.googletagmanager.com/gtag/js?id=G-WRS6HDZHSY" strategy="afterInteractive" />
                    <Script id="google-analytics" strategy="afterInteractive">
                         {`
                              window.dataLayer = window.dataLayer || [];
                              function gtag(){dataLayer.push(arguments);}
                              gtag('js', new Date());
                              gtag('config', 'G-WRS6HDZHSY');
                         `}
                    </Script>

                    {children}
               </body>
          </html>
     );
}
