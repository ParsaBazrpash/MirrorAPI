"use client"

import { SignInButton } from "@/components/auth/signin-button"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import Image from "next/image"

export default function SignInPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/")
    }
  }, [status, router])

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (status === "authenticated") {
    return null
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header matching main page */}
      <header className="bg-[#D62311] text-white shadow-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Image 
                src="/samples/logo.png" 
                alt="State Farm Logo" 
                width={40} 
                height={40}
                className="object-contain cursor-pointer"
                onClick={() => router.push('/')}
              />
              <button
                onClick={() => router.push('/')}
                className="text-xl font-bold hover:opacity-80 transition-opacity cursor-pointer"
              >
                MirrorAPI
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Sign In Content */}
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 border border-gray-200">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#D62311] mb-2">
              Welcome to API Migration Copilot
            </h1>
            <p className="text-gray-600">
              Sign in to get started with API schema comparison and migration
            </p>
          </div>

          <SignInButton />

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>
              By signing in, you agree to our terms of service and privacy policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

