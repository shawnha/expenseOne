/** 계획 예정일 앞뒤 30일. 먼 미래 계획은 오늘까지 최근 60일을 보여 준다. */
export function planCardWindow(plannedDate: string, today: string): { from: string; to: string } {
  const shift = (date: string, days: number) =>
    new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  if (plannedDate > shift(today, 30)) return { from: shift(today, -60), to: today };
  const to = [today, shift(plannedDate, 30)].sort()[0];
  const from = [shift(to, -60), shift(plannedDate, -30)].sort()[1];
  return { from, to };
}
