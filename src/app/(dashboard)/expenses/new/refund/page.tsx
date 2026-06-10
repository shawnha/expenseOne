import { Suspense } from "react";
import { RefundForm } from "./refund-form";

export default function RefundPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl">
          <div className="h-64 animate-pulse rounded-2xl glass-subtle" />
        </div>
      }
    >
      <RefundForm />
    </Suspense>
  );
}
