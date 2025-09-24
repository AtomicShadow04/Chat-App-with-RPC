/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import NextAuth from "next-auth"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "./db/utils"
import CredentialsProvider from "next-auth/providers/credentials"
import GitHubProvider from "next-auth/providers/github"
import GoogleProvider from "next-auth/providers/google"
import FacebookProvider from "next-auth/providers/facebook"
import {User, user} from './db/schema'
import { getUserById, getUserByEmail } from "./db/queries"
import { accounts, verificationTokens, sessions, authenticators } from "./db/nextauthschema"
import { NextApiRequest, NextApiResponse } from "next"
import { addRateLimitHeaders, authRateLimit, RateLimitError } from "./rate-limit"
import { loginSchema } from "@/app/(chat)/api/auth/schema"
import bcrypt from "bcryptjs"
import { emailTemplates, sendEmail } from "./email"

type Token = {
  user : User
}

type Credentials = {
  email : string,
  password : string
}
 
export const auth = async (req : NextApiRequest, res : NextApiResponse) => {
  return await NextAuth(req, res, {
    adapter: DrizzleAdapter(db, {
      usersTable : user,
      accountsTable : accounts,
      sessionsTable : sessions,
      verificationTokensTable : verificationTokens,
      authenticatorsTable : authenticators
    }),
    providers: [
      GitHubProvider({
        clientId: "", //replace with env KEY
        clientSecret : ""
      }), 
      GoogleProvider({
        clientId: "",
        clientSecret : ""
      }), 
      FacebookProvider({
        clientId: "",
        clientSecret : ""
      }),
      CredentialsProvider({
        name : "credentials",
        //@ts-ignore
        async authorize(credentials : Credentials, req){
          const startTime = Date.now();
          const clientIP = req?.headers?.get("x-forwarded-for") || req?.headers?.get("x-real-ip") || "unknown";
          try {
            try {
              await authRateLimit(req as any);
            } catch (error) {
              if (error instanceof RateLimitError) {
                const headers = new Headers();
                addRateLimitHeaders(
                  headers,
                  error.limit,
                  error.remaining,
                  Date.now() + 15 * 60 * 1000,
                  error.retryAfter
                );
        
                return res.json(
                  {
                    error: "Too many login attempts",
                    message: "Please wait before trying again",
                    retryAfter: error.retryAfter,
                    status: 429,
                    headers,
                  },
                );
              }
              throw error;
            }

            let body;
            try {
              body = credentials
            } catch (error) {
              return res.json(
                {
                  error: "Invalid JSON in request body",
                  message: "Please check your request format",
                  status: 400
                }
              );
            }
        
            const validation = loginSchema.safeParse(body);
            if (!validation.success) {
              return res.json(
                {
                  error: "Invalid request data",
                  message: "Please check your email and password format",
                  details: validation.error.issues.map((issue) => ({
                    field: issue.path.join("."),
                    message: issue.message,
                  })),
                  status: 400
                },
              );
            }
            const { email, password } = validation.data;
            const user = await getUserByEmail(email)
            if(!user){
              return res.json(
                {
                  error: "Service temporarily unavailable",
                  message: "Please try again in a few moments",
                  status: 503 
                },
              );
            }
            
            const isPasswordValid = await bcrypt.compare(password, user.password)
            if (!isPasswordValid) {
              throw new Error("Invalid credentials")
            }

            setImmediate(async () => {
              try {
                const loginMessage = `You have successfully logged in at ${new Date().toLocaleString()}.`
                await sendEmail({
                  to: email,
                  ...emailTemplates.notification(user.name, loginMessage, "Chat App"),
                })
              } catch (err) {
                console.error("Failed to send login notification email:", err)
              }
            })

            // 🔹 Sanitize user
            const { password: _, ...safeUser } = user
            return safeUser
          } catch (error) {
            console.error("Authorize error:", error)
            return null
          }
        }
      })
    ],
    session :{
      strategy : "jwt"
    },
    callbacks : {
      async jwt({token , user}) {
        const jwtToken = token as Token
        user && (token.user = user)

        //update session when user is updated
        if(req?.url?.includes("/api/auth/session?update")) {
          const updatedUser = await getUserById(jwtToken?.user?.id)
          token.user = updatedUser
        }
        return token
      },
      async session({session,token}){
        session.user = token.user as User
        //we have to make sure the hashed user password is not returned 
        
        // @ts-ignore
        delete session?.user?.password
        return session;
      }
    },
    pages : {
      signIn : "", //add sign in route
      signOut : "" //add redirect on sign out
    },
    secret : process.env.AUTH_SECRET
  })
}

export {auth as GET, auth as POST}