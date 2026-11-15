"use client";

import { Button, Text } from "@chakra-ui/react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function GoogleSignInButton({
  label,
  errorMessage,
}: {
  label: string;
  errorMessage: string;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    // On success the browser navigates away to Google; a failure at Google comes back
    // as /login?error=... . Here only the first step can fail (network, server error):
    // then the button works again and says so.
    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
        errorCallbackURL: "/login",
      });
      if (!error) return;
    } catch {
      // Same as a returned error.
    }
    setPending(false);
    setFailed(true);
  }

  return (
    <>
      {failed && (
        <Text role="alert" color="fg.error">
          {errorMessage}
        </Text>
      )}
      {/* The brand color (not a Chakra palette: teal.600 is below 4.5:1 with white text). */}
      <Button
        onClick={signIn}
        loading={pending}
        size="lg"
        w="full"
        bg="brand"
        color="white"
        _hover={{ bg: "brandHover" }}
      >
        {label}
      </Button>
    </>
  );
}
