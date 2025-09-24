import NextAuth from "next-auth";
import { NextRequest } from "next/server";
import { User } from "@/lib/db/schema";

declare module "next-auth" {
  interface Session {
    user : {
      id : string,
      name : string
    }
  }
}

declare module "next/server"{
  interface NextRequest{
    user : User
  }
}