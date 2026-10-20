import { headers } from "next/headers";
import { USER_HEADER } from "@/lib/sso";
import Dashboard from "./Dashboard";

export const dynamic = "force-dynamic";

/** De middleware heeft al gecontroleerd wie dit is en of die erin mag. */
export default async function Page() {
  const raw = (await headers()).get(USER_HEADER);
  return <Dashboard user={raw ? decodeURIComponent(raw) : null} />;
}
