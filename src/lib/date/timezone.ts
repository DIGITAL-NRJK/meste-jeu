const localDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const preferredTimeZones = [
  "Africa/Accra",
  "Africa/Brazzaville",
  "Europe/Paris",
  "UTC",
] as const;

const timeZoneLabels: Record<string, string> = {
  "Africa/Accra": "Africa/Accra — Accra, Ghana",
  "Africa/Brazzaville": "Africa/Brazzaville — Brazzaville, Congo",
  "Europe/Paris": "Europe/Paris — Paris, France",
  UTC: "UTC — Temps universel coordonné",
};

export type TimeZoneOption = {
  value: string;
  label: string;
};

export function getTimeZoneOptions(): TimeZoneOption[] {
  const supported = Intl.supportedValuesOf("timeZone");
  const remaining = supported
    .filter(
      (timeZone) =>
        !preferredTimeZones.includes(
          timeZone as (typeof preferredTimeZones)[number],
        ),
    )
    .sort((left, right) => left.localeCompare(right, "fr"));

  return [...preferredTimeZones, ...remaining].map((timeZone) => ({
    value: timeZone,
    label: timeZoneLabels[timeZone] ?? timeZone.replaceAll("_", " "),
  }));
}

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

export function utcIsoToLocalDateTime(
  value: string,
  timeZone: string,
): string {
  const parts = partsInTimeZone(new Date(value), timeZone);
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}
