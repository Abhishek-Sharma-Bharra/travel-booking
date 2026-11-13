export function chartDomain(
  series: readonly { values: readonly (number | null)[] }[],
) {
  const values = series
    .flatMap((s) => s.values)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!values.length) return { min: 0, max: 1, available: false };
  const min = Math.min(0, ...values),
    max = Math.max(0, ...values);
  return { min, max: max === min ? min + 1 : max, available: true };
}
export function chartSegments(
  values: readonly (number | null)[],
  min: number,
  max: number,
) {
  const segments: { index: number; x: number; y: number; value: number }[][] =
    [];
  let current: (typeof segments)[number] = [];
  values.forEach((v, index) => {
    if (v === null || !Number.isFinite(v)) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push({
      index,
      x: values.length <= 1 ? 380 : 54 + (index * 650) / (values.length - 1),
      y: 210 - ((v - min) / (max - min)) * 178,
      value: v,
    });
  });
  if (current.length) segments.push(current);
  return segments;
}
