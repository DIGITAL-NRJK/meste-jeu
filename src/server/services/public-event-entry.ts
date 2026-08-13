export type PublicEventEntry = {
  slug: string;
  name: string;
  status: "READY" | "LIVE";
};

export interface PublicEventEntryRepository {
  findOpenProductionEvent(): Promise<PublicEventEntry | null>;
}

export function getPublicEventEntry(
  repository: PublicEventEntryRepository,
): Promise<PublicEventEntry | null> {
  return repository.findOpenProductionEvent();
}
