import { splitExpenseNotes } from "@/lib/expense-notes";

export function ExpenseNotes({ value }: { value: string }) {
  return (
    <p className="mt-1 min-w-0 whitespace-pre-wrap break-words text-sm text-[var(--apple-label)] [overflow-wrap:anywhere]">
      {splitExpenseNotes(value).map((part, index) => part.href ? (
        <a
          key={index}
          href={part.href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm text-[var(--apple-blue)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--apple-blue)]"
        >
          {part.text}<span className="sr-only"> (새 탭에서 열기)</span>
        </a>
      ) : <span key={index}>{part.text}</span>)}
    </p>
  );
}
