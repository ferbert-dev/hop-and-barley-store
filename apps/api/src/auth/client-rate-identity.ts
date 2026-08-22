type SocketObservedRequest = Readonly<{
  socket: Readonly<{ remoteAddress?: string }>;
}>;

export function clientRateIdentity(request: SocketObservedRequest): string {
  return request.socket.remoteAddress ?? 'unknown';
}
