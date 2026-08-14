import { useEffect, useState } from "react";
import { authedFetch } from "../api/client";

/**
 * An uploaded photo cannot be loaded by <img src> alone.
 *
 * /api/upload/<filename> runs checkAuthorized(), so an unauthenticated GET is a
 * 401 — and an <img> tag has no way to send an Authorization header. The bytes
 * are fetched with the token and handed to the tag as an object URL instead.
 *
 * Imported recipes are the exception: their photo is an absolute URL on the
 * site the recipe came from, which needs no token and should not be proxied
 * through us.
 */
const cache = new Map<string, Promise<string>>();

function loadPhoto(filename: string): Promise<string> {
  const existing = cache.get(filename);
  if (existing) return existing;

  const pending = authedFetch(`/upload/${filename}`)
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.blob();
    })
    .then((blob) => URL.createObjectURL(blob))
    .catch((error) => {
      // A failed load must not be cached, or a photo that was merely missing
      // during a token refresh stays broken until a full reload.
      cache.delete(filename);
      throw error;
    });

  cache.set(filename, pending);
  return pending;
}

interface PhotoProps {
  photo: string | null | undefined;
  alt?: string;
  className?: string;
  /** Rendered instead of the image when there is no photo, or it fails to load. */
  fallback?: React.ReactNode;
}

export function Photo({ photo, alt = "", className, fallback = null }: PhotoProps) {
  const isAbsolute = !!photo && /^https?:\/\//.test(photo);
  const [src, setSrc] = useState<string | null>(isAbsolute ? photo : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!photo || isAbsolute) {
      setSrc(isAbsolute ? photo! : null);
      return;
    }

    let active = true;
    loadPhoto(photo).then(
      (url) => active && setSrc(url),
      () => active && setFailed(true),
    );
    // Object URLs are deliberately not revoked on unmount: they are shared
    // through the cache, so revoking here would break every other card showing
    // the same photo. They live as long as the tab, which for a handful of
    // recipe thumbnails is a fair trade.
    return () => {
      active = false;
    };
  }, [photo, isAbsolute]);

  if (!photo || failed) return <>{fallback}</>;
  if (!src) return <div className={`${className ?? ""} animate-pulse bg-paper-deep`} />;

  return <img src={src} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />;
}
