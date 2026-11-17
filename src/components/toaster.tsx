"use client";

import { Toaster as ChakraToaster, Portal, Stack, Toast, createToaster } from "@chakra-ui/react";

/**
 * Short messages at the bottom of the screen (spec 5.2), for example "deleted" with an
 * "undo" button. Raised above the phone's bottom navigation bar.
 */
export const toaster = createToaster({
  placement: "bottom",
  pauseOnPageIdle: true,
  max: 3,
  offsets: { top: "1rem", left: "1rem", right: "1rem", bottom: "5rem" },
});

export function Toaster({ closeLabel }: { closeLabel: string }) {
  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: "4" }}>
        {(toast) => (
          <Toast.Root width={{ md: "md" }} alignItems="center">
            <Toast.Indicator />
            <Stack gap="1" flex="1" maxWidth="100%">
              {toast.title && <Toast.Title>{toast.title}</Toast.Title>}
              {toast.description && <Toast.Description>{toast.description}</Toast.Description>}
            </Stack>
            {/* At least 44px high, to tap on a phone (spec 5.2). */}
            {toast.action && (
              <Toast.ActionTrigger minH="11" px="4" fontSize="md">
                {toast.action.label}
              </Toast.ActionTrigger>
            )}
            {toast.closable && (
              <Toast.CloseTrigger minW="11" minH="11" aria-label={closeLabel} position="static" />
            )}
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  );
}
