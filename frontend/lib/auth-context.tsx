"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"
import type { User } from "./db-types"

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  isLoading: boolean
  getToken: () => string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedUser = localStorage.getItem("distark_user")
    const storedToken = localStorage.getItem("distark_token")

    if (storedUser && storedToken) {
      try {
        setUser(JSON.parse(storedUser))
      } catch (error) {
        console.error("Failed to parse stored user:", error)
        localStorage.removeItem("distark_user")
        localStorage.removeItem("distark_token")
      }
    } else {
      localStorage.removeItem("distark_user")
      localStorage.removeItem("distark_token")
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true)

    try {
      const formData = new URLSearchParams()
      formData.append('email', email)
      formData.append('password', password)

      const response = await fetch("https://orca.distark.com/api/v1/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      })

      if (!response.ok) {
        return false
      }

      const data = await response.json()

      if (data.token) {
        localStorage.setItem("distark_token", data.token)

        try {
          const userResponse = await fetch("https://orca.distark.com/api/v1/me.json", {
            method: "GET",
            headers: {
              "Accept": "application/json",
              "Authorization": `Bearer ${data.token}`,
            },
          })

          if (userResponse.ok) {
            const userData = await userResponse.json()

            const user: User = {
              id: userData.id,
              email: userData.email || email,
              name: userData.name || userData.email?.split("@")[0] || "User",
              role: Array.isArray(userData.roles) && userData.roles.includes("admin") ? "admin" : (userData.role || "user"),
              created_at: userData.created_at || new Date().toISOString(),
              updated_at: userData.updated_at || new Date().toISOString(),
            }

            setUser(user)
            localStorage.setItem("distark_user", JSON.stringify(user))
            return true
          }
        } catch (error) {
          console.error("Error fetching user profile:", error)
        }

        const fallbackUser: User = {
          id: Date.now(),
          email: email,
          name: email.split("@")[0],
          role: "user",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        setUser(fallbackUser)
        localStorage.setItem("distark_user", JSON.stringify(fallbackUser))
        return true
      }

      return false
    } catch (error) {
      console.error("Login error:", error)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem("distark_user")
    localStorage.removeItem("distark_token")
  }

  const getToken = () => {
    return localStorage.getItem("distark_token")
  }

  return <AuthContext.Provider value={{ user, login, logout, isLoading, getToken }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
