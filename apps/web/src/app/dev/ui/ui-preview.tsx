"use client";

import { useId, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusIndicator,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
} from "@polivo/ui";

export function UiPreview() {
  const nameId = useId();
  const notesId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [showError, setShowError] = useState(true);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 md:px-8">
      <PageHeader
        title="UI preview"
        description="Demonstration content only. Sample values are not real Polivo records."
      />

      <Alert variant="info">
        <AlertTitle>Development preview</AlertTitle>
        <AlertDescription>
          This route is available only outside production builds. Sinhala sample:{" "}
          <span className="font-sinhala">නිරෝගී එළවළු වෙළඳපොළ</span>
        </AlertDescription>
      </Alert>

      <section className="space-y-3" aria-labelledby="buttons-heading">
        <h2 id="buttons-heading" className="text-xl font-semibold">
          Buttons
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button">Primary</Button>
          <Button type="button" variant="secondary">
            Secondary
          </Button>
          <Button type="button" variant="outline">
            Outline
          </Button>
          <Button type="button" loading>
            Saving
          </Button>
          <Button
            type="button"
            onClick={() => {
              toast("Demonstration notification");
            }}
          >
            Show toast
          </Button>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="form-heading">
        <h2 id="form-heading" className="text-xl font-semibold">
          Form fields
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={nameId}>Farmer name (example)</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              placeholder="Demonstration name"
              aria-invalid={showError && name.length === 0}
              aria-describedby={showError && name.length === 0 ? errorId : undefined}
            />
            {showError && name.length === 0 ? (
              <p id={errorId} className="text-sm text-state-error">
                Enter a demonstration name to clear this sample validation message.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={notesId}>Notes</Label>
            <Textarea id={notesId} placeholder="Demonstration notes" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="preview-check"
              checked={!showError}
              onCheckedChange={(checked) => {
                setShowError(checked !== true);
              }}
            />
            <Label htmlFor="preview-check">Mark validation as resolved</Label>
          </div>
          <div className="space-y-2">
            <Label>Vegetable (example)</Label>
            <Select>
              <SelectTrigger aria-label="Vegetable example">
                <SelectValue placeholder="Choose a sample item" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="carrot">Carrot</SelectItem>
                <SelectItem value="beans">Beans</SelectItem>
                <SelectItem value="leeks">Leeks</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="dialog-heading">
        <h2 id="dialog-heading" className="text-xl font-semibold">
          Dialog
        </h2>
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="outline">
              Open sample dialog
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sample dialog</DialogTitle>
              <DialogDescription>
                Focus moves into this dialog and returns to the trigger when closed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="secondary">
                Close with Escape or the close control
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      <section className="space-y-3" aria-labelledby="status-heading">
        <h2 id="status-heading" className="text-xl font-semibold">
          Status and feedback
        </h2>
        <div className="flex flex-wrap gap-2">
          <StatusIndicator tone="checking" label="Checking" />
          <StatusIndicator tone="available" label="Available" />
          <StatusIndicator tone="unavailable" label="Unavailable" />
          <StatusIndicator tone="pending" label="Pending" />
          <StatusIndicator tone="error" label="Error" />
          <StatusIndicator tone="unknown" label="Unknown" />
        </div>
        <EmptyState
          title="Empty state example"
          description="Long label example: දිගු සිංහල නමක් සහිත ගොවිපල භාණ්ඩ ලැයිස්තුවක්"
        />
        <LoadingState label="Loading demonstration rows" />
        <ErrorState
          title="Sample error"
          description="This is demonstration feedback only."
          onRetry={() => {
            toast("Retry is demonstration-only");
          }}
        />
      </section>

      <section className="space-y-3" aria-labelledby="table-heading">
        <h2 id="table-heading" className="text-xl font-semibold">
          Table (synthetic)
        </h2>
        <TableContainer caption="Demonstration amounts use tabular numerals">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Sinhala label</TableHead>
                <TableHead className="text-numeric">Weight (kg)</TableHead>
                <TableHead className="text-numeric">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Carrot — extra long English description for layout checking</TableCell>
                <TableCell className="font-sinhala">කැරට්</TableCell>
                <TableCell className="text-numeric">12.50</TableCell>
                <TableCell className="text-numeric">3,250.00</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Beans</TableCell>
                <TableCell className="font-sinhala">බෝංචි</TableCell>
                <TableCell className="text-numeric">8.00</TableCell>
                <TableCell className="text-numeric">4,800.00</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </section>
    </div>
  );
}
