import { useEffect, useState } from "react";

// True while the viewport is narrow enough for the tab bar: the phone layout,
// where the editor is one screen and editing a widget is a screen of its own.
export function useNarrow(query = "(max-width: 820px)") {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (event) => setNarrow(event.matches);
    media.addEventListener("change", onChange);
    setNarrow(media.matches);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return narrow;
}
