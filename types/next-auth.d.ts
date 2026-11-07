import { DefaultSession } from "next-auth";

type Role = "admin" | "user";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      /** Signed in with a seeded or temporary password that must be replaced. */
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
    sessionVersion?: number;
    firstLogin?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    /** Session version; a mismatch with the database signs the user out. */
    sv?: number;
    /** Must change password before using the app. */
    fl?: boolean;
  }
}
