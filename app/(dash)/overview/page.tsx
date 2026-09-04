import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Placeholder so the route resolves and the nav is complete. A workspace
 * replaces this whole file — see prompts/round3/. Keep the route path.
 */
export default function Page() {
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>This page is being built. The route exists so the navigation is complete.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Nothing to show yet.</CardContent>
      </Card>
    </div>
  );
}
