"use client";

import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

type Props = {
  locale: string;
  messages: Record<string, unknown>;
  children: ReactNode;
};

export function IntlProvider({ locale, messages, children }: Props) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      onError={() => {}}
      getMessageFallback={({ key }) => key}
    >
      {children}
    </NextIntlClientProvider>
  );
}
