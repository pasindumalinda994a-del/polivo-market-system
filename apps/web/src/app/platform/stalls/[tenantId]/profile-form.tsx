"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle, Button, Input, Label, Textarea } from "@polivo/ui";

export function PlatformStallProfileForm(props: {
  tenantId: string;
  initial: {
    displayName: string;
    timezone: string;
    marketLocation: string;
    contact: string;
    adminNotes: string;
    expectedRevision: number;
  };
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(props.initial.displayName);
  const [timezone, setTimezone] = useState(props.initial.timezone);
  const [marketLocation, setMarketLocation] = useState(props.initial.marketLocation);
  const [contact, setContact] = useState(props.initial.contact);
  const [adminNotes, setAdminNotes] = useState(props.initial.adminNotes);
  const [expectedRevision, setExpectedRevision] = useState(props.initial.expectedRevision);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${encodeURIComponent(props.tenantId)}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          timezone,
          marketLocation: marketLocation || undefined,
          contact: contact || undefined,
          adminNotes,
          expectedRevision,
        }),
      });
      const payload = (await response.json()) as {
        message?: string;
        profileRevision?: number;
      };
      if (!response.ok) {
        setError(payload.message ?? "Unable to save profile.");
        return;
      }
      if (payload.profileRevision) {
        setExpectedRevision(payload.profileRevision);
      }
      router.refresh();
    } catch {
      setError("Unable to save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4 rounded-lg border border-border p-4" onSubmit={onSubmit}>
      <h2 className="text-base font-semibold">Cloud stall profile</h2>
      <p className="text-sm text-muted-foreground">
        Edits apply to cloud profile fields only. Historical bill headers are not rewritten. Status
        and ownership keys cannot be changed here.
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Save failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            maxLength={128}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          <Input
            id="timezone"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            required
            maxLength={64}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="marketLocation">Market / location</Label>
          <Input
            id="marketLocation"
            value={marketLocation}
            onChange={(event) => setMarketLocation(event.target.value)}
            maxLength={256}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact">Contact</Label>
          <Input
            id="contact"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            maxLength={256}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="adminNotes">Administrative notes</Label>
        <Textarea
          id="adminNotes"
          value={adminNotes}
          onChange={(event) => setAdminNotes(event.target.value)}
          maxLength={2000}
          rows={4}
        />
      </div>
      <p className="text-xs text-muted-foreground">Expected revision: {expectedRevision}</p>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
