const localDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function partsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

function timeZoneOffsetMilliseconds(date: Date, timeZone: string): number {
  const parts = partsInTimeZone(date, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return representedAsUtc - date.getTime();
}

export function localDateTimeToUtcIso(
  value: string,
  timeZone: string,
): string {
  const match = localDateTimePattern.exec(value);
  if (!match) throw new RangeError("Invalid local date and time");

  const [, year, month, day, hour, minute, second = "0"] = match;
  const localAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const firstOffset = timeZoneOffsetMilliseconds(
    new Date(localAsUtc),
    timeZone,
  );
  let resolved = new Date(localAsUtc - firstOffset);
  const correctedOffset = timeZoneOffsetMilliseconds(resolved, timeZone);
  resolved = new Date(localAsUtc - correctedOffset);

  const resolvedParts = partsInTimeZone(resolved, timeZone);
  if (
    resolvedParts.year !== Number(year) ||
    resolvedParts.month !== Number(month) ||
    resolvedParts.day !== Number(day) ||
    resolvedParts.hour !== Number(hour) ||
    resolvedParts.minute !== Number(minute) ||
    resolvedParts.second !== Number(second)
  ) {
    throw new RangeError("Local date and time does not exist in this time zone");
  }

  return resolved.toISOString();
}
