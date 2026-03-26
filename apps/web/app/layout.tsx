import { Fredoka, Plus_Jakarta_Sans, Geist_Mono } from "next/font/google"
import "@workspace/ui/globals.css"
import "@xterm/xterm/css/xterm.css"
import "./xterm-overrides.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils"

const fredoka = Fredoka({ variable: "--font-brand", subsets: ["latin"], weight: ["600", "700"] })
const jakarta = Plus_Jakarta_Sans({ variable: "--font-sans", subsets: ["latin"] })
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] })

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("dark antialiased", fredoka.variable, jakarta.variable, mono.variable)}
    >
      <body className="bg-background font-sans text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
