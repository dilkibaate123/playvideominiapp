import './globals.css';

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
                    {/* Telegram WebApp SDK */}
                    <script src="https://telegram.org/js/telegram-web-app.js" />
                    {/* Monetag SDK */}
                    <script src="//libtl.com/sdk.js" data-zone="10765305" data-sdk="show_10765305" async></script>
                    
                    {/* Google Analytics */}
                    <script async src="https://www.googletagmanager.com/gtag/js?id=G-WRS6HDZHSY"></script>
                    <script
                         dangerouslySetInnerHTML={{
                              __html: `
                                   window.dataLayer = window.dataLayer || [];
                                   function gtag(){dataLayer.push(arguments);}
                                   gtag('js', new Date());
                                   gtag('config', 'G-WRS6HDZHSY');
                              `,
                         }}
                    />
               </head>
               <body>{children}</body>
          </html>
     );
}
