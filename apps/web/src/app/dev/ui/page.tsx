import { notFound } from "next/navigation";

import { UiPreview } from "./ui-preview";

export default function DevUiPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <UiPreview />;
}
