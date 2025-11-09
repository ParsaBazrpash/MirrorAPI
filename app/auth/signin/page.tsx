"use client"

import { SignInButton } from "@/components/auth/signin-button"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import Image from "next/image"
import { useTheme } from "@/components/theme/theme-provider"
import { ThemeToggle } from "@/components/theme/theme-toggle"

export default function SignInPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { theme } = useTheme()

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/")
    }
  }, [status, router])

  // Theme colors
  const bgColor = theme === "light" ? "bg-white" : "bg-black";
  const headerBgColor = theme === "light" ? "bg-[#D62311]" : "bg-[#76B900]";
  const cardBgColor = theme === "light" ? "bg-white" : "bg-gray-900";
  const borderColor = theme === "light" ? "border-gray-200" : "border-gray-800";
  const textColor = theme === "light" ? "text-gray-900" : "text-gray-100";
  const mutedTextColor = theme === "light" ? "text-gray-600" : "text-gray-400";
  const primaryTextColor = theme === "light" ? "text-[#D62311]" : "text-[#76B900]";

  if (status === "loading") {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bgColor} transition-colors`}>
        <div className={mutedTextColor}>Loading...</div>
      </div>
    )
  }

  if (status === "authenticated") {
    return null
  }

  return (
    <div className={`min-h-screen ${bgColor} transition-colors`}>
      {/* Header matching main page */}
      <header className={`${headerBgColor} text-white shadow-md transition-colors`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Image 
                src={theme === "light" ? "/samples/logo.png" : "/samples/nvidia.png"} 
                alt={theme === "light" ? "State Farm Logo" : "NVIDIA Logo"} 
                width={40} 
                height={40}
                className="object-contain cursor-pointer transition-opacity"
                onClick={() => router.push('/')}
              />
              <button
                onClick={() => router.push('/')}
                className="text-xl font-bold hover:opacity-80 transition-opacity cursor-pointer"
              >
                MirrorAPI
              </button>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Sign In Content */}
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
        <div className={`max-w-md w-full ${cardBgColor} rounded-lg shadow-lg p-8 border ${borderColor} transition-colors`}>
          <div className="text-center mb-8">
            <h1 className={`text-3xl font-bold ${primaryTextColor} mb-2 transition-colors`}>
              Welcome to MirrorAPI
            </h1>
            <p className={mutedTextColor}>
              Sign in to get started with API schema migration analysis
            </p>
          </div>

          <SignInButton />

          <div className={`mt-6 text-center text-sm ${mutedTextColor} transition-colors`}>
            <p>
              By signing in, you agree to our terms of service and privacy policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

