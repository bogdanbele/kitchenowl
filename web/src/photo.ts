/**
 * Resolve a recipe photo to something an <img> can load.
 *
 * The field holds one of two things and the API does not distinguish them: a
 * filename uploaded to this server, or an absolute URL left behind by an
 * imported recipe that still points at the original site.
 */
export function photoUrl(photo: string | null | undefined): string | null {
  if (!photo) return null;
  return /^https?:\/\//.test(photo) ? photo : `/api/upload/${photo}`;
}
