"use client";

import { Button } from "@chakra-ui/react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ label }: { label: string }) {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    // On failure stay put, so the button can be tried again: going to /login while the
    // session is still valid would only bounce back, looking signed out when it isn't.
    let signedOut = false;
    try {
      signedOut = !(await authClient.signOut()).error;
    } catch {}
    if (!signedOut) {
      setPending(false);
      return;
    }
    // A full page load, not a client navigation: it drops everything the signed-in
    // pages kept in memory.
    window.location.replace("/login");
  }

  return (
    // 44px high on every screen: big enough to tap (spec 5.2).
    <Button onClick={signOut} loading={pending} variant="outline" size="lg">
      {label}
    </Button>
  );
}
