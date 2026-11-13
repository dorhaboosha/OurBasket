"use client";

import { Button } from "@chakra-ui/react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function GoogleSignInButton({ label }: { label: string }) {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    // Navigates away to Google; on failure Better Auth sends the browser to /login?error=...
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/login",
    });
  }

  return (
    // The brand color (not a Chakra palette: teal.600 is below 4.5:1 with white text).
    <Button
      onClick={signIn}
      loading={pending}
      size="lg"
      w="full"
      bg="brand"
      color="white"
      _hover={{ bg: "brand", opacity: 0.9 }}
    >
      {label}
    </Button>
  );
}
