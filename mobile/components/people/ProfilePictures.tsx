import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { Image } from "expo-image";

/** Keep decoded images mounted so a tap only changes the visible layer. */
export function ProfilePictures({ photos, index }: { photos: string[]; index: number }) {
  const requested = photos[index] ?? photos[0];
  const [ready, setReady] = useState<string[]>([]);
  const [shown, setShown] = useState<string | undefined>();
  const [failed, setFailed] = useState<string[]>([]);
  const [retries, setRetries] = useState<Record<string, number>>({});
  useEffect(() => {
    if (requested && ready.includes(requested)) setShown(requested);
  }, [requested, ready]);
  useEffect(() => {
    if (!requested || !failed.includes(requested)) return;
    const timer = setTimeout(() => {
      setFailed(previous => previous.filter(uri => uri !== requested));
      setRetries(previous => ({ ...previous, [requested]: (previous[requested] ?? 0) + 1 }));
    }, Math.min(30000, 1200 * 2 ** Math.min(5, retries[requested] ?? 0)));
    return () => clearTimeout(timer);
  }, [requested, failed, retries]);
  const visible = requested && ready.includes(requested) ? requested : shown ?? photos[0];
  return <>{photos.filter(uri => ready.length > 0 || uri === requested || uri === visible).map(uri => (
    <Image key={`${uri}:${retries[uri] ?? 0}`} source={{ uri }} priority={uri === requested ? "high" : "low"}
      style={[StyleSheet.absoluteFill, { opacity: uri === visible ? 1 : 0 }]} contentFit="cover"
      cachePolicy="memory-disk" transition={0} onLoad={() => setReady(old => old.includes(uri) ? old : [...old, uri])}
      onError={() => setFailed(old => old.includes(uri) ? old : [...old, uri])} />
  ))}</>;
}
