import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Config Drift Guard",
  description: "Operator console for deterministic configuration drift workflows.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
