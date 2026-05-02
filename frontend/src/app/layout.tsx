import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SocketProvider } from '@/context/SocketContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { ConfigProvider } from '@/context/ConfigContext';
import DbStatusBanner from '@/components/DbStatusBanner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AccessPro - Time & Attendance',
  description: 'Employee management and attendance tracking system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <ConfigProvider>
            <DbStatusBanner />
            <SocketProvider>
              {children}
            </SocketProvider>
          </ConfigProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
