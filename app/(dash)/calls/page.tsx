import { listCalls } from "../_data/client";
import { CallsTable } from "./calls-table";
import { RampLegend } from "../_ui/priority";

// The list is the demo surface: a call that just landed has to be on screen.
// Nothing about it may be prerendered.
export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const calls = await listCalls();
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <CallsTable initialCalls={calls} />
      <div className="border-t pt-3">
        <RampLegend />
      </div>
    </div>
  );
}
