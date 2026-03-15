import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { AuthProvider } from "@/lib/auth-context"
import { Suspense } from "react"
import { Navigation } from "@/components/navigation"
import "../globals.css"

export const metadata: Metadata = {
  title: "BugFixVibe",
  description: "Submit bug reports and get AI-powered fixes",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <AuthProvider>
          <div className="min-h-screen bg-background">
            <Navigation />
            <Suspense fallback={null}>{children}</Suspense>
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
