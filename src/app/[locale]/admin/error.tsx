"use client";

import { ErrorView } from "@/components/error-view";

export default function AdminError(props: { error: unknown; retry: () => void }) {
  return <ErrorView {...props} />;
}
