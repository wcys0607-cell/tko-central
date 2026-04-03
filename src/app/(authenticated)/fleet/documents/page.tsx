"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Redirect to main fleet page (Document Tracker is now the default tab there)
export default function DocumentTrackerRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/fleet");
  }, [router]);
  return null;
}
