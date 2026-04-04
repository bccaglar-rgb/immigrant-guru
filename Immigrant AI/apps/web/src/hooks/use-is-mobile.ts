"use client";

import { useEffect, useState } from "react";

const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

function getMobileMatch(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const mediaMatch = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  const userAgent = window.navigator.userAgent.toLowerCase();
  const agentMatch =
    /android|iphone|ipod|blackberry|iemobile|opera mini|mobile/.test(userAgent) &&
    !/ipad|tablet/.test(userAgent);

  return mediaMatch || agentMatch;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const update = () => {
      setIsMobile(getMobileMatch());
    };

    update();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
    } else {
      mediaQuery.addListener(update);
    }
    window.addEventListener("orientationchange", update);

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", update);
      } else {
        mediaQuery.removeListener(update);
      }
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return isMobile;
}
