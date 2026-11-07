import { DefaultSession } from "next-auth";

type Role = "admin" | "user";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    /** Session version; a mismatch with the database signs the user out. */
    sv?: number;
  }
}
