import { NextRequest } from "next/server"

interface UserFromToken {
  id: number
  email: string
  name: string
  role: string
}

export async function getUserFromRequest(request: NextRequest): Promise<UserFromToken | null> {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null
    }

    const token = authHeader.substring(7)

    const userResponse = await fetch("https://orca.distark.com/api/v1/me.json", {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    })

    if (!userResponse.ok) {
      console.error("Failed to fetch user profile:", userResponse.status)
      return null
    }

    const userData = await userResponse.json()

    return {
      id: userData.id,
      email: userData.email,
      name: userData.name || userData.email?.split("@")[0] || "User",
      role: userData.role || "user",
    }
  } catch (error) {
    console.error("Error getting user from request:", error)
    return null
  }
}

export async function getUserIdFromRequest(request: NextRequest): Promise<number | null> {
  const user = await getUserFromRequest(request)
  return user?.id || null
}
