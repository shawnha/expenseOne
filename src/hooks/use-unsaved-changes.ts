"use client";

import { useEffect } from "react";

/**
 * Warns users about unsaved changes when they try to close the tab or refresh.
 *
 * Uses the `beforeunload` event to show a native browser confirmation dialog
 * ("저장하지 않은 내용이 있습니다. 페이지를 떠나시겠습니까?").
 *
 * @param isDirty - Whether the form has unsaved changes.
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore custom messages but still show a prompt.
      // Setting returnValue is required for cross-browser compatibility.
      e.returnValue = "저장하지 않은 내용이 있습니다. 페이지를 떠나시겠습니까?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
