import { getCurrentUser } from "@/modules/auth/current-user";
import { authorizeChannel } from "@/modules/realtime/server";

// Pusher asks here before the browser may listen on the private channel (spec 12.2). The
// session is checked on the server, like every other request: a user who is signed out,
// or whose email is no longer allowed, gets 403.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const result = authorizeChannel(
    await getCurrentUser(),
    form?.get("socket_id"),
    form?.get("channel_name"),
  );
  return Response.json(result.body, { status: result.status });
}
